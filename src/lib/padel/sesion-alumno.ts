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
  `Si ese celular es de un alumno ${profe ? `de ${profe}` : "del profe"}, le llega su link por WhatsApp.`;

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

/**
 * O-2: `pedirMiLink` tarda lo mismo exista o no el celular. Corre `fn` y, si terminó antes de
 * `pisoMs`, espera lo que falta: la demora no dice si el número es de un alumno. (Los efectos que
 * sólo pasan cuando existe —aviso, WhatsApp— van además después de la respuesta, con `after`.)
 */
export async function conPisoDeTiempo<T>(
  pisoMs: number,
  fn: () => Promise<T>,
  reloj: { ahora: () => number; dormir: (ms: number) => Promise<void> } = {
    ahora: () => performance.now(),
    dormir: (ms) => new Promise((r) => setTimeout(r, ms)),
  },
): Promise<T> {
  const inicio = reloj.ahora();
  try {
    return await fn();
  } finally {
    const resta = pisoMs - (reloj.ahora() - inicio);
    if (resta > 0) await reloj.dormir(resta);
  }
}

// ── Link verificado: contra el «squatting» (O-1) ────────────────────────────
//
// Quien pide clase con un celular que no existe en el negocio recibe el token y la cookie (M-003),
// pero nadie verificó que ese celular sea suyo. Si después el dueño real del número se vuelve
// alumno, el que pidió primero vería sus clases. Por eso el link de un alumno que el profe todavía
// no RECONOCIÓ es provisorio:
//  · cuando el profe lo reconoce por primera vez (le confirma, le agenda o le da una clase), el link
//    se regenera y el nuevo le viaja por WhatsApp al número registrado;
//  · si otro dispositivo pide clase con ese mismo celular antes de que el profe lo reconozca, el link
//    también se regenera y no se le entrega a nadie (cada uno queda esperando la confirmación);
//  · el profe puede «Regenerar link» a mano: el viejo deja de andar en el acto.
// No hace falta columna nueva: «reconocido» se deriva de las clases (claseReconoce) y el token es uno
// solo por alumno, así que cambiarlo invalida el viejo en la misma escritura.

/**
 * ¿Esta clase dice que el profe ya reconoció al alumno? La confirmó (confirmadaEl), la agendó él
 * (origen PROFE) o la marcó dada o ausente. Es la regla pura del filtro de acciones.ts
 * (alumnoReconocido); un test verifica que los dos digan lo mismo.
 */
export const claseReconoce = (c: { estado: string; origen: string; confirmadaEl: Date | null }): boolean =>
  c.confirmadaEl != null || c.origen === "PROFE" || c.estado === "DADA" || c.estado === "AUSENTE";

/**
 * Qué hace `pedirClase` con el link del alumno de ese celular:
 *  · `entregar`: el token, sólo si este dispositivo es el dueño (tokenAEntregar);
 *  · `rotar`: el link se regenera sin entregárselo a nadie — otro dispositivo pidió con el celular
 *    de un alumno que el profe todavía no reconoció. Así un pedido de un desconocido nunca hereda la
 *    identidad de un alumno ya existente, y el primero que tipeó el número tampoco se la queda.
 *    Un alumno recién creado (de una ficha que ya existía) no rota: su token no lo vio nadie.
 */
export function politicaDeToken(p: {
  esNuevo: boolean;
  recienCreado: boolean;
  reconocido: boolean;
  tokenAlumno: string;
  tokenCookie: string | null | undefined;
}): { entregar: string | null; rotar: boolean } {
  const entregar = tokenAEntregar(p);
  return { entregar, rotar: entregar === null && !p.recienCreado && !p.reconocido };
}

/** Cuando el profe reconoce por primera vez a un alumno que ya existía, su link se regenera. */
export const regenerarAlReconocer = (p: { reconocidoAntes: boolean; recienCreado: boolean }): boolean =>
  !p.reconocidoAntes && !p.recienCreado;

/**
 * M-003 (mínimo hasta T3C): adónde lleva «Mis clases». Con un token vigente en la cookie, a la vista
 * del alumno; sin cookie (o con un link que se regeneró), al turnero con «Pedí tu link» abierto.
 */
export const destinoMisClases = (tokenVigente: string | null | undefined): string =>
  tokenValido(tokenVigente) ? `/alumno/${tokenVigente}` : "/clases?link=1";
