// ============================================================================
// LA FIRMA DEL DUEÑO EN EL EQUIPO (GSG-SEG-020, cliente) — el PIN de un dueño lo confirma el servidor.
// ============================================================================
//
// En la jornada real, la foto trae el PIN de cada dueño como la marca `srv:` (motor.mjs, `esPinEnServidor`): el equipo
// no lo tiene. Antes de correr algo que firma un dueño, la pantalla pasa el PIN tipeado por `conFirmaDelDuenio`:
//   · si ningún PIN es de un dueño con la marca (la demo, la recepción), corre como siempre, en el momento;
//   · si lo es, lo manda a `firmarComoDuenio` (puerta-del-pin.ts) y, con el pase, el motor lo acepta por un rato
//     (`fijarVerificadorDelServidor`). Una re-aplicación de la cola sin pase vigente, el motor la rechaza;
//   · sin conexión (o con la llamada caída): «Para firmar como dueño hace falta conexión.» y NO corre ni se encola;
//   · si el servidor pide esperar o el PIN es el viejo, manda el servidor: no corre. Un PIN que no es, corre igual
//     para que el motor lo rechace y sume al tope del equipo (tope-de-pin.ts).
// El código de aprobación de un pedido sigue el mismo camino (`confirmarCodigoDelDuenio` → `aprobarConCodigo`).
//
// — Elaborado por GSG

import { esPinEnServidor, fijarVerificadorDelServidor, pinAceptadoPara, usuario as usuarioDe, usuarioPorPin } from "@/lib/club/motor.mjs";
import type { EstadoClub } from "@/lib/club/motor.mjs";
import { puertaDeLaFirma } from "./puerta-del-pin";

export const SIN_CONEXION_PARA_FIRMAR = "Para firmar como dueño hace falta conexión.";
/**
 * Cuánto vale en este equipo lo que confirmó el servidor: un poco menos que el pase (120 s, pin-servidor.ts), contado
 * con el reloj de acá (el `vence` del servidor puede venir corrido).
 */
export const VIDA_DEL_PASE_EN_EL_EQUIPO_MS = 110_000;

const pases = new Map<string, { pin: string; vence: number }>();
const codigos = new Map<string, { usuarioId: string; vence: number }>();
let reloj = () => Date.now();

const claveDeCodigo = (novedadId: string, codigo: string, monto: number) => `${novedadId}|${codigo}|${monto}`;
const normalizar = (c: string) => c.toUpperCase().replace(/[^A-Z0-9]/g, "");

fijarVerificadorDelServidor({
  pin: (usuarioId, pin) => {
    const p = pases.get(usuarioId);
    return !!p && p.pin === pin && reloj() < p.vence;
  },
  codigo: ({ usuarioId, novedadId, codigo, monto }) => {
    const c = codigos.get(claveDeCodigo(novedadId, codigo, monto));
    return !!c && c.usuarioId === usuarioId && reloj() < c.vence;
  },
});

/** Sólo pruebas: el reloj de los pases. */
export function fijarRelojDeLaFirma(f: (() => number) | null): void {
  reloj = f ?? (() => Date.now());
}

/** Olvida lo confirmado (al bloquear, o en pruebas). */
export function olvidarFirmasDelDuenio(): void {
  pases.clear();
  codigos.clear();
}

const hayConexion = () => (globalThis as { navigator?: { onLine?: boolean } }).navigator?.onLine !== false;
const hayDueniosEnServidor = (estado: EstadoClub) => estado.usuarios.some((u) => u.activo !== false && esPinEnServidor(u.pin));

/** Un PIN tipeado y, si se sabe, de quién tiene que ser (si no, el servidor busca de qué dueño es). */
export interface PinParaFirmar {
  usuarioId?: string | null;
  pin: string | null | undefined;
}

