// ============================================================================
// EL PIN DE UN DUEÑO DEL CLUB SE VERIFICA EN EL SERVIDOR (GSG-SEG-020) — PURO, sin Prisma.
// ============================================================================
//
// Regla: el PIN guardado de un usuario del club con rol «duenio» no sale del servidor, para ninguna sesión (tampoco
// la de un OWNER del ERP). La foto que baja lleva `pin: "srv:"` (`MARCA_PIN_SERVIDOR`) y conserva `pinLargo`; al
// guardar, el servidor repone el PIN de la foto vigente. Un dueño que pasa a otro rol queda sin PIN (define uno
// nuevo): lo guardado de un dueño nunca queda bajo un rol cuyo PIN baja. Ningún h2 baja, sea cual sea el rol. Los PIN de recepción siguen como antes (h1 en la foto,
// verificación en el puesto, sin conexión). La sal del club (`salPin`) sigue en la foto: la usan los PIN de
// recepción, y sin el PIN guardado del dueño no alcanza para nada de lo del dueño.
//
// Formatos de PIN guardado que entiende el servidor:
//   · en claro (lo de antes del 21/10) · `h1:<hex>` (hashPin del motor, con la sal del club) ·
//   · `h2:<params>:<sal propia>:<hex>` (scrypt, sólo servidor; ver «re-hash» en tope-pin-servidor.ts).
//
// Pase: prueba corta (120 s) de que el servidor verificó el PIN de un dueño, para un uso («firma» o «aprobacion»),
// en un negocio. HMAC-SHA256 con una clave derivada de AUTH_SECRET (la deriva tope-pin-servidor.ts).
//
// Código de aprobación del servidor: mismo alfabeto, largo y normalización que el del motor, pero firmado con una
// clave del servidor; no depende del PIN ni de lo guardado.
//
// — Elaborado por GSG
//
// design-lint-ignore: sin interfaz ni animación; el lint toma `Buffer.from(` por el `.from(` de gsap (reducedMotion N/A).

import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { LARGO_PIN, LARGO_PIN_VIEJO, esPinConHash, hashPin } from "./motor.mjs";
import { conservarLoDelicado } from "./delicado";

/** Lo que lleva en la foto que baja el PIN de un dueño que tiene uno. */
export const MARCA_PIN_SERVIDOR = "srv:";
/** Vida de un pase. */
export const VIDA_PASE_MS = 120_000;

export type UsoDePase = "firma" | "aprobacion";

