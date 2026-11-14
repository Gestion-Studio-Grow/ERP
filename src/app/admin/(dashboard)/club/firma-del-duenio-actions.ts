"use server";

// ============================================================================
// FIRMA DEL DUEÑO DEL CLUB EN EL SERVIDOR (GSG-SEG-020) — el PIN de un dueño se verifica sólo acá.
// ============================================================================
//
// La foto que baja no trae el PIN guardado de los dueños (pin-servidor.ts, `ocultarPinesDeDuenio`). Lo que necesita
// la firma de un dueño pasa por estas acciones:
//   · `firmarComoDuenio`  — verifica el PIN (de un dueño dado, o «¿de qué dueño es?») y devuelve un pase de 120 s;
//   · `codigoParaAprobar` — el celular del dueño pide el código de un pedido (PIN verificado);
//   · `aprobarConCodigo`  — la recepción tipea el código; si es el de un dueño, devuelve un pase de aprobación.
// Guardia `requireAppAccion("club")`; el negocio sale de la sesión; los dueños, de la foto VIGENTE de la base.
// Tope de intentos por negocio en la base (tope-pin-servidor.ts) y, además, uno por instancia (rate-limit).
// Nunca se devuelve ni se registra un PIN, un PIN guardado ni la sal.
//
// — Elaborado por GSG

import { requireAppAccion, AppNoDisponibleError } from "@/lib/require-app";
import { getCurrentTenantId } from "@/lib/tenant";
import { audit } from "@/lib/audit-core";
import { createRateLimiter } from "@/lib/rate-limit";
import { leerVigente } from "@/lib/club/estado-repo";
import { LARGO_PIN, MOTIVO_PIN_VIEJO } from "@/lib/club/motor.mjs";
import {
  VIDA_PASE_MS,
  codigoDeAprobacionServidor,
  esPinFuerte,
  firmarPase,
  hashFuerte,
  huellaDePin,
  normalizarCodigo,
  pinDelDuenioCoincide,
  type UsoDePase,
} from "@/lib/club/pin-servidor";
import { anotarPinFuerte, claveAprobacion, clavePase, conTopeDePin, leerPinesFuertes, type AmbitoDelTope } from "@/lib/club/tope-pin-servidor";

export type RespuestaFirmaDelDuenio =
  | { ok: true; usuarioId: string; nombre: string; pase: string; vence: number }
  | { ok: false; error: string; esperaS?: number; pinViejo?: true };

export type RespuestaCodigoParaAprobar =
  | { ok: true; codigo: string; usuarioId: string; nombre: string; monto: number }
  | { ok: false; error: string; esperaS?: number; pinViejo?: true };

export type RespuestaAprobarConCodigo =
  | { ok: true; usuarioId: string; nombre: string; monto: number; pase: string; vence: number }
  | { ok: false; error: string; esperaS?: number };

interface DuenioGuardado {
  id: string;
  nombre: string;
  pin: string;
  pinLargo?: unknown;
}

interface Contexto {
  userId: string;
  rolErp: string;
  tenantId: string;
  sal: unknown;
  duenios: DuenioGuardado[];
  novedades: { id?: unknown; estado?: unknown; clienteId?: unknown; fecha?: unknown }[];
}

const SIN_FOTO = "Todavía no hay nada guardado del club en la base.";
const PIN_MAL = "PIN incorrecto.";
const MONTO_MAXIMO = 100_000_000;

// Además del tope en la base: por instancia, 20 fallos cada 15 minutos por negocio y ámbito.
const porInstancia = createRateLimiter({ max: 20, windowMs: 15 * 60_000 });

const texto = (x: unknown, tope: number) => (typeof x === "string" && x.length <= tope ? x : null);
const esperaEnCriollo = (s: number) => (s >= 90 ? `${Math.ceil(s / 60)} minutos` : `${s} segundos`);
const mensajeDeEspera = (s: number) => `Demasiados intentos: esperá ${esperaEnCriollo(s)} y probá de nuevo.`;

