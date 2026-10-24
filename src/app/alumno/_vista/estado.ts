// Lo puro de «Mis clases»: qué chip lleva cada clase (⏳ esperando / ✓ confirmada / ✕ no va), la
// hora relativa («en 20 h»), hasta cuándo se cancela gratis, cuánto se ve una clase que ya no va
// (48 h, tachada, con su salida) y la línea de la cuenta («Debés…» / «Estás al día ✓» / «a favor»).
// Corre en el servidor (VistaAlumno): la fecha de «ahora» se inyecta, así las pruebas fijan el día.

import { MOTIVO_OTRO_CAMBIO_CONFIRMADO, PAGO_LABEL, MEDIO_LABEL, esMedioCobro, horaHumana, pesos, puedeCancelarAlumno, type EstadoClase, type EstadoPago } from "@/lib/padel/core";

const HORA = 3_600_000;
const ZONA = "America/Argentina/Buenos_Aires";

export interface ClaseVista {
  id: string;
  empiezaEn: Date;
  terminaEn: Date;
  estado: EstadoClase;
  pagoEstado: EstadoPago;
  pagoMedio: string | null;
  precio: number;
  motivoCancel: string | null;
  pagoNota?: string | null;
  rechazadaEl?: Date | null;
  canceladaEl?: Date | null;
}

export type Tono = "espera" | "ok" | "fin" | "neutro";

/** «en 45 min», «en 20 h», «en 3 días», «ya empezó». */
export function enCuanto(empiezaEn: Date, ahora: Date): string {
  const ms = empiezaEn.getTime() - ahora.getTime();
  if (ms <= 0) return "ya empezó";
  const min = Math.round(ms / 60_000);
  if (min < 60) return `en ${Math.max(1, min)} min`;
  const h = Math.round(ms / HORA);
  if (h < 36) return `en ${h} h`;
  const d = Math.round(ms / (24 * HORA));
  return `en ${d} días`;
}

/** El chip de estado: ícono distinto para lo que espera y lo confirmado (M-099), nunca sólo color. */
export function chipEstado(estado: EstadoClase, profe: string, motivoCancel?: string | null): { icono: string; texto: string; tono: Tono } {
  // O-5c: un pedido de cambio que se cayó porque quedó el otro no es «el profe no puede».
  if (estado === "RECHAZADA" && motivoCancel === MOTIVO_OTRO_CAMBIO_CONFIRMADO) return { icono: "↪", texto: "Quedó el otro horario", tono: "neutro" };
  switch (estado) {
    case "PEDIDA":
      return { icono: "⏳", texto: `Esperando a ${profe}`, tono: "espera" };
    case "CONFIRMADA":
      return { icono: "✓", texto: "Confirmada", tono: "ok" };
    case "DADA":
      return { icono: "✓", texto: "Dada", tono: "neutro" };
    case "AUSENTE":
      return { icono: "•", texto: "No fuiste", tono: "neutro" };
    case "RECHAZADA":
      return { icono: "✕", texto: `${profe} no puede ese horario`, tono: "fin" };
    case "SIN_RESPUESTA":
      return { icono: "✕", texto: `${profe} no llegó a confirmarte`, tono: "fin" };
    case "CANCELADA":
    default:
      return { icono: "✕", texto: "Cancelada", tono: "fin" };
  }
}

/** «2 h», «1 h 30 min», «1 día», «30 min». */
export function textoAnticipacion(min: number): string {
  const m = Math.max(0, Math.round(min));
  if (m === 0) return "";
  if (m % 1440 === 0) return m === 1440 ? "1 día" : `${m / 1440} días`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (!h) return `${r} min`;
  return r ? `${h} h ${r} min` : `${h} h`;
}

/** La regla a la vista en el turnero (M-090): «Cancelás gratis hasta 2 h antes». */
export const reglaDeCancelacion = (anticipacionMin: number): string =>
  anticipacionMin > 0 ? `Cancelás gratis hasta ${textoAnticipacion(anticipacionMin)} antes` : "Cancelás gratis hasta que empiece";

const mismoDia = (a: Date, b: Date) => a.toLocaleDateString("en-CA", { timeZone: ZONA }) === b.toLocaleDateString("en-CA", { timeZone: ZONA });

/**
 * ¿La puede cancelar (o cambiar) el alumno, y hasta cuándo? (M-103/M-104/M-107)
 * Dentro del plazo: «gratis hasta las 16:00» (o «hasta el mié 22 a las 16:00» si es otro día).
 * Fuera: por qué no, con la regla del profe.
 */
