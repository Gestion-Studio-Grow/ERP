// ============================================================================
// MANTENIMIENTO GSG — despacho de un ticket a una sesión de Claude (MANT-004, diseño §15.2, §15.3, §15.5).
// ============================================================================
//
// Un DESPACHO es «este ticket, a este nivel (n1|n2), una vez». Sin tabla nueva: vive en eventos de
// `SupportTicketEvento` con tipo `despacho:<nivel>:<estado>` y datos `{ despachoId, … }`:
//
//   pendiente ──(se reclama: se guarda la HUELLA del nonce, nunca el nonce)──► disparado
//   disparado ──(borrador_ia del agente de ese nivel)──► listo        (lo cierra la misma tx del borrador)
//   disparado ──(30 min sin borrador)──► vencido
//   pendiente ──(falla del /fire: reintento a 1, 5 y 15 min; después)──► fallido + aviso
//
// «listo» se DEDUCE del evento `borrador_ia` que escribe el agente (rol gsg_agente) en la misma
// transacción del borrador: el candado de la base (MANT_roles_soporte.sql) sólo le deja escribir ese
// tipo de evento, y así el cierre es atómico sin tocar el SQL. Después, la consola deja además el
// evento `despacho:<nivel>:listo` para las métricas del §15.4; si no llegara, el estado igual es listo.
//
// Lo de acá es PURO (salvo el azar del nonce y `fetch` inyectado). Lo prueba despacho-core.test.ts.
// (design-lint: lógica de servidor sin interfaz; `Buffer.from(` no es movimiento, prefers-reduced-motion no aplica.)

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { ESTADOS_ABIERTOS } from "./config";
import { quienApruebaElBorrador } from "./agentes-permisos";
import { taparSecretos } from "./canales-core";
import { textoParaLaIa } from "./tickets-core";

export const NIVELES_DE_DESPACHO = ["n1", "n2"] as const;
export type NivelDeDespacho = (typeof NIVELES_DE_DESPACHO)[number];
export const ESTADOS_DE_DESPACHO = ["pendiente", "disparado", "listo", "vencido", "fallido"] as const;
export type EstadoDeDespacho = (typeof ESTADOS_DE_DESPACHO)[number];
export const ESTADOS_ABIERTOS_DE_DESPACHO: readonly EstadoDeDespacho[] = ["pendiente", "disparado"];

export const MODOS_DEL_MOTOR = ["apagado", "manual", "automatico"] as const;
export type ModoDelMotor = (typeof MODOS_DEL_MOTOR)[number];

/** Reintentos del /fire, en minutos desde la falla (provisional, §15.3). */
export const REINTENTOS_MIN = [1, 5, 15] as const;
/** Un despacho disparado sin borrador vence a los 30 min (provisional: se ajusta con la latencia medida). */
export const VENCE_MIN = 30;
/** La credencial del agente sólo abre un despacho disparado hace menos de 2 h (provisional, §15.5). */
export const VENTANA_DEL_AGENTE_MIN = 120;
/** Tope de llamadas autenticadas de la sesión por despacho (provisional a confirmar). */
export const TOPE_DE_LLAMADAS_POR_DESPACHO = 20;

/** Vista previa de investigación: el header puede cambiar. Se revisa en la revisión semanal (§15.2). */
export const BETA_DE_RUTINAS = "experimental-cc-routine-2026-04-01";
export const VERSION_DE_ANTHROPIC = "2023-06-01";
export const HOST_DE_RUTINAS = "api.anthropic.com";
/** El header con el que la sesión devuelve el nonce del disparo. */
export const HEADER_DEL_NONCE = "x-mant-despacho";

export const AVISO_SIN_IA = "La IA no está disponible para este ticket: respondé a mano.";

const MIN = 60_000;
const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,62})$/;
const REF = /^([a-z0-9](?:[a-z0-9-]{0,62}))#([1-9]\d{0,8})$/;
const esNivel = (x: unknown): x is NivelDeDespacho => typeof x === "string" && (NIVELES_DE_DESPACHO as readonly string[]).includes(x);

