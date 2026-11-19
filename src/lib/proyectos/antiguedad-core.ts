// ============================================================================
// ANTIGÜEDAD DE LAS DEUDAS (MIA-50 T09 · O34). PURO.
// Las cuotas pendientes de cobro y de pago, por tramos de días de atraso. Los límites de los tramos son el parámetro
// `antiguedad.tramos` (p. ej. 30, 60, 90 → «A vencer», «Hasta 30 días», «31 a 60», «61 a 90», «Más de 90»): cambiarlos
// reagrupa sin tocar código. Se suma en centavos enteros: la suma de los tramos es, exacta, la de las cuotas pendientes.
// ============================================================================

import { diasDeAtraso, estadoCuota } from "./gestion-core";

export interface Tramo { id: string; etiqueta: string }

/** Los tramos que arman unos límites ordenados de menor a mayor. */
export function tramosDe(limites: readonly number[]): Tramo[] {
  const tramos: Tramo[] = [{ id: "A_VENCER", etiqueta: "A vencer" }];
  limites.forEach((hasta, i) => {
    const desde = i === 0 ? null : limites[i - 1] + 1;
    tramos.push({ id: `HASTA_${hasta}`, etiqueta: desde == null ? `Hasta ${hasta} días` : `${desde} a ${hasta} días` });
  });
  const ultimo = limites[limites.length - 1];
  if (ultimo != null) tramos.push({ id: `MAS_DE_${ultimo}`, etiqueta: `Más de ${ultimo} días` });
  return tramos;
}

/** El tramo de una cuota: «A vencer» si no venció; si no, el primero cuyo límite alcanza sus días de atraso. */
export function tramoDe(limites: readonly number[], venceEl: Date, hoy: Date): string {
  if (estadoCuota({ venceEl, pagadoEl: null }, hoy) !== "VENCIDA") return "A_VENCER";
  const dias = diasDeAtraso(venceEl, hoy);
  const hasta = limites.find((l) => dias <= l);
  return hasta != null ? `HASTA_${hasta}` : `MAS_DE_${limites[limites.length - 1]}`;
}

export interface CuotaPendiente { tipo: string; importe: number; venceEl: Date }
export interface FilaTramo extends Tramo { total: number; cantidad: number }
export interface Antiguedad { tramos: FilaTramo[]; total: number; cantidad: number }

const centavos = (n: number) => Math.round(n * 100);

/** Una tabla por lado (cobro y pago). Las cuotas con importe 0 o menos (ya cubiertas) no cuentan. */
export function antiguedadDe(cuotas: readonly CuotaPendiente[], limites: readonly number[], hoy: Date): { COBRO: Antiguedad; PAGO: Antiguedad } {
  const lado = (cobro: boolean): Antiguedad => {
    const tramos = tramosDe(limites).map((t) => ({ ...t, c: 0, cantidad: 0 }));
    for (const q of cuotas) {
      if ((q.tipo === "COBRO") !== cobro || !(centavos(q.importe) > 0)) continue;
      const t = tramos.find((x) => x.id === tramoDe(limites, q.venceEl, hoy))!;
      t.c += centavos(q.importe);
      t.cantidad++;
    }
    const total = tramos.reduce((s, t) => s + t.c, 0);
    return { tramos: tramos.map(({ c, ...t }) => ({ ...t, total: c / 100 })), total: total / 100, cantidad: tramos.reduce((s, t) => s + t.cantidad, 0) };
  };
  return { COBRO: lado(true), PAGO: lado(false) };
}
