// UN SOLO ESPERADO también en la PANTALLA (ADR-101).
//
// El servidor arquea el turno contra el saldo en efectivo del libro (`closeCashSession`,
// `saldoEfectivoDelLibro`). Las pantallas del turno mostraban otro número —fondo tipeado +
// efectivo del turno— y se lo hacían confirmar al cajero («Contaste X y se esperaba Y»): con una
// devolución que no pasó por el turno, la pantalla hacía confirmar un faltante y el servidor
// asentaba otro. Acá está la única cuenta de lo que se muestra: el total es el del libro, y lo
// que el turno no ve va en un renglón propio, para que el desglose sume lo mismo que el total.
//
// Y la guarda de que lo confirmado es lo asentado: el formulario manda el esperado que mostró;
// si al grabar el libro dice otra cosa (entró un movimiento mientras se contaba), no se graba.
//
// PURO y sin Prisma: lo importan las pantallas (una de ellas, client component) y las acciones.

import { expectedCash, summarizeMovements, type CashBreakdown, type CashMethod, type CashMovementLike, type CashMovementType } from "@/lib/caja/cash-register";
import { fmtMoneyARS } from "@/components/ui/format";
import { round2 } from "@/lib/round";

export type EsperadoDelCajon = {
  /** El desglose del efectivo del turno (ventas, ingresos, gastos, retiros). */
  desglose: CashBreakdown;
  /** Fondo + efectivo del turno: lo que el turno solo ve. */
  delTurno: number;
  /** Efectivo del libro que no pasó por el turno (con signo). 0 si coinciden. */
  fueraDelTurno: number;
  /** El número que se muestra, se confirma y se arquea: el del libro. */
  esperado: number;
};

type TurnoAbierto = {
  openingFloat: number;
  movements: readonly { type: string; amount: number; method?: string | null }[];
};

/**
 * Lo que la pantalla dice que tiene que haber en el cajón. `esperadoDelLibro` es
 * `getCajaData().esperadoEnElCajon`: el MISMO número con el que arquea `closeCashSession`.
 * `null` sólo en la demo (no hay libro): ahí vale el del turno.
 */
export function esperadoDelCajon(turno: TurnoAbierto, esperadoDelLibro: number | null): EsperadoDelCajon {
  const movs: CashMovementLike[] = turno.movements.map((m) => ({
    type: m.type as CashMovementType,
    amount: m.amount,
    // Un movimiento sin medio (la demo) es efectivo: el mismo relleno que la aritmética del turno.
    method: (m.method ?? "EFECTIVO") as CashMethod,
  }));
  const delTurno = expectedCash(turno.openingFloat, movs);
  const esperado = esperadoDelLibro === null || !Number.isFinite(esperadoDelLibro) ? delTurno : round2(esperadoDelLibro);
  return { desglose: summarizeMovements(movs), delTurno, fueraDelTurno: round2(esperado - delTurno), esperado };
}

/** Nombre del campo del formulario que lleva el esperado que el cajero tuvo a la vista. */
export const CAMPO_ESPERADO_CONFIRMADO = "esperadoConfirmado";

/** Cómo viaja el esperado en el formulario: número de máquina, no plata tipeada (no pasa por `leerImporte`). */
export function esperadoParaElFormulario(esperado: number): string {
  return String(round2(esperado));
}

/**
 * ¿El esperado que el cajero confirmó es el que el libro dice al grabar? Si no, no se graba:
 * lo que se confirma en la pantalla y lo que queda asentado tienen que ser el mismo número.
 * Sin esperado (una pantalla vieja, un envío a mano) se rechaza: denegar por defecto.
 */
export function esperadoConfirmadoVigente(
  crudo: FormDataEntryValue | null,
  delLibro: number,
): { ok: true } | { ok: false; error: string } {
  const texto = typeof crudo === "string" ? crudo.trim() : "";
  const confirmado = texto === "" ? NaN : Number(texto);
  // Puede ser negativo: un libro que da el cajón en rojo también es lo que se mostró.
  if (!Number.isFinite(confirmado)) {
    return { ok: false, error: "No sabemos contra qué número contaste. Recargá la página y volvé a cargar el conteo." };
  }
  if (round2(confirmado) === round2(delLibro)) return { ok: true };
  return {
    ok: false,
    error: `Mientras contabas cambió el efectivo esperado en el cajón: ahora es ${fmtMoneyARS(delLibro)}, no ${fmtMoneyARS(confirmado)} (entró o salió un movimiento). No se grabó nada: revisá el conteo y volvé a confirmar.`,
  };
}