export const tipoDeEvento = (nivel: NivelDeDespacho, estado: EstadoDeDespacho) => `despacho:${nivel}:${estado}`;

/** `despacho:n1:listo` → { nivel, estado }; cualquier otra cosa → null. PURA. */
export function leerTipoDeEvento(tipo: string): { nivel: NivelDeDespacho; estado: EstadoDeDespacho } | null {
  const [p, nivel, estado, ...resto] = tipo.split(":");
  if (p !== "despacho" || resto.length || !esNivel(nivel) || !(ESTADOS_DE_DESPACHO as readonly string[]).includes(estado)) return null;
  return { nivel, estado: estado as EstadoDeDespacho };
}

/** El interruptor `MANT_MOTOR`. Sin valor o con uno desconocido: apagado (todo a humanos). PURA. */
export function modoDelMotor(env: Record<string, string | undefined>): { modo: ModoDelMotor; motivo: string } {
  const v = env.MANT_MOTOR?.trim().toLowerCase() ?? "";
  if (!v) return { modo: "apagado", motivo: "MANT_MOTOR sin cargar: el soporte lo atienden personas." };
  if ((MODOS_DEL_MOTOR as readonly string[]).includes(v)) return { modo: v as ModoDelMotor, motivo: `MANT_MOTOR=${v}.` };
  return { modo: "apagado", motivo: `MANT_MOTOR con un valor desconocido («${v.slice(0, 20)}»): apagado.` };
}

/** La tarea de Claude de un nivel, o por qué está apagada. Sólo https://api.anthropic.com/…/fire. PURA. */
export function rutinaDelNivel(env: Record<string, string | undefined>, nivel: NivelDeDespacho): { ok: true; url: string; token: string } | { ok: false; motivo: string } {
  const N = nivel.toUpperCase();
  const url = env[`MANT_RUTINA_${N}_URL`]?.trim();
  const token = env[`MANT_RUTINA_${N}_TOKEN`]?.trim();
  if (!url) return { ok: false, motivo: `Falta MANT_RUTINA_${N}_URL: el despacho ${nivel} está apagado.` };
  if (!token) return { ok: false, motivo: `Falta MANT_RUTINA_${N}_TOKEN: el despacho ${nivel} está apagado.` };
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return { ok: false, motivo: `MANT_RUTINA_${N}_URL no es una URL: apagado.` };
  }
  if (u.protocol !== "https:" || u.hostname !== HOST_DE_RUTINAS || !/^\/v1\/claude_code\/routines\/[^/]+\/fire$/.test(u.pathname)) {
    return { ok: false, motivo: `MANT_RUTINA_${N}_URL no es el /fire de ${HOST_DE_RUTINAS}: apagado (el token no sale a otro lado).` };
  }
  return { ok: true, url, token };
}

/**
 * ¿Se despacha este ticket? `slugs` = el negocio del ticket y, si es de cartera, el del cliente. `automatico`
 * sólo dispara n1 al entrar el ticket; n2 lo pide siempre una persona («manual»). CH o un negocio sin slug →
 * no (D5: lo atiende una persona). Ticket resuelto/cerrado → no. Sin permiso n1 (y n2 para n2) → no. PURA.
 */
export function puedeDespachar(p: {
  modo: ModoDelMotor;
  origen: "manual" | "automatico";
  nivel: NivelDeDespacho;
  slugs: readonly (string | null | undefined)[];
  estadoTicket: string;
  permiso: { n1: boolean; n2: boolean };
}): { puede: boolean; motivo: string } {
  if (!esNivel(p.nivel)) return { puede: false, motivo: "Nivel sin despacho (sólo n1 y n2)." };
  if (p.modo === "apagado") return { puede: false, motivo: "MANT_MOTOR apagado: lo atiende una persona." };
  if (p.origen === "automatico" && (p.modo !== "automatico" || p.nivel !== "n1")) {
    return { puede: false, motivo: "Al entrar sólo se despacha n1 y con MANT_MOTOR=automatico." };
  }
  if (!p.slugs.length || p.slugs.some((s) => quienApruebaElBorrador(s) === "duenio")) {
    return { puede: false, motivo: "Es CH o no se sabe de qué negocio es: lo atiende una persona (D5)." };
  }
  if (!(ESTADOS_ABIERTOS as readonly string[]).includes(p.estadoTicket)) return { puede: false, motivo: "El ticket ya está resuelto o cerrado." };
  if (!p.permiso.n1) return { puede: false, motivo: "Sin el permiso n1 del titular: lo atiende una persona." };
  if (p.nivel === "n2" && !p.permiso.n2) return { puede: false, motivo: "Sin el permiso n2 del titular: no se despacha n2." };
  return { puede: true, motivo: "Se despacha." };
}