/** ¿Este PIN necesita al servidor? Sólo si puede ser de un dueño con el PIN en el servidor. */
export function pideAlServidor(estado: EstadoClub, { usuarioId, pin }: PinParaFirmar): boolean {
  const p = String(pin ?? "").trim();
  if (!p) return false;
  if (usuarioId) {
    const u = usuarioDe(estado, usuarioId);
    return !!u && u.activo !== false && esPinEnServidor(u.pin);
  }
  if (!hayDueniosEnServidor(estado) || !pinAceptadoPara("duenio", p)) return false;
  // Si es el de alguien que se verifica acá (la recepción), no va al servidor.
  const local = usuarioPorPin(estado, p);
  return !(local?.ok && !esPinEnServidor(local.usuario.pin));
}

/** `corta`: no se corre (sin conexión, espera del servidor, PIN viejo). Si no corta, el motor decide. */
export type ResultadoDeLaFirma = { ok: true } | { ok: false; corta: boolean; mensaje: string; esperaS?: number };

const sinConexion = (): ResultadoDeLaFirma => ({ ok: false, corta: true, mensaje: SIN_CONEXION_PARA_FIRMAR });

async function firmarUno(estado: EstadoClub, f: PinParaFirmar): Promise<ResultadoDeLaFirma> {
  const pin = String(f.pin ?? "").trim();
  const puerta = puertaDeLaFirma();
  if (!puerta || !hayConexion()) return sinConexion();
  let r: Awaited<ReturnType<typeof puerta.firmar>>;
  try {
    r = await puerta.firmar(f.usuarioId ? { usuarioId: f.usuarioId, pin } : { pin });
  } catch {
    return sinConexion();
  }
  if (!r || typeof r !== "object") return sinConexion();
  if (r.ok) {
    // Sólo vale para el dueño de la foto de este equipo.
    if (!usuarioDe(estado, r.usuarioId)) return { ok: false, corta: false, mensaje: "PIN incorrecto." };
    pases.set(r.usuarioId, { pin, vence: reloj() + VIDA_DEL_PASE_EN_EL_EQUIPO_MS });
    return { ok: true };
  }
  const corta = !!r.esperaS || !!r.pinViejo;
  return { ok: false, corta, mensaje: String(r.error ?? "PIN incorrecto."), ...(r.esperaS ? { esperaS: r.esperaS } : {}) };
}

/**
 * Confirma en el servidor los PIN que lo necesitan. null: ninguno lo necesita (se sigue en el momento). Si no, una
 * promesa con lo que pasó (el primero que no pasa).
 */
export function firmarConElServidor(estado: EstadoClub, firmas: readonly PinParaFirmar[]): Promise<ResultadoDeLaFirma> | null {
  const hacen = firmas.filter((f) => pideAlServidor(estado, f));
  if (!hacen.length) return null;
  return (async () => {
    for (const f of hacen) {
      const r = await firmarUno(estado, f);
      if (!r.ok) return r;
    }
    return { ok: true } as const;
  })();
}

interface ConAvisos {
  estado(): EstadoClub;
  informar(d: { ok: boolean; mensaje: string }): void;
}

/**
 * Corre `correr` (lo que firma) después de confirmar los PIN de dueño en el servidor. Sin nada que confirmar corre en
 * el momento y devuelve lo que dio. Si hay que confirmar, devuelve undefined y corre después (o no, si corta: el aviso
 * va a `alCortar` o, si no hay, a los avisos del club). `alTerminar` recibe lo que dio, en los dos casos.
 */
export function conFirmaDelDuenio<T>(
  almacen: ConAvisos,
  firmas: readonly PinParaFirmar[],
  correr: () => T,
  alTerminar?: (r: T) => void,
  alCortar?: (mensaje: string) => void,
): T | undefined {
  const espera = firmarConElServidor(almacen.estado(), firmas);
  if (espera === null) {
    const r = correr();
    alTerminar?.(r);
    return r;
  }
  void espera.then((f) => {
    if (!f.ok && f.corta) {
      if (alCortar) alCortar(f.mensaje);
      else almacen.informar({ ok: false, mensaje: f.mensaje });
      return;
    }
    const r = correr();
    alTerminar?.(r);
  });
  return undefined;
}

/** El PIN tipeado en una acción (`{ pin, firmaId? }`): de quién tiene que ser, si lo dice. */
export const pinDeLaAccion = (a: { pin?: string | null; firmaId?: string | null } | null | undefined): PinParaFirmar[] =>
  a && typeof a.pin === "string" && a.pin.trim() ? [{ usuarioId: a.firmaId ?? null, pin: a.pin }] : [];