/** Las letras de los códigos que se dictan: las mismas que el motor (sin 0/O ni 1/I; motor.mjs es copia fija). */
export const LETRAS_DEL_CODIGO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
/** Un código tipeado, en mayúsculas y sin separadores (la misma normalización que el motor). */
export const normalizarCodigo = (c: unknown): string => String(c ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

interface UsuarioCrudo {
  id?: unknown;
  rol?: unknown;
  pin?: unknown;
  pinLargo?: unknown;
  [k: string]: unknown;
}

type SobreCrudo = { estado?: { usuarios?: unknown; salPin?: unknown } };

const PREFIJO_FUERTE = "h2:";
const PARAMS_FUERTE = "s15.8.1"; // scrypt N = 2^15, r = 8, p = 1
const N_FUERTE = 1 << 15;
const H1_VALIDO = /^h1:[0-9a-f]{64}$/;
const FUERTE_VALIDO = /^h2:s15\.8\.1:[0-9a-f]{32}:[0-9a-f]{64}$/;

export const esPinFuerte = (p: unknown): boolean => typeof p === "string" && p.startsWith(PREFIJO_FUERTE);
export const esMarcaDeServidor = (p: unknown): boolean => p === MARCA_PIN_SERVIDOR;

const usuariosDe = (sobre: unknown): UsuarioCrudo[] | null => {
  const u = (sobre as SobreCrudo | null)?.estado?.usuarios;
  return Array.isArray(u) ? (u as UsuarioCrudo[]) : null;
};

function leer(texto: string): unknown {
  try {
    return JSON.parse(texto);
  } catch {
    return undefined;
  }
}

/** ¿Este PIN guardado no puede bajar al navegador? (el de un dueño, o cualquiera fuerte). */
const quedaEnElServidor = (u: UsuarioCrudo) => (u.rol === "duenio" && typeof u.pin === "string" && u.pin !== "") || esPinFuerte(u.pin);

/** Cuántos números tiene el PIN guardado (para `pinLargo` de la marca). */
function largoGuardado(u: UsuarioCrudo): number {
  const n = Number(u.pinLargo);
  if (Number.isInteger(n) && n > 0) return n;
  return typeof u.pin === "string" && !esPinConHash(u.pin) && !esPinFuerte(u.pin) ? u.pin.trim().length : 0;
}

/**
 * La foto para el navegador: cada PIN de dueño (y cualquier h2) pasa a la marca, con su `pinLargo`. Si el texto no se
 * puede leer devuelve null (la acción responde error: nunca baja algo sin revisar).
 */
export function ocultarPinesDeDuenio(texto: string): string | null {
  const sobre = leer(texto);
  if (sobre === undefined || sobre === null || typeof sobre !== "object") return null;
  const us = usuariosDe(sobre);
  if (!us) return texto;
  let cambio = false;
  for (const u of us) {
    if (!u || typeof u !== "object" || !quedaEnElServidor(u)) continue;
    const largo = largoGuardado(u);
    u.pin = MARCA_PIN_SERVIDOR;
    if (largo) u.pinLargo = largo;
    cambio = true;
  }
  return cambio ? JSON.stringify(sobre) : texto;
}

/** La huella de un PIN guardado (para saber si el h2 pendiente sigue siendo de ESE PIN). Nunca se registra el PIN. */
export const huellaDePin = (guardado: string): string => createHash("sha256").update(guardado).digest("hex");

const LARGOS_DE_DUENIO = [LARGO_PIN.duenio, LARGO_PIN_VIEJO];

/**
 * ¿Un PIN de dueño que trae un OWNER del ERP se acepta? Un h1 bien formado con su largo (PIN inicial o regenerado en
 * el puesto del dueño; o un respaldo viejo), o un PIN en claro de un respaldo de antes del 21/10. Nunca el hash de la
 * marca (un puesto que la tomó por un PIN en claro) ni un h2 (no los arma el navegador).
 */
function pinNuevoAceptable(pin: unknown, pinLargo: unknown, sal: unknown): boolean {
  if (typeof pin !== "string") return false;
  if (/^\d+$/.test(pin)) return LARGOS_DE_DUENIO.includes(pin.length as 2 | 4);
  return H1_VALIDO.test(pin) && LARGOS_DE_DUENIO.includes(Number(pinLargo) as 2 | 4) && typeof sal === "string" && pin !== hashPin(MARCA_PIN_SERVIDOR, sal);
}

/** Un h2 pendiente por usuario del club: `de` = huella del PIN guardado que reemplaza. */
export type PinesFuertes = ReadonlyMap<string, { de: string; h2: string }>;

/**
 * Lo que se guarda: la marca vuelve a ser el PIN vigente (o su h2 pendiente). Un usuario que en la vigente es dueño y
 * llega con otro rol queda sin PIN (no se repone el suyo, ni se acepta otro en el mismo guardado). Si guarda un OWNER del ERP, un PIN de
 * dueño nuevo bien formado (`pinNuevoAceptable`) se acepta; cualquier otra cosa en el PIN de un
 * dueño queda como el vigente. Si no es OWNER, después se aplica `conservarLoDelicado` (G8) sin aflojarlo.
 * `corregido`: hubo que revertir algo que no venía como la marca (evento de seguridad, para los logs).
 */
export function reponerPinesDeDuenio(
  textoVigente: string,
  textoNuevo: string,
  opciones: { esOwner: boolean; fuertes?: PinesFuertes },
): { texto: string; corregido: boolean } {
  const vigente = leer(textoVigente);
  const nuevo = leer(textoNuevo);
  const antes = usuariosDe(vigente);
  const ahora = usuariosDe(nuevo);
  if (!antes || !ahora) return opciones.esOwner ? { texto: textoNuevo, corregido: false } : conservarLoDelicado(textoVigente, textoNuevo);
  const porId = new Map(antes.map((u) => [u.id, u]));
  const salVigente = (vigente as SobreCrudo).estado?.salPin;
  const salNueva = (nuevo as SobreCrudo).estado?.salPin;
  let corregido = false;
  let usaSalVigente = false;
  const reponer = (u: UsuarioCrudo, v: UsuarioCrudo | undefined) => {
    u.pin = typeof v?.pin === "string" ? v.pin : "";
    if (v && v.pinLargo !== undefined) u.pinLargo = v.pinLargo;
    else delete u.pinLargo;
    if (esPinConHash(u.pin) && u.rol === "duenio") usaSalVigente = true;
  };
  for (const u of ahora) {
    if (!u || typeof u !== "object") continue;
    const v = porId.get(u.id);
    if (v?.rol === "duenio" && u.rol !== "duenio") {
      // Deja de ser dueño: su PIN se anula (define uno nuevo). Lo guardado de un dueño nunca pasa a otro rol, porque
      // los PIN de los otros roles bajan al navegador. Si no es OWNER, G8 deja el rol y el PIN como en la vigente.
      if (opciones.esOwner && typeof u.pin === "string" && u.pin !== "" && !esMarcaDeServidor(u.pin)) corregido = true;
      u.pin = "";
      delete u.pinLargo;
      continue;
    }
    if (esMarcaDeServidor(u.pin)) {
      reponer(u, v);
      continue;
    }
    if (!opciones.esOwner) continue; // G8 lo resuelve conservarLoDelicado
    const esDuenio = u.rol === "duenio" || v?.rol === "duenio";
    if (!esDuenio || u.pin === v?.pin || (u.pin === "" && !v?.pin)) continue;
    if (pinNuevoAceptable(u.pin, u.pinLargo, salNueva)) continue;
    reponer(u, v);
    corregido = true;
  }
  if (opciones.esOwner && usaSalVigente && typeof salVigente === "string" && salNueva !== salVigente) {
    (nuevo as { estado: { salPin?: unknown } }).estado.salPin = salVigente;
    corregido = true;
  }
  let texto = JSON.stringify(nuevo);
  if (!opciones.esOwner) {
    const c = conservarLoDelicado(textoVigente, texto);
    texto = c.texto;
    corregido = corregido || c.corregido;
  }
  return { texto: aplicarFuertes(texto, antes, opciones.fuertes), corregido };
}

/** Pone el h2 pendiente donde el PIN guardado sigue siendo el vigente que reemplaza. */
function aplicarFuertes(texto: string, antes: UsuarioCrudo[], fuertes: PinesFuertes | undefined): string {
  if (!fuertes || fuertes.size === 0) return texto;
  const sobre = leer(texto);
  const us = usuariosDe(sobre);
  if (!us) return texto;
  const vigentePorId = new Map(antes.map((u) => [u.id, u]));
  let cambio = false;
  for (const u of us) {
    const f = typeof u?.id === "string" ? fuertes.get(u.id) : undefined;
    const v = vigentePorId.get(u?.id);
    if (!f || !v || typeof v.pin !== "string" || !v.pin || u.pin !== v.pin || esPinFuerte(v.pin)) continue;
    if (!FUERTE_VALIDO.test(f.h2) || huellaDePin(v.pin) !== f.de) continue;
    if (u.pinLargo === undefined) u.pinLargo = largoGuardado(v);
    u.pin = f.h2;
    cambio = true;
  }
  return cambio ? JSON.stringify(sobre) : texto;
}

/** Compara dos textos sin cortar en el primer carácter distinto. */
function igualesSinApuro(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

function scrypt(pin: string, sal: Buffer): Buffer {
  return scryptSync(pin, sal, 32, { N: N_FUERTE, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
}

/** PIN guardado fuerte (sólo servidor): `h2:<params>:<sal propia>:<hex>`. */
export function hashFuerte(pin: string): string {
  const sal = randomBytes(16);
  return `${PREFIJO_FUERTE}${PARAMS_FUERTE}:${sal.toString("hex")}:${scrypt(String(pin ?? "").trim(), sal).toString("hex")}`;
}

/** ¿`pin` es el de este PIN guardado? Acepta en claro, h1 (con la sal del club) y h2. Comparación de largo fijo. */
export function pinDelDuenioCoincide(guardado: unknown, pin: unknown, sal: unknown): boolean {
  const p = String(pin ?? "").trim();
  if (typeof guardado !== "string" || !guardado || !p || esMarcaDeServidor(guardado)) return false;
  if (esPinFuerte(guardado)) {
    if (!FUERTE_VALIDO.test(guardado)) return false;
    const [, , salHex, hex] = guardado.split(":");
    return timingSafeEqual(scrypt(p, Buffer.from(salHex, "hex")), Buffer.from(hex, "hex"));
  }
  if (esPinConHash(guardado)) return typeof sal === "string" && sal !== "" && igualesSinApuro(hashPin(p, sal), guardado);
  return igualesSinApuro(guardado, p);
}

// ── pase ─────────────────────────────────────────────────────────────────────

export interface DatosDePase {
  tenantId: string;
  usuarioId: string;
  uso: UsoDePase;
  /** Vence (ms epoch). */
  exp: number;
}

const mac = (datos: string, clave: Buffer) => createHmac("sha256", clave).update(`club-pase|${datos}`).digest();

export function firmarPase(d: DatosDePase, clave: Buffer): string {
  const datos = Buffer.from(JSON.stringify({ t: d.tenantId, u: d.usuarioId, s: d.uso, e: d.exp })).toString("base64url");
  return `v1.${datos}.${mac(datos, clave).toString("base64url")}`;
}

/** Verifica firma, vencimiento, negocio y (si se pide) uso. Nunca tira. */
export function verificarPase(
  token: unknown,
  clave: Buffer,
  ahoraMs: number,
  esperado: { tenantId: string; uso?: UsoDePase },
): ({ ok: true } & DatosDePase) | { ok: false } {
  if (typeof token !== "string" || token.length > 1000) return { ok: false };
  const partes = token.split(".");
  if (partes.length !== 3 || partes[0] !== "v1") return { ok: false };
  const [, datos, firma] = partes;
  const recibida = Buffer.from(firma, "base64url");
  const calculada = mac(datos, clave);
  if (recibida.length !== calculada.length || !timingSafeEqual(recibida, calculada)) return { ok: false };
  let d: { t?: unknown; u?: unknown; s?: unknown; e?: unknown };
  try {
    d = JSON.parse(Buffer.from(datos, "base64url").toString("utf8"));
  } catch {
    return { ok: false };
  }
  if (typeof d.t !== "string" || typeof d.u !== "string" || (d.s !== "firma" && d.s !== "aprobacion") || typeof d.e !== "number") return { ok: false };
  if (d.t !== esperado.tenantId || (esperado.uso && d.s !== esperado.uso) || ahoraMs > d.e) return { ok: false };
  return { ok: true, tenantId: d.t, usuarioId: d.u, uso: d.s, exp: d.e };
}

// ── código de aprobación ─────────────────────────────────────────────────────

export interface DatosDeCodigo {
  tenantId: string;
  usuarioId: string;
  novedadId: string;
  clienteId: string;
  monto: number;
  fecha?: string | null;
}

/** 6 letras del alfabeto del motor (`ABC-DEF`). 32 letras: cada byte % 32 es parejo. */
export function codigoDeAprobacionServidor(d: DatosDeCodigo, clave: Buffer): string {
  const base = `club-aprobacion|${d.tenantId}|${d.usuarioId}|${d.novedadId}|${d.clienteId}|${Math.round(Number(d.monto))}|${d.fecha ?? ""}`;
  const h = createHmac("sha256", clave).update(base).digest();
  let out = "";
  for (let i = 0; i < 6; i++) out += LETRAS_DEL_CODIGO[h[i] % LETRAS_DEL_CODIGO.length];
  return `${out.slice(0, 3)}-${out.slice(3)}`;
}