/** Un nonce de 24 bytes al azar (32 caracteres base64url). */
export const nonceNuevo = () => randomBytes(24).toString("base64url");
/** Lo único que se guarda del nonce. PURA. */
export const huellaDelNonce = (nonce: string) => createHash("sha256").update(nonce, "utf8").digest("hex");

/** El `text` del disparo: `mant <nivel> <slug>#<n> d=<nonce>`. Nunca datos del cliente. PURA. */
export function textoDelDisparo(nivel: NivelDeDespacho, slug: string, numero: number, nonce: string): string {
  if (!esNivel(nivel) || !SLUG.test(slug) || !Number.isInteger(numero) || numero < 1 || !/^[A-Za-z0-9_-]{16,64}$/.test(nonce)) {
    throw new Error("textoDelDisparo: datos inválidos.");
  }
  return `mant ${nivel} ${slug}#${numero} d=${nonce}`;
}

export interface EventoCrudo {
  tipo: string;
  actor: string;
  datos: unknown;
  createdAt: Date;
}

export interface Despacho {
  id: string;
  nivel: NivelDeDespacho;
  estado: EstadoDeDespacho;
  /** Intentos de /fire hechos. */
  intento: number;
  proximoEn: Date | null;
  creadoEn: Date;
  disparadoEn: Date | null;
  nonceHash: string | null;
  sesionId: string | null;
  sesionUrl: string | null;
  clienteTenantId: string | null;
  prioridad: string;
}

const texto = (x: unknown) => (typeof x === "string" && x ? x : null);
const fecha = (x: unknown, otra: Date) => {
  const d = typeof x === "string" ? new Date(x) : null;
  return d && !Number.isNaN(d.getTime()) ? d : otra;
};

/**
 * El despacho vigente (el último) de un ticket para un nivel, a partir de sus eventos. Los terminales
 * (listo, vencido, fallido) no se reabren: un evento tardío del mismo despacho (la sesión que llega
 * después del borrador) sólo suma datos. Un `borrador_ia` del agente de ESE nivel posterior al disparo
 * lo deja listo. Eventos rotos se ignoran. PURA.
 */
export function despachoActual(eventos: readonly EventoCrudo[], nivel: NivelDeDespacho): Despacho | null {
  const orden = [...eventos].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  let d = null as Despacho | null;
  for (const e of orden) {
    if (e.tipo === "borrador_ia") {
      if (d?.estado === "disparado" && e.actor === `agente:${nivel}`) d = { ...d, estado: "listo" };
      continue;
    }
    const t = leerTipoDeEvento(e.tipo);
    if (!t || t.nivel !== nivel) continue;
    const x = (typeof e.datos === "object" && e.datos !== null ? e.datos : {}) as Record<string, unknown>;
    const id = texto(x.despachoId);
    if (!id) continue;
    const el = fecha(x.el, e.createdAt);
    if (!d || d.id !== id) {
      if (t.estado !== "pendiente") continue; // un despacho empieza siempre pendiente
      d = {
        id, nivel, estado: "pendiente", intento: 0, proximoEn: null, creadoEn: el, disparadoEn: null, nonceHash: null,
        sesionId: null, sesionUrl: null, clienteTenantId: texto(x.clienteTenantId), prioridad: texto(x.prioridad) ?? "P3",
      };
    }
    const abierto: boolean = (ESTADOS_ABIERTOS_DE_DESPACHO as readonly string[]).includes(d.estado);
    const sig: Despacho = { ...d };
    if (typeof x.intento === "number" && Number.isInteger(x.intento) && x.intento >= 0) sig.intento = x.intento;
    if (texto(x.sesionId)) sig.sesionId = texto(x.sesionId);
    if (texto(x.sesionUrl)) sig.sesionUrl = texto(x.sesionUrl);
    if (abierto) {
      if (t.estado === "pendiente") {
        sig.estado = "pendiente";
        sig.proximoEn = fecha(x.proximoEn, el);
        sig.disparadoEn = null;
        sig.nonceHash = null;
      } else if (t.estado === "disparado") {
        if (d.estado === "pendiente") {
          sig.disparadoEn = el;
          sig.nonceHash = texto(x.nonceHash);
          sig.proximoEn = null;
        }
        sig.estado = "disparado";
      } else {
        sig.estado = t.estado;
      }
    }
    d = sig;
  }
  return d;
}