/**
 * La recepción tipea el código que mandó el dueño. Si en el club hay dueños con el PIN en el servidor, el código lo
 * valida `aprobarConCodigo` y, si es el de uno, el motor lo acepta (para ESTE pedido y ESTE monto). null: no hace falta.
 */
export function confirmarCodigoDelDuenio(
  estado: EstadoClub,
  { novedadId, codigo, monto: aprobado }: { novedadId: string; codigo: string; monto?: number | null },
): Promise<ResultadoDeLaFirma> | null {
  const n = estado.novedades.find((x) => x.id === novedadId && x.estado === "pendiente");
  const tipeado = normalizar(String(codigo ?? ""));
  if (!n || tipeado.length !== 6 || !hayDueniosEnServidor(estado)) return null;
  // El monto que aprobó el dueño (si se tipeó) o el del pedido: el mismo que mira el motor (`aprobarPorCodigo`).
  const monto = Math.round(Number(aprobado ?? n.monto));
  return (async () => {
    const puerta = puertaDeLaFirma();
    if (!puerta || !hayConexion()) return { ok: false, corta: true, mensaje: "Para validar el código del dueño hace falta conexión." };
    try {
      const r = await puerta.aprobarConCodigo({ novedadId, codigo: tipeado, monto });
      if (r?.ok) {
        codigos.set(claveDeCodigo(novedadId, tipeado, monto), { usuarioId: r.usuarioId, vence: reloj() + VIDA_DEL_PASE_EN_EL_EQUIPO_MS });
        return { ok: true };
      }
      // Un código que no es, sigue al motor (cuenta sus intentos del pedido); una espera del servidor, corta.
      return { ok: false, corta: !!r?.esperaS, mensaje: String(r?.error ?? "Ese código no sirve."), ...(r?.esperaS ? { esperaS: r.esperaS } : {}) };
    } catch {
      return { ok: false, corta: true, mensaje: "Para validar el código del dueño hace falta conexión." };
    }
  })();
}

/** Lo que da algo que puede necesitar al servidor: en el momento o, si hubo que confirmar un PIN, después. */
export type EnElMomentoOLuego<T> = T | Promise<T>;

/** Sigue con lo que dio, en el momento si ya está (así lo de siempre no cambia de ritmo). */
export function luego<T>(x: EnElMomentoOLuego<T>, seguir: (r: T) => void): void {
  if (x instanceof Promise) void x.then(seguir);
  else seguir(x);
}

/**
 * Como `conFirmaDelDuenio`, devolviendo lo que dio: en el momento si no hubo que confirmar nada; si no, una promesa
 * que da lo que dio `correr` o `siCorta` (no se corrió: el aviso ya salió).
 */
export function firmado<T>(almacen: ConAvisos, firmas: readonly PinParaFirmar[], correr: () => T, siCorta: T, alCortar?: (mensaje: string) => void): EnElMomentoOLuego<T> {
  const espera = firmarConElServidor(almacen.estado(), firmas);
  if (espera === null) return correr();
  return espera.then((f) => {
    if (!f.ok && f.corta) {
      if (alCortar) alCortar(f.mensaje);
      else almacen.informar({ ok: false, mensaje: f.mensaje });
      return siCorta;
    }
    return correr();
  });
}

/** Como `firmado`, para el código del dueño que tipea la recepción (`confirmarCodigoDelDuenio`). */
export function conCodigoDelDuenio<T>(
  almacen: ConAvisos,
  pedido: { novedadId: string; codigo: string; monto?: number | null },
  correr: () => T,
  siCorta: T,
): EnElMomentoOLuego<T> {
  const espera = confirmarCodigoDelDuenio(almacen.estado(), pedido);
  if (espera === null) return correr();
  return espera.then((f) => {
    if (!f.ok && f.corta) {
      almacen.informar({ ok: false, mensaje: f.mensaje });
      return siCorta;
    }
    return correr();
  });
}