async function contexto(): Promise<Contexto | { error: string }> {
  let user;
  try {
    user = await requireAppAccion("club");
  } catch (e) {
    if (e instanceof AppNoDisponibleError) return { error: e.message };
    throw e;
  }
  const tenantId = await getCurrentTenantId();
  const vigente = await leerVigente(tenantId);
  if (!vigente) return { error: SIN_FOTO };
  let estado: { usuarios?: unknown; salPin?: unknown; novedades?: unknown } | undefined;
  try {
    estado = (JSON.parse(vigente.texto) as { estado?: typeof estado }).estado;
  } catch {
    estado = undefined;
  }
  if (!estado || !Array.isArray(estado.usuarios)) return { error: "No se pudo leer lo guardado del club: probá de nuevo en un rato." };
  const duenios = (estado.usuarios as Record<string, unknown>[])
    .filter((u) => u && u.rol === "duenio" && u.activo !== false && typeof u.id === "string" && typeof u.pin === "string" && u.pin !== "")
    .map((u) => ({ id: u.id as string, nombre: String(u.nombre ?? ""), pin: u.pin as string, pinLargo: u.pinLargo }));
  return {
    userId: user.id,
    rolErp: user.role,
    tenantId,
    sal: estado.salPin,
    duenios,
    novedades: Array.isArray(estado.novedades) ? (estado.novedades as Contexto["novedades"]) : [],
  };
}

function auditar(c: Pick<Contexto, "userId" | "rolErp">, uso: UsoDePase | "codigo", resultado: "ok" | "rechazo", codigo?: string, usuarioClub?: string | null) {
  return audit({
    actor: `user:${c.userId}`,
    action: `club_firma_duenio:${resultado}`,
    entity: "ClubUsuario",
    entityId: usuarioClub ?? null,
    changes: { uso, resultado, ...(codigo ? { codigo } : {}), rolErp: c.rolErp },
    channel: "admin",
  });
}

/** Cuántos números tiene el PIN guardado de un dueño (de `pinLargo`, o del texto si está en claro). */
function largoDe(d: DuenioGuardado): number {
  const n = Number(d.pinLargo);
  if (Number.isInteger(n) && n > 0) return n;
  return d.pin.startsWith("h1:") || esPinFuerte(d.pin) ? 0 : d.pin.length;
}

/** Deja anotado el h2 de un PIN guardado que todavía no lo es (lo aplica el próximo guardado de la foto). */
async function fortalecer(tenantId: string, d: DuenioGuardado, pin: string): Promise<void> {
  if (esPinFuerte(d.pin)) return;
  try {
    const de = huellaDePin(d.pin);
    const ya = (await leerPinesFuertes(tenantId)).get(d.id);
    if (ya?.de === de) return;
    await anotarPinFuerte(tenantId, d.id, de, hashFuerte(pin));
  } catch (e) {
    // No frena la firma: el PIN sigue como estaba y se reintenta en la próxima.
    console.warn("[club] SEG-020: no se pudo anotar el PIN fuerte", { tenantId, usuarioClub: d.id, error: e instanceof Error ? e.message : "?" });
  }
}

type Verificado = { ok: true; duenio: DuenioGuardado } | { ok: false; error: string; esperaS?: number; pinViejo?: true; codigo: string };

/**
 * El PIN de un dueño (o de cualquiera, sin `usuarioId`), con tope: un intento contado por pedido. Un dueño con el PIN
 * del largo viejo no firma (`pinViejo`), como `verificarFirma` del motor.
 */