export function plazoCancelar(c: Pick<ClaseVista, "estado" | "empiezaEn">, ahora: Date, anticipacionMin: number): { puede: boolean; texto: string } {
  if (puedeCancelarAlumno(c.estado, c.empiezaEn, ahora, anticipacionMin)) {
    const limite = new Date(c.empiezaEn.getTime() - anticipacionMin * 60_000);
    if (anticipacionMin <= 0) return { puede: true, texto: "gratis hasta que empiece" };
    if (mismoDia(limite, ahora)) return { puede: true, texto: `gratis hasta las ${horaHumana(limite)}` };
    const dia = limite.toLocaleDateString("es-AR", { weekday: "short", day: "numeric", timeZone: ZONA }).replace(".", "").replace(",", "");
    return { puede: true, texto: `gratis hasta el ${dia} a las ${horaHumana(limite)}` };
  }
  const regla = anticipacionMin > 0 ? ` (${textoAnticipacion(anticipacionMin)} antes)` : "";
  return { puede: false, texto: `Ya pasó el límite para cancelar o cambiar gratis${regla}.` };
}

const TERMINALES: readonly EstadoClase[] = ["RECHAZADA", "CANCELADA", "SIN_RESPUESTA"];

/** Cuándo dejó de ir: la hora del rechazo o de la cancelación; un pedido vencido, a la hora de la clase. */
function cuandoTermino(c: ClaseVista): Date {
  if (c.estado === "RECHAZADA" && c.rechazadaEl) return c.rechazadaEl;
  if (c.estado === "CANCELADA" && c.canceladaEl) return c.canceladaEl;
  return c.empiezaEn;
}

/** Una clase que ya no va se ve 48 h, tachada, con su explicación y una salida (M-027/M-100). */
export function terminalVisible(c: ClaseVista, ahora: Date): boolean {
  if (!TERMINALES.includes(c.estado)) return false;
  const pasaron = ahora.getTime() - cuandoTermino(c).getTime();
  return pasaron >= -60_000 && pasaron < 48 * HORA;
}

/** Por qué no va, en criollo, y si la plata quedó a favor (M-101). */
export function explicacionTerminal(c: ClaseVista, profe: string): string {
  const motivo = (c.motivoCancel ?? "").trim();
  let base: string;
  if (c.estado === "RECHAZADA" && motivo === MOTIVO_OTRO_CAMBIO_CONFIRMADO) base = MOTIVO_OTRO_CAMBIO_CONFIRMADO;
  else if (c.estado === "RECHAZADA") base = `${profe} no puede ese horario`;
  else if (c.estado === "SIN_RESPUESTA") base = `${profe} no llegó a confirmarte`;
  else if (motivo === "La canceló el alumno") base = `La cancelaste vos. ${profe} ya lo sabe`;
  else if (motivo === "La pasó a otro horario") base = "La pasaste a otro horario";
  else if (!motivo || motivo === "La canceló el profe") base = `${profe} la canceló`;
  else base = `${profe} la canceló · ${motivo}`;
  if (c.pagoEstado === "ACREDITADO") return `${base}. Lo que pagaste (${pesos(c.precio)}) quedó a favor: tu próxima clase se paga con eso.`;
  return `${base}.`;
}

/** «Pagada · Transferencia», «Sin pagar», «Comprobante por revisar». */
export function etiquetaPago(c: Pick<ClaseVista, "pagoEstado" | "pagoMedio" | "precio">): string {
  if (!(c.precio > 0)) return "Sin cargo";
  const base = PAGO_LABEL[c.pagoEstado] ?? "Sin pagar";
  if (c.pagoEstado === "PAGADO" && c.pagoMedio && (esMedioCobro(c.pagoMedio) || c.pagoMedio === "SALDO_A_FAVOR")) {
    return `${base} · ${MEDIO_LABEL[c.pagoMedio as keyof typeof MEDIO_LABEL].toLowerCase()}`;
  }
  return base;
}

/** La línea grande de la cuenta: lo que debe manda; si no, el saldo; si no, al día. */
export function lineaDeCuenta(p: { debe: number; clasesQueDebe: number; saldoAFavor: number }): { titulo: string; tono: "debe" | "favor" | "al-dia" } {
  if (p.debe > 0) return { titulo: `Debés ${pesos(p.debe)} · ${p.clasesQueDebe} clase${p.clasesQueDebe === 1 ? "" : "s"}`, tono: "debe" };
  if (p.saldoAFavor > 0) return { titulo: `Tenés ${pesos(p.saldoAFavor)} a favor`, tono: "favor" };
  return { titulo: "Estás al día ✓", tono: "al-dia" };
}

/** «Cómo llegar»: Google Maps con la dirección que cargó el profe (null si no cargó ninguna). */
export const urlMaps = (lugar: string | null | undefined): string | null =>
  lugar && lugar.trim() ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(lugar.trim())}` : null;
