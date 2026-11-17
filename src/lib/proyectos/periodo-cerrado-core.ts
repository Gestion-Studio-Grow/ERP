// O40 · «período cerrado» para Proyectos, la parte PURA: si el día en que asentaría una acción ya está cerrado en la
// caja (o su mes, congelado), el texto entero del rechazo con lo que hay que hacer. La lectura de la base y el candado
// van en `periodo-cerrado.server.ts`. Se prueba en periodo-cerrado-core.test.ts.

import { formatDayLabel, isFrozenDay, nextDayKey, type DayKey } from "@/lib/caja/cierre-diario";

/** Qué se intentó asentar, para nombrarlo en el rechazo («este cobro»). */
export type QueSeAsienta = "cobro" | "pago" | "anulación" | "rendición" | "movimiento" | "venta" | "compra" | "devolución" | "comisión";

const ESTE: Record<QueSeAsienta, string> = {
  cobro: "este cobro",
  pago: "este pago",
  anulación: "esta anulación",
  rendición: "este movimiento de la rendición",
  movimiento: "este movimiento",
  venta: "esta venta",
  compra: "esta compra",
  devolución: "esta devolución",
  comisión: "esta liquidación de comisiones",
};

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/** «noviembre de 2026» para la clave «2026-11». */
export function etiquetaMes(mes: string): string {
  const [a, m] = mes.split("-").map(Number);
  return MESES[m - 1] ? `${MESES[m - 1]} de ${a}` : mes;
}

/**
 * El rechazo, o `null` si el día está abierto. `dia` es el día de caja en que se asentaría (hoy: las acciones de
 * Proyectos asientan con la fecha del momento); `frontera`, el último día cerrado (`lastClosedDay`); `mesCongelado`,
 * si el mes de `dia` está congelado en Cierre del mes. Primero el mes: reabrir el día no alcanza si el mes está congelado.
 */
export function motivoPeriodoCerrado(p: { dia: DayKey; frontera: DayKey | null; mesCongelado: boolean; que?: QueSeAsienta; verbo?: "registró" | "borró" }): string | null {
  const este = ESTE[p.que ?? "movimiento"];
  const verbo = p.verbo ?? "registró";
  const mes = etiquetaMes(p.dia.slice(0, 7));
  if (p.mesCongelado) {
    return `No se ${verbo} ${este}: ${mes} está congelado en Cierre del mes, y asentaría en la caja del ${formatDayLabel(p.dia)}. Para cargarlo, quien administra tiene que reabrir ${mes} en Caja › Cierre del mes (queda registrado quién y por qué) y volvés a intentar.`;
  }
  if (!isFrozenDay(p.dia, p.frontera)) return null;
  const abierto = nextDayKey(p.frontera!);
  return `No se ${verbo} ${este}: la caja del ${formatDayLabel(p.dia)} ya está cerrada y asentaría en ese día. Si es de hoy, reabrí el cierre del día en Caja › Cierre del día y volvé a intentar; si no, cargalo el ${formatDayLabel(abierto)}, el primer día abierto, y aclaralo en la nota.`;
}
