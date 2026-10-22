// ============================================================================
// PADEL-CLASES — la sesión del alumno: reglas puras (sin cookies, sin base).
// ============================================================================
//
// El link del alumno (`/alumno/<token>`) es la llave de sus clases: con él se ven, se cancelan y
// se paga. Por eso el token se entrega SÓLO al dispositivo que lo creó (o que ya lo tenía), nunca a
// quien tipea un celular. Si un alumno lo perdió, le viaja por WhatsApp al número registrado.
//
// El dispositivo se recuerda con una cookie `padel_alumno` (httpOnly: el JavaScript de la página
// no la lee). Es por host, así que cada negocio tiene la suya: el aislamiento por tenant sale gratis.
// La lectura y la escritura viven en sesion-alumno.server.ts; acá, lo que se prueba con node --test.

import { tokenValido } from "./core";

export const COOKIE_ALUMNO = "padel_alumno";

/** Un año: el alumno de todos los martes no tiene que volver a pedir su link. */
export const VIDA_COOKIE_SEG = 365 * 24 * 60 * 60;

export interface OpcionesCookie {
  httpOnly: true;
  secure: boolean;
  sameSite: "lax";
  path: "/";
  maxAge: number;
}

/** El host sin puerto, en minúsculas. */
const sinPuerto = (host: string): string => host.trim().toLowerCase().replace(/:\d+$/, "");

/**
 * Atributos de la cookie. `Secure` en todo host real; sólo se apaga en localhost (el demo local
 * corre en http y el navegador descartaría una cookie Secure).
 */
export function opcionesCookie(host: string | null | undefined): OpcionesCookie {
  const h = sinPuerto(host ?? "");
  const local = h === "localhost" || h === "127.0.0.1" || h === "[::1]" || h.endsWith(".localhost");
  return { httpOnly: true, secure: !local, sameSite: "lax", path: "/", maxAge: VIDA_COOKIE_SEG };
}

/**
 * ¿A quién pidió la clase se le devuelve el token del alumno?
 *  · alumno NUEVO (lo acaba de crear este pedido) → sí: es su primer link y queda en su cookie.
 *  · alumno que YA EXISTÍA → sólo si este navegador ya tenía su cookie (mismo dispositivo).
 *    Cualquier otro caso —un tercero con el celular de otro, o un teléfono nuevo del mismo
 *    alumno— recibe null: el link le llega por WhatsApp al número registrado.
 */
export function tokenAEntregar(p: { esNuevo: boolean; tokenAlumno: string; tokenCookie: string | null | undefined }): string | null {
  if (p.esNuevo) return p.tokenAlumno;
  if (!tokenValido(p.tokenCookie) || !tokenValido(p.tokenAlumno)) return null;
  return iguales(p.tokenCookie, p.tokenAlumno) ? p.tokenAlumno : null;
}

/** Comparación sin cortar en el primer carácter distinto (no da pistas por el tiempo). */
function iguales(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

// ── «¿Ya sos alumno? Pedí tu link» ──────────────────────────────────────────

/**
 * La respuesta es SIEMPRE la misma, exista o no el celular: no se revela quién es alumno.
 * El nombre del profe es lo único que cambia (es público: está en la cabecera del turnero).
 */
export const respuestaLinkPedido = (profe: string): string =>
  `Si ese celular es de un alumno de ${profe || "el profe"}, le llega su link por WhatsApp.`;

export const RESPUESTA_FRENADO = "Probá de nuevo en unos minutos.";

/**
 * Qué hace `pedirMiLink` con lo que sabe. Pura para poder probar que la pantalla no distingue
 * un celular de alumno de uno que no existe:
 *  · frenado (muchos pedidos de ese celular o de esa IP) → error, no se crea nada;
 *  · el celular no es de un alumno → misma respuesta, no se crea nada;
 *  · ya se lo mandamos hace un rato → misma respuesta, no se repite el aviso ni el WhatsApp;
 *  · si no → misma respuesta, aviso al profe y WhatsApp al número registrado.
 */
export function decidirPedidoDeLink(p: { frenado: boolean; esAlumno: boolean; yaPedidoHaceRato: boolean; profe: string }):
  | { ok: false; error: string }
  | { ok: true; mensaje: string; avisar: boolean } {
  if (p.frenado) return { ok: false, error: RESPUESTA_FRENADO };
  return { ok: true, mensaje: respuestaLinkPedido(p.profe), avisar: p.esAlumno && !p.yaPedidoHaceRato };
}
