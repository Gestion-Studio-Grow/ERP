// EL CÓDIGO CON QUE LA DUEÑA AUTORIZA ANULAR UN COBRO O UNA VENTA — orden del dueño, 31/10/2026: «no
// se anulan cobros, pero solamente recepcion con autorizacion de caro». Vale para los cobros de
// turnos, las ventas de mostrador y los cobros de Taller. Sin tabla nueva y sin guardar nada.
//
// La dueña, en ese cobro o esa venta, toca «Autorizar anulación» y ve un código corto. Recepción lo
// escribe al anular. El código sale de un HMAC sobre el negocio, el objeto, la dueña y la ventana:
//
//   · Vale sólo para ESE objeto de ESE negocio: otro cobro, otra venta u otro negocio da otro código.
//     Un cobro de turno se firma con su id; los otros, con el tipo adelante (`objetoDeVenta`,
//     `objetoDeCobroDeTaller`), para que un código no sirva para un objeto de otra clase.
//   · Identifica a quien autorizó: se prueba contra cada dueña activa y gana la que coincide. Si a
//     una dueña se le saca el acceso, sus códigos dejan de valer.
//   · Vence solo: se acepta la ventana de ahora y la anterior, así que dura entre 5 y 10 minutos.
//   · No se reutiliza después de anular: la segunda anulación la frena el control de siempre (cada
//     anulación es idempotente), y volver a cobrar crea otro cobro u otra venta, con otro código.
//
// EL SECRETO. Se reusa `AUTH_SECRET`, que en producción es obligatorio (`authSecret` corta si falta),
// pero nunca directo: primero se deriva una clave propia con una etiqueta, y lo que se muestra son
// unos pocos dígitos de la firma. Ni el código deja deducir el secreto ni una firma de sesión sirve
// de código, ni al revés. Rotar `AUTH_SECRET` invalida los códigos vivos, que duran minutos.
//
// El tope de intentos usa el limitador de `rate-limit.ts`, en memoria y POR PROCESO: alcanza contra
// probar códigos a mano, pero no se comparte entre instancias de Vercel. Compartirlo pide un
// almacén externo o una tabla. El largo del código (31^6, cerca de 887 millones) y su vencimiento
// son lo que sostiene el control cuando el tope se reparte.
//
// Este módulo usa `node:crypto`: sólo del lado del servidor. Lo que la pantalla necesita saber
// (quién anula y cómo) está en `capabilities.ts`.

import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { createRateLimiter, type RateLimiter } from "@/lib/rate-limit";

export const VENTANA_CODIGO_MS = 5 * 60 * 1000;
export const LARGO_CODIGO = 6;
// Sin 0/O, 1/I/L: se dicta por teléfono y se tipea en un celular.
const ALFABETO = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const ETIQUETA_DE_LA_CLAVE = "gsg:autorizacion-anular-cobro:v1";

export type DatosDelCodigo = {
  secreto: string;
  tenantId: string;
  objetoId: string;
  duenaId: string;
};

function ventanaDe(ms: number): number {
  return Math.floor(ms / VENTANA_CODIGO_MS);
}

function codigoDeLaVentana(d: DatosDelCodigo, ventana: number): string {
  const clave = createHmac("sha256", d.secreto).update(ETIQUETA_DE_LA_CLAVE).digest();
  // JSON: los campos quedan separados sin ambigüedad, sea cual sea su contenido.
  const firma = createHmac("sha256", clave)
    .update(JSON.stringify([d.tenantId, d.objetoId, d.duenaId, ventana]))
    .digest();
  // 48 bits sobre 31^6 (30 bits): el sesgo del módulo es despreciable.
  let n = firma.readUIntBE(0, 6) % ALFABETO.length ** LARGO_CODIGO;
  let codigo = "";
  for (let i = 0; i < LARGO_CODIGO; i++) {
    codigo = ALFABETO[n % ALFABETO.length] + codigo;
    n = Math.floor(n / ALFABETO.length);
  }
  return codigo;
}