/** Qué hacer con un despacho cuando falla el /fire. `intentosHechos` cuenta el que acaba de fallar. PURA. */
export function siguienteTrasFalla(p: { intentosHechos: number; reintentable: boolean; prioridad: string; ahora: Date }):
  | { estado: "pendiente"; proximoEn: Date; aviso: boolean }
  | { estado: "fallido"; aviso: true } {
  const espera = REINTENTOS_MIN[p.intentosHechos - 1];
  if (!p.reintentable || espera === undefined) return { estado: "fallido", aviso: true };
  return { estado: "pendiente", proximoEn: new Date(p.ahora.getTime() + espera * MIN), aviso: p.prioridad === "P1" && p.intentosHechos === 1 };
}

/** Lo que hace el cron con un despacho. PURA. */
export function accionDelDrenaje(d: Despacho | null, ahora: Date): "disparar" | "vencer" | "nada" {
  if (d?.estado === "pendiente" && (!d.proximoEn || d.proximoEn.getTime() <= ahora.getTime())) return "disparar";
  if (d?.estado === "disparado" && d.disparadoEn && ahora.getTime() - d.disparadoEn.getTime() >= VENCE_MIN * MIN) return "vencer";
  return "nada";
}

/** ¿Este nonce abre este despacho? Disparado, huella igual (tiempo constante) y menos de 2 h. PURA. */
export function vigenteParaElAgente(d: Despacho | null, nonce: string, ahora: Date): boolean {
  if (!d || d.estado !== "disparado" || !d.nonceHash || !d.disparadoEn || typeof nonce !== "string" || !nonce) return false;
  const edad = ahora.getTime() - d.disparadoEn.getTime();
  if (!(edad >= -MIN && edad < VENTANA_DEL_AGENTE_MIN * MIN)) return false;
  const a = Buffer.from(huellaDelNonce(nonce), "hex");
  const b = Buffer.from(/^[0-9a-f]{64}$/.test(d.nonceHash) ? d.nonceHash : "", "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** `slug#n` → { slug, numero }; cualquier otra cosa → null. PURA. */
export function leerRef(ref: unknown): { slug: string; numero: number } | null {
  if (typeof ref !== "string") return null;
  const m = REF.exec(ref.trim());
  return m ? { slug: m[1], numero: Number(m[2]) } : null;
}

/** `&`, `<` y `>` escapados: el texto del cliente no puede abrir ni cerrar etiquetas. PURA. */
export const escaparParaLaIa = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Lo que el cliente escribió, para la sesión: tapado (secretos), reducido (datos personales, largo) y
 * escapado, dentro de `<texto_del_cliente>`. El prompt de la tarea dice que lo de adentro es un dato,
 * nunca una orden (§15.5). PURA.
 */
export function bloqueDelCliente(t: { asunto: string; detalle: string | null }): string {
  const limpio = (s: string) => escaparParaLaIa(textoParaLaIa(taparSecretos(s).texto));
  return ["<texto_del_cliente>", `Asunto: ${limpio(t.asunto)}`, `Detalle: ${t.detalle ? limpio(t.detalle) : "(sin detalle)"}`, "</texto_del_cliente>"].join("\n");
}

const LARGO_MINIMO_DE_CLAVE = 32;
const huella = (s: string) => createHash("sha256").update(s, "utf8").digest();

/**
 * El nivel de la credencial del agente (`Authorization: Bearer <clave>`), comparada en tiempo constante
 * contra MANT_AGENTE_N1_CLAVE y MANT_AGENTE_N2_CLAVE (se comparan las dos siempre). El nivel sale de la
 * clave, nunca del pedido. Sin claves válidas (≥ 32 caracteres) o con las dos iguales → apagado. PURA.
 */
export function nivelDeLaCredencial(
  authHeader: string | null | undefined,
  env: Record<string, string | undefined>,
): { estado: "apagado"; motivo: string } | { estado: "invalida" } | { estado: "ok"; nivel: NivelDeDespacho } {
  const claves = NIVELES_DE_DESPACHO.map((n) => [n, env[`MANT_AGENTE_${n.toUpperCase()}_CLAVE`]?.trim() ?? ""] as const).filter(
    ([, c]) => c.length >= LARGO_MINIMO_DE_CLAVE,
  );
  if (!claves.length) return { estado: "apagado", motivo: "Faltan MANT_AGENTE_N1_CLAVE / MANT_AGENTE_N2_CLAVE (32 caracteres o más): los agentes están apagados." };
  if (claves.length === 2 && claves[0][1] === claves[1][1]) return { estado: "apagado", motivo: "Las claves de n1 y n2 son iguales: no se sabe el nivel, apagado." };
  const dada = typeof authHeader === "string" && authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  const h = huella(dada ?? "");
  let nivel: NivelDeDespacho | null = null;
  for (const [n, c] of claves) if (timingSafeEqual(h, huella(c)) && dada) nivel = n;
  return nivel ? { estado: "ok", nivel } : { estado: "invalida" };
}

export type FetchDeRutina = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal },
) => Promise<{ status: number; ok: boolean; json(): Promise<unknown> }>;

