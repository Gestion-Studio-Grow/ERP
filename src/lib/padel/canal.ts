// ============================================================================
// PADEL-CLASES — Por dónde entró la reserva y por dónde se le avisa al alumno. PURO.
// ============================================================================
//
// Decisión del dueño (13/11): quién le habla al alumno depende de POR DÓNDE ENTRÓ la clase, no de
// un ajuste del profe.
//  · Entró por el buscador de profes (/profeturnos/profes → turnero con `?desde=directorio`):
//    `PadelClase.origen = "DIRECTORIO"` y los avisos son de GSG (canal central), en tercera persona
//    con el nombre del profe («Tu profe Matías confirmó tu clase del…»). Salen por el número de GSG
//    cuando PADEL_WHATSAPP=cloud y hay credenciales globales; si no, por el botón verde de hoy, con
//    ese mismo texto.
//  · Cualquier otro origen (TURNERO, ALUMNO_LINK, PROFE, o uno que no conocemos): EXACTAMENTE como
//    hoy, relación directa con el profe y sus textos.
//
// `?desde=` lo puede inventar cualquiera: el único efecto es la voz y el número del aviso (GSG en
// vez del profe). No da acceso a datos ni cambia precio, estado ni a quién se le escribe.

import { PLANTILLAS_DEFAULT, type ClavePlantilla } from "./core";

export const ORIGENES = ["TURNERO", "ALUMNO_LINK", "PROFE", "DIRECTORIO"] as const;
export type OrigenClase = (typeof ORIGENES)[number];

/** El valor de `?desde=` que pone el buscador de profes. */
export const DESDE_DIRECTORIO = "directorio";

const vieneDelDirectorio = (desde: unknown): boolean => typeof desde === "string" && desde.trim().toLowerCase() === DESDE_DIRECTORIO;

/** Origen de un pedido del turnero: DIRECTORIO si vino del buscador; cualquier otra cosa, TURNERO (como hoy). */
export const origenDelPedido = (desde: unknown): "DIRECTORIO" | "TURNERO" => (vieneDelDirectorio(desde) ? "DIRECTORIO" : "TURNERO");

/** Origen de una reserva con el link/cookie del alumno: DIRECTORIO si vino del buscador; si no, ALUMNO_LINK (como hoy). */
export const origenDeReservaConLink = (desde: unknown): "DIRECTORIO" | "ALUMNO_LINK" => (vieneDelDirectorio(desde) ? "DIRECTORIO" : "ALUMNO_LINK");

export type ModoEnvio = "manual" | "cloud";

export interface Canal {
  /** Quién le habla al alumno: GSG (central) o el profe (como hoy). */
  quien: "GSG" | "PROFE";
  /** Cómo sale: la Cloud API (número global) o el botón verde que toca el profe. */
  envio: ModoEnvio;
  /** Textos: los de GSG en tercera persona, o los del profe (los de siempre). */
  voz: "tercera" | "profe";
}

/**
 * Por dónde se avisa. `modo` es el del notificador vigente (`notificadorActual().modo`): ya es
 * «cloud» sólo con PADEL_WHATSAPP=cloud Y credenciales completas; si no, «manual».
 */
export function elegirCanal(origen: unknown, modo: ModoEnvio): Canal {
  if (origen === "DIRECTORIO") return { quien: "GSG", envio: modo, voz: "tercera" };
  return { quien: "PROFE", envio: modo, voz: "profe" };
}

/** Los avisos de GSG, en tercera persona con `{profe}`. `pedidoAlProfe` no es para el alumno. */
export const PLANTILLAS_GSG: Record<Exclude<ClavePlantilla, "pedidoAlProfe">, string> = {
  confirmada:
    "Hola {nombre}! Tu profe {profe} confirmó tu clase del {dia} a las {hora}. Sale {precio}: podés pasarlo al alias {alias} y mandar el comprobante desde tu link: {link}",
  rechazada: "Hola {nombre}! Tu profe {profe} no puede el {dia} a las {hora}. Fijate otro horario acá: {turnero}",
  proxima: "Hola {nombre}! Tu profe {profe} te agendó la próxima clase: {dia} a las {hora}. Si no podés, cancelala desde tu link: {link}",
  pagoOk: "Gracias {nombre}! Tu profe {profe} recibió el pago de la clase del {dia}.",
  pagoNo: "Hola {nombre}! Tu profe {profe} no pudo validar el comprobante de la clase del {dia}. ¿Lo mandás de nuevo desde tu link? {link}",
  recordatorio: "Hola {nombre}! Te recordamos tu clase con tu profe {profe} el {dia} a las {hora}. Si no podés ir, cancelala o cambiala desde tu link: {link}",
  linkAlumno: "Hola {nombre}! Este es tu link para ver tus clases con {profe}, repetir la de la semana que viene y mandar el comprobante: {link}",
  movida: "Hola {nombre}! Tu profe {profe} pasó tu clase del {diaAnterior} {horaAnterior} al {dia} {hora}. La ves en tu link: {link}",
  suspendida: "Hola {nombre}! Tu profe {profe} suspende por {motivo} la clase del {dia} a las {hora}. Elegí otro horario acá: {turnero}",
  recordatorioDeuda:
    "Hola {nombre}! Te pasamos lo que quedó pendiente con tu profe {profe}: {detalle}. Total {total}. Podés pasarlo al alias {alias} y mandar el comprobante desde tu link: {link}",
  linkPedido: "Hola {nombre}! Pediste tu link de clases con {profe}. Acá lo tenés: {link}",
};

/**
 * El texto de GSG para esa clave. «Clase confirmada», según lo cargado: sin precio no dice «Sale
 * $ 0» y sin alias no promete uno (igual que `plantillaConfirmada`). Una clave sin versión de GSG
 * (hoy sólo `pedidoAlProfe`) cae al texto de fábrica.
 */
export function plantillaGsg(clave: ClavePlantilla, datos: { hayPrecio: boolean; hayAlias: boolean }): string {
  if (clave === "pedidoAlProfe") return PLANTILLAS_DEFAULT.pedidoAlProfe;
  if (clave !== "confirmada" || (datos.hayPrecio && datos.hayAlias)) return PLANTILLAS_GSG[clave];
  const inicio = "Hola {nombre}! Tu profe {profe} confirmó tu clase del {dia} a las {hora}.";
  if (datos.hayPrecio) return `${inicio} Sale {precio}. Cuando le pagues, mandá el comprobante desde tu link: {link}`;
  if (datos.hayAlias) return `${inicio} Podés pagarla al alias {alias} y mandar el comprobante desde tu link: {link}`;
  return `${inicio} Desde tu link ves tus clases y mandás el comprobante: {link}`;
}