async function verificarDuenio(c: Contexto, usuarioId: string | null, pin: string): Promise<Verificado> {
  if (!/^\d{2,8}$/.test(pin.trim())) return { ok: false, error: "Poné tu PIN.", codigo: "datos" };
  const candidatos = usuarioId ? c.duenios.filter((d) => d.id === usuarioId) : c.duenios;
  if (usuarioId && !candidatos.length) return { ok: false, error: "Ese usuario no es dueño o todavía no tiene PIN.", codigo: "usuario" };
  const r = await conPorInstancia(c.tenantId, "pin", () =>
    conTopeDePin(c.tenantId, "pin", () => {
      const hit = candidatos.find((d) => pinDelDuenioCoincide(d.pin, pin, c.sal));
      return { ok: !!hit, duenio: !!hit, hit };
    }),
  );
  if ("limitado" in r) return { ok: false, error: mensajeDeEspera(r.esperaS), esperaS: r.esperaS, codigo: "espera" };
  if (r.espera) return { ok: false, error: mensajeDeEspera(r.esperaS), esperaS: r.esperaS, codigo: "espera" };
  if (!r.resultado.hit) return { ok: false, error: r.esperaS ? mensajeDeEspera(r.esperaS) : PIN_MAL, ...(r.esperaS ? { esperaS: r.esperaS } : {}), codigo: "pin" };
  const d = r.resultado.hit;
  if (largoDe(d) !== LARGO_PIN.duenio) return { ok: false, error: MOTIVO_PIN_VIEJO, pinViejo: true, codigo: "pin-viejo" };
  await fortalecer(c.tenantId, d, pin);
  return { ok: true, duenio: d };
}

/** El tope por instancia: no llama a la base si esta instancia ya vio demasiados fallos del negocio. */
async function conPorInstancia<T extends { espera: boolean; resultado?: { ok: boolean } }>(
  tenantId: string,
  ambito: AmbitoDelTope,
  fn: () => Promise<T>,
): Promise<T | { limitado: true; esperaS: number }> {
  const clave = `${tenantId}:${ambito}`;
  if (porInstancia.blocked(clave)) return { limitado: true, esperaS: Math.max(1, Math.ceil(porInstancia.retryAfterMs(clave) / 1000)) };
  const r = await fn();
  if (!r.espera && r.resultado) {
    if (r.resultado.ok) porInstancia.reset(clave);
    else porInstancia.fail(clave);
  }
  return r;
}

const pasePara = (tenantId: string, usuarioId: string, uso: UsoDePase) => {
  const vence = Date.now() + VIDA_PASE_MS;
  return { pase: firmarPase({ tenantId, usuarioId, uso, exp: vence }, clavePase()), vence };
};

/** La firma de un dueño: su PIN, verificado acá. Sin `usuarioId`, «¿de qué dueño es este PIN?» (un intento). */
export async function firmarComoDuenio(pedido: { usuarioId?: unknown; pin: unknown }): Promise<RespuestaFirmaDelDuenio> {
  const c = await contexto();
  if ("error" in c) return { ok: false, error: c.error };
  const usuarioId = pedido?.usuarioId === undefined || pedido?.usuarioId === null ? null : texto(pedido.usuarioId, 60);
  const pin = texto(pedido?.pin, 16);
  if (pin === null || (pedido?.usuarioId != null && usuarioId === null)) {
    await auditar(c, "firma", "rechazo", "datos");
    return { ok: false, error: "Faltan datos para firmar." };
  }
  const v = await verificarDuenio(c, usuarioId, pin);
  if (!v.ok) {
    await auditar(c, "firma", "rechazo", v.codigo, usuarioId);
    return { ok: false, error: v.error, ...(v.esperaS ? { esperaS: v.esperaS } : {}), ...(v.pinViejo ? { pinViejo: true as const } : {}) };
  }
  await auditar(c, "firma", "ok", undefined, v.duenio.id);
  return { ok: true, usuarioId: v.duenio.id, nombre: v.duenio.nombre, ...pasePara(c.tenantId, v.duenio.id, "firma") };
}

function novedadPendiente(c: Contexto, novedadId: string | null) {
  const n = c.novedades.find((x) => x && x.id === novedadId && x.estado === "pendiente");
  return n && typeof n.clienteId === "string" ? { id: novedadId as string, clienteId: n.clienteId, fecha: typeof n.fecha === "string" ? n.fecha : null } : null;
}

const montoValido = (x: unknown) => {
  const m = Math.round(Number(x));
  return Number.isFinite(m) && m > 0 && m <= MONTO_MAXIMO ? m : null;
};