export type ResultadoDelDisparo =
  | { ok: true; sesionId: string | null; sesionUrl: string | null }
  | { ok: false; status: number | null; reintentable: boolean; error: string };

/**
 * POST al /fire de la tarea (§15.2). El cuerpo lleva sólo `text`. Red, 5xx y 429 → reintentable; otro
 * 4xx (token o URL mal cargados) → no. El error nunca lleva el token ni el cuerpo de la respuesta.
 */
export async function dispararRutina(
  rutina: { url: string; token: string },
  text: string,
  fetchImpl: FetchDeRutina = fetch as unknown as FetchDeRutina,
  timeoutMs = 15_000,
): Promise<ResultadoDelDisparo> {
  let r: Awaited<ReturnType<FetchDeRutina>>;
  try {
    r = await fetchImpl(rutina.url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${rutina.token}`,
        "anthropic-beta": BETA_DE_RUTINAS,
        "anthropic-version": VERSION_DE_ANTHROPIC,
        "content-type": "application/json",
      },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    const nombre = e instanceof Error ? e.name : "error";
    return { ok: false, status: null, reintentable: true, error: `Sin respuesta del /fire (${nombre}).` };
  }
  if (!r.ok) {
    const reintentable = r.status >= 500 || r.status === 429 || r.status === 408;
    return { ok: false, status: r.status, reintentable, error: `El /fire respondió ${r.status}.` };
  }
  let cuerpo: Record<string, unknown> = {};
  try {
    const j = await r.json();
    if (typeof j === "object" && j !== null) cuerpo = j as Record<string, unknown>;
  } catch {
    // 2xx sin JSON: disparado igual, sin sesión.
  }
  const id = typeof cuerpo.claude_code_session_id === "string" && /^[A-Za-z0-9_-]{1,200}$/.test(cuerpo.claude_code_session_id) ? cuerpo.claude_code_session_id : null;
  const u = typeof cuerpo.claude_code_session_url === "string" && cuerpo.claude_code_session_url.length <= 500 ? cuerpo.claude_code_session_url : "";
  let url: string | null = null;
  try {
    if (u && new URL(u).protocol === "https:") url = u;
  } catch {
    url = null;
  }
  return { ok: true, sesionId: id, sesionUrl: url };
}
