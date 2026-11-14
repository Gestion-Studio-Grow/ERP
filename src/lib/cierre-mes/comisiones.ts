// ============================================================================
// CIERRE DEL MES, paso 6 — qué turnos del mes tienen la comisión por liquidar. PURO.
// ============================================================================
//
// "Pendiente" tiene que ser EXACTAMENTE lo que la liquidación (commission-actions.ts) puede
// liquidar, o el paso queda pendiente sin salida: el botón "Liquidar comisiones" no resuelve
// algo que la liquidación no toma. La liquidación deja afuera dos cosas, y acá también:
//   · el turno con saldo por cobrar (`sePuedeLiquidar`, comision-liquidable.ts): se liquida
//     cuando se cobre el saldo. No es un pendiente de comisiones sino de cobro, y se dice
//     aparte ("esperan que se cobre el saldo");
//   · el turno cuyo porcentaje da 0 (`resolvePct` > 0, comision-liquidacion.ts): esa
//     profesional o ese servicio no pagan comisión, y la liquidación nunca lo toma.
//   · el turno con cobros de la profesional todavía sin rendir (`seLiquidaSegunRendicion`,
//     comisiones/comision-no-rendida.ts, CH-011): se liquida cuando rinda, y se dice aparte.
//
// Las mismas dos funciones que usa la liquidación, no una copia de sus reglas.

import { resolvePct } from "@/lib/comision-liquidacion";
import { sePuedeLiquidar } from "@/lib/comision-liquidable";
import { seLiquidaSegunRendicion } from "@/lib/comisiones/comision-no-rendida";
import type { CobroTurno, PagoLegado } from "@/lib/turnos/cobros";

/** Un turno realizado, cobrado y sin liquidar, con lo que hace falta para decidir. */
export interface TurnoSinLiquidar {
  professionalId: string;
  serviceId: string;
  /** El precio del turno (`priceAtBooking ?? service.price`, como la liquidación). */
  precio: number;
  cobros: readonly CobroTurno[];
  pagoLegado?: PagoLegado;
  /** Lo cobrado por la profesional que todavía no rindió (0/ausente: nada pendiente). */
  pendienteDeRendir?: number;
}

export interface ComisionesDelMes {
  /** Turnos que la liquidación puede liquidar hoy. */
  pendientes: number;
  /** Turnos con comisión que esperan que se cobre el saldo: todavía no se pueden liquidar. */
  esperanSaldo: number;
  /** Turnos con comisión que esperan que la profesional rinda lo cobrado. */
  esperanRendicion?: number;
}

/**
 * Cuenta los turnos del mes según lo que haría la liquidación con cada uno. PURA.
 * `pctGeneral`: el porcentaje de cada profesional; `overrides`: profesional → servicio → %.
 */
export function contarComisionesDelMes(
  turnos: readonly TurnoSinLiquidar[],
  pctGeneral: ReadonlyMap<string, number>,
  overrides: ReadonlyMap<string, ReadonlyMap<string, number>>,
): ComisionesDelMes {
  const sinOverrides: ReadonlyMap<string, number> = new Map();
  let pendientes = 0;
  let esperanSaldo = 0;
  let esperanRendicion = 0;
  for (const t of turnos) {
    const pct = resolvePct(pctGeneral.get(t.professionalId) ?? 0, overrides.get(t.professionalId) ?? sinOverrides, t.serviceId);
    if (!(pct > 0)) continue;
    if (!sePuedeLiquidar({ precio: t.precio, cobros: t.cobros, pagoLegado: t.pagoLegado })) esperanSaldo++;
    else if (!seLiquidaSegunRendicion(t.pendienteDeRendir)) esperanRendicion++;
    else pendientes++;
  }
  return { pendientes, esperanSaldo, esperanRendicion };
}
