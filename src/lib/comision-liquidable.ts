// ¿ESTE TURNO SE PUEDE LIQUIDAR YA? — regla pura.
//
// El agujero que cierra, y que costaba plata de una persona que trabajó:
//
// Un turno se puede completar "dejando saldo a cobrar" (camino previsto: COMPLETED con
// saldo > 0). Si se liquida la comisión en ese estado, la liquidación congela el turno con
// su `commissionPayoutId`. Cuando después se cobra el saldo, el `Payment` sube — pero el
// turno YA tiene payout, y el filtro de pendientes exige `commissionPayoutId: null`
// (`commission-actions.ts`). Resultado: **la comisión sobre el saldo no vuelve a entrar
// nunca**. La profesional cobra sobre la seña y pierde el resto, sin que nadie se entere.
//
// La regla es esperar: un turno con saldo pendiente no se liquida todavía. No decide la
// pregunta abierta del dueño —si la comisión se devenga sobre el precio o sobre lo
// cobrado—, y por eso es el arreglo correcto para hacer ahora: con el turno saldado las
// dos reglas dan lo mismo, así que la respuesta no se adelanta a la decisión.

import { estadoCobroTurno, type CobroTurno, type PagoLegado } from "@/lib/turnos/cobros";

export type TurnoLiquidable = {
  precio: number;
  cobros: readonly CobroTurno[];
  pagoLegado?: PagoLegado;
};

/**
 * `true` si el turno está saldado y su comisión se puede liquidar. Un turno con saldo
 * pendiente espera; uno sobrepagado también liquida (el saldo no es negativo para la
 * profesional).
 */
export function sePuedeLiquidar(turno: TurnoLiquidable): boolean {
  return estadoCobroTurno(turno).saldo <= 0;
}

/** Los que quedaron esperando, para poder decirlo en pantalla en vez de que desaparezcan. */
export function separarPorSaldo<T extends TurnoLiquidable>(
  turnos: readonly T[],
): { liquidables: T[]; conSaldo: T[] } {
  const liquidables: T[] = [];
  const conSaldo: T[] = [];
  for (const t of turnos) (sePuedeLiquidar(t) ? liquidables : conSaldo).push(t);
  return { liquidables, conSaldo };
}