/** El celular del dueño: con su PIN y el monto que aprueba, el código del pedido para mandar por WhatsApp. */
export async function codigoParaAprobar(pedido: { novedadId: unknown; pin: unknown; monto: unknown; usuarioId?: unknown }): Promise<RespuestaCodigoParaAprobar> {
  const c = await contexto();
  if ("error" in c) return { ok: false, error: c.error };
  const n = novedadPendiente(c, texto(pedido?.novedadId, 60));
  if (!n) return { ok: false, error: "Ese pedido ya se resolvió." };
  const monto = montoValido(pedido?.monto);
  if (monto === null) return { ok: false, error: "Poné el monto que aprobás." };
  const usuarioId = pedido?.usuarioId == null ? null : texto(pedido.usuarioId, 60);
  const pin = texto(pedido?.pin, 16);
  if (pin === null || (pedido?.usuarioId != null && usuarioId === null)) return { ok: false, error: "Faltan datos para aprobar." };
  const v = await verificarDuenio(c, usuarioId, pin);
  if (!v.ok) {
    await auditar(c, "aprobacion", "rechazo", v.codigo, usuarioId);
    return { ok: false, error: v.error, ...(v.esperaS ? { esperaS: v.esperaS } : {}), ...(v.pinViejo ? { pinViejo: true as const } : {}) };
  }
  const codigo = codigoDeAprobacionServidor({ tenantId: c.tenantId, usuarioId: v.duenio.id, novedadId: n.id, clienteId: n.clienteId, monto, fecha: n.fecha }, claveAprobacion());
  await auditar(c, "aprobacion", "ok", "codigo-emitido", v.duenio.id);
  return { ok: true, codigo, usuarioId: v.duenio.id, nombre: v.duenio.nombre, monto };
}

/** La recepción tipea el código que le mandó el dueño: si es el de un dueño para ESTE pedido y ESTE monto, pase. */
export async function aprobarConCodigo(pedido: { novedadId: unknown; codigo: unknown; monto: unknown }): Promise<RespuestaAprobarConCodigo> {
  const c = await contexto();
  if ("error" in c) return { ok: false, error: c.error };
  const n = novedadPendiente(c, texto(pedido?.novedadId, 60));
  if (!n) return { ok: false, error: "Ese pedido ya se resolvió." };
  const monto = montoValido(pedido?.monto);
  if (monto === null) return { ok: false, error: "Poné el monto que aprobó el dueño." };
  const tipeado = normalizarCodigo(texto(pedido?.codigo, 20) ?? "");
  if (tipeado.length !== 6) return { ok: false, error: "El código tiene 6 letras y números (ej. ABC-DEF)." };
  const clave = claveAprobacion();
  const r = await conPorInstancia(c.tenantId, "codigo", () =>
    conTopeDePin(c.tenantId, "codigo", () => {
      const hit = c.duenios.find((d) => {
        const esperado = normalizarCodigo(codigoDeAprobacionServidor({ tenantId: c.tenantId, usuarioId: d.id, novedadId: n.id, clienteId: n.clienteId, monto, fecha: n.fecha }, clave));
        return esperado === tipeado;
      });
      return { ok: !!hit, duenio: !!hit, hit };
    }),
  );
  if ("limitado" in r || r.espera) {
    await auditar(c, "codigo", "rechazo", "espera");
    return { ok: false, error: mensajeDeEspera(r.esperaS), esperaS: r.esperaS };
  }
  const d = r.resultado.hit;
  if (!d) {
    await auditar(c, "codigo", "rechazo", "codigo");
    const base = "Ese código no sirve para este pedido y este monto. Fijate el monto que aprobó el dueño.";
    return { ok: false, error: r.esperaS ? mensajeDeEspera(r.esperaS) : base, ...(r.esperaS ? { esperaS: r.esperaS } : {}) };
  }
  await auditar(c, "aprobacion", "ok", "codigo", d.id);
  return { ok: true, usuarioId: d.id, nombre: d.nombre, monto, ...pasePara(c.tenantId, d.id, "aprobacion") };
}