/** Lo que se firma para una venta de mostrador: una sola por venta, pague con uno o varios medios. */
export const objetoDeVenta = (orderId: string): string => `venta:${orderId}`;

/** Lo que se firma para un cobro de Taller. */
export const objetoDeCobroDeTaller = (pagoId: string): string => `taller:${pagoId}`;

/** El código de esta dueña para este objeto, y hasta cuándo vale con seguridad. */
export function emitirCodigo(d: DatosDelCodigo, ahoraMs: number): { codigo: string; venceMs: number } {
  const ventana = ventanaDe(ahoraMs);
  return { codigo: codigoDeLaVentana(d, ventana), venceMs: (ventana + 2) * VENTANA_CODIGO_MS };
}

/** Lo que escribió recepción, sin espacios ni guiones y en mayúsculas. */
export function normalizarCodigo(raw: unknown): string {
  return String(raw ?? "").replace(/[\s-]/g, "").toUpperCase();
}

const huella = (s: string) => createHash("sha256").update(s).digest();

/**
 * ¿Este código lo emitió alguna de estas dueñas, para este objeto, hace poco? Compara todos los
 * candidatos en tiempo constante, sin cortar en el primero que coincide; las huellas de largo fijo
 * hacen que tampoco se note el largo de lo escrito.
 */
export function verificarCodigo(
  p: { secreto: string; tenantId: string; objetoId: string; duenas: readonly string[]; codigo: string },
  ahoraMs: number,
): { ok: true; duenaId: string } | { ok: false } {
  const escrito = huella(normalizarCodigo(p.codigo));
  const ventana = ventanaDe(ahoraMs);
  let duenaId: string | null = null;
  for (const id of p.duenas) {
    for (const v of [ventana, ventana - 1]) {
      const esperado = codigoDeLaVentana({ secreto: p.secreto, tenantId: p.tenantId, objetoId: p.objetoId, duenaId: id }, v);
      if (timingSafeEqual(huella(esperado), escrito)) duenaId = id;
    }
  }
  return duenaId ? { ok: true, duenaId } : { ok: false };
}

// ── Tope de intentos ─────────────────────────────────────────────────────────

export const TOPE_POR_COBRO = { max: 5, windowMs: 15 * 60 * 1000 };
export const TOPE_POR_USUARIO = { max: 20, windowMs: 15 * 60 * 1000 };

type ClaveDelIntento = { tenantId: string; userId: string; objetoId: string };

export type TopeDeIntentos = {
  frenado(q: ClaveDelIntento): boolean;
  fallo(q: ClaveDelIntento): void;
  acierto(q: ClaveDelIntento): void;
};

/** 5 fallos por usuario y cobro, y 20 por usuario sumando todos los cobros, cada 15 minutos. */
export function crearTopeDeIntentos(now: () => number = Date.now): TopeDeIntentos {
  const porCobro: RateLimiter = createRateLimiter(TOPE_POR_COBRO, now);
  const porUsuario: RateLimiter = createRateLimiter(TOPE_POR_USUARIO, now);
  const delCobro = (q: ClaveDelIntento) => `anular-cobro:${q.tenantId}:${q.userId}:${q.objetoId}`;
  const delUsuario = (q: ClaveDelIntento) => `anular-cobro:${q.tenantId}:${q.userId}`;
  return {
    frenado: (q) => porCobro.blocked(delCobro(q)) || porUsuario.blocked(delUsuario(q)),
    fallo: (q) => {
      porCobro.fail(delCobro(q));
      porUsuario.fail(delUsuario(q));
    },
    // Limpia sólo el cobro: acertar uno no le devuelve margen a quien viene probando en varios.
    acierto: (q) => porCobro.reset(delCobro(q)),
  };
}

export const topeDeAnulaciones: TopeDeIntentos = crearTopeDeIntentos();
