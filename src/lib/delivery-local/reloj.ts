// ============================================================================
// DELIVERY LOCAL · EL RELOJ DEL PEDIDO — cuándo llega, y cuánto hace que espera confirmación. PURA.
// ============================================================================
//
// Sin node:crypto ni servidor: lo usan el seguimiento público (servidor) y el tablero del comercio
// (cliente). Sin cron, sin tablas: todo sale de `createdAt` del pedido y de la hora de quien mira.
//
// EL RANGO. Se promete un rango, nunca una hora exacta: desde = alta + `demoraMin` (redondeado para
// abajo a 5 min) y hasta = desde + VENTANA (redondeado para arriba a 5 min). Se cuenta desde el ALTA
// del pedido (Order no guarda cuándo se confirmó): es lo que el cliente esperó desde que lo mandó.
// Sólo envíos: en un retiro, la demora del delivery no dice nada.
//
// EL VENCIMIENTO. Los términos (legales.ts) le dan al local MINUTOS_PARA_CONFIRMAR: pasado eso (más
// de 30 min, no «30 justos»), el cliente puede bajarlo. NO se cancela solo: se le avisa al cliente y
// el local ve el chip desde los 20 min, para llegar antes de que venza.

import { MINUTOS_PARA_CONFIRMAR } from "./legales";

export const ZONA_HORARIA = "America/Argentina/Buenos_Aires";
/** Ancho del rango prometido, en minutos. */
export const VENTANA_DEL_RANGO_MIN = 15;
/** Desde cuántos minutos sin confirmar el tablero del local muestra el chip rojo. */
export const MINUTOS_AVISO_AL_LOCAL = 20;

const MIN = 60_000;
const CINCO = 5 * MIN;

let formato: Intl.DateTimeFormat | null = null;

/** «18:05», reloj de 24 h en la hora argentina (el servidor corre en UTC). */
export function horaArgentina(instante: Date): string {
  formato ??= new Intl.DateTimeFormat("es-AR", { timeZone: ZONA_HORARIA, hour: "2-digit", minute: "2-digit", hour12: false });
  const partes: Record<string, string> = {};
  for (const p of formato.formatToParts(instante)) if (p.type !== "literal") partes[p.type] = p.value;
  return `${partes.hour === "24" ? "00" : partes.hour}:${partes.minute}`;
}

export type RangoDeLlegada = { desde: string; hasta: string; hastaMs: number };

/** El rango «entre las 18:20 y 18:35», o null sin demora configurada (o con una inválida). */
export function rangoDeLlegada(creadoEn: Date, demoraMin: number | null | undefined): RangoDeLlegada | null {
  if (typeof demoraMin !== "number" || !Number.isFinite(demoraMin) || demoraMin <= 0) return null;
  const alta = creadoEn.getTime();
  if (!Number.isFinite(alta)) return null;
  // La Argentina está a −3 h justas de UTC: redondear a 5 min en UTC es redondear en la hora local.
  const desde = Math.floor((alta + demoraMin * MIN) / CINCO) * CINCO;
  const hasta = Math.ceil((alta + (demoraMin + VENTANA_DEL_RANGO_MIN) * MIN) / CINCO) * CINCO;
  return { desde: horaArgentina(new Date(desde)), hasta: horaArgentina(new Date(hasta)), hastaMs: hasta };
}

/** Minutos enteros desde el alta (nunca negativos: un reloj corrido no da «hace −2 min»). */
export function minutosDesde(creadoEn: Date | string, ahora: Date | number): number {
  const alta = new Date(creadoEn).getTime();
  const ya = typeof ahora === "number" ? ahora : ahora.getTime();
  if (!Number.isFinite(alta) || !Number.isFinite(ya)) return 0;
  return Math.max(0, Math.floor((ya - alta) / MIN));
}

/** ¿Pasó el plazo de los términos sin que el local confirme? Estrictamente más de 30 min. */
export function confirmacionVencida(p: { status: string; creadoEn: Date; ahora: Date }): boolean {
  if (p.status !== "PENDING") return false;
  return p.ahora.getTime() - p.creadoEn.getTime() > MINUTOS_PARA_CONFIRMAR * MIN;
}

/**
 * El chip del tablero del local: los minutos que lleva sin confirmar, sólo si es PENDING y pasaron
 * MINUTOS_AVISO_AL_LOCAL o más. null = no se muestra nada.
 */
export function minutosSinConfirmar(p: { status: string; creado: Date | string; ahora: Date | number }): number | null {
  if (p.status !== "PENDING") return null;
  const n = minutosDesde(p.creado, p.ahora);
  return n >= MINUTOS_AVISO_AL_LOCAL ? n : null;
}
