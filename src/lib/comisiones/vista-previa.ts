// ============================================================================
// VISTA PREVIA DE LA LIQUIDACIÓN — turno por turno, antes de apretar. PURA.
// ============================================================================
//
// Spec: docs/producto/comisiones/LIQUIDACION.md §2 («Vista previa por profesional») y §5-T1.
//
// EL TOTAL NO SE CALCULA ACÁ. Sale de `comisionesPendientes` (reports/comisiones.ts), que corre
// `sePuedeLiquidar` + `calcularLiquidacion`: la MISMA guarda y la MISMA fórmula que
// `settleCommissions` congela en el `CommissionPayout`. Lo único que se agrega es el corte del
// período (`entraEnElCorte`, la misma regla que la liquidación) y el detalle por turno para mirar.
// Si algún día el detalle y el total no dieran lo mismo, la pantalla muestra el total que se va a
// congelar y avisa (`detalleCuadra`), nunca uno inventado. Plata en CENTAVOS ENTEROS (§3).

import { montoComision, resolvePct } from "@/lib/comision-liquidacion";
import { sePuedeLiquidar } from "@/lib/comision-liquidable";
import { comisionesPendientes, type TurnoPendiente } from "@/lib/reports/comisiones";
import { entraEnElCorte, esDeAntes, type PeriodoComision } from "./periodo";

/** Pesos (Float con `round2`) → centavos enteros. */
export const aCentavos = (pesos: number) => Math.round(pesos * 100);

export interface LineaDeVistaPrevia {
  id: string;
  startsAt: Date;
  servicio: string;
  clienta: string;
  /** Lo cobrado del turno (la base), en centavos. */
  baseCents: number;
  pct: number;
  comisionCents: number;
  /** De un período anterior que se saldó tarde: entra igual (§2), se marca. */
  deAntes: boolean;
}

export interface VistaPreviaProfesional {
  professionalId: string;
  professionalName: string;
  lineas: LineaDeVistaPrevia[];
  /** Lo que se congela al liquidar: `calcularLiquidacion`, en centavos. */
  totalCents: number;
  /** Lo cobrado sobre lo que se calculó («sobre $X»), en centavos. */
  baseCents: number;
  /** ¿La suma de los renglones da el total? Si no, la pantalla lo dice (no debería pasar nunca). */
  detalleCuadra: boolean;
}

export interface VistaPrevia {
  periodo: PeriodoComision;
  profesionales: VistaPreviaProfesional[];
  totalCents: number;
  /** Turnos del período que esperan que se cobre el saldo (no entran todavía). */
  esperandoSaldo: number;
  /** Turnos pendientes de DESPUÉS del corte: entran en el período siguiente. */
  despuesDelCorte: number;
}

/**
 * La vista previa del período: un bloque por profesional con sus turnos, de mayor a menor. PURA.
 * `overrides`: profesional → servicio → % (`overridesPorProfesional`).
 */
export function armarVistaPrevia(
  turnos: readonly TurnoPendiente[],
  overrides: ReadonlyMap<string, ReadonlyMap<string, number>>,
  periodo: PeriodoComision,
): VistaPrevia {
  const enCorte = turnos.filter((t) => entraEnElCorte(t.startsAt, periodo));
  const despuesDelCorte = turnos.length - enCorte.length;
  const sinOverrides = new Map<string, number>();

  // El total de cada profesional: la función de siempre, sobre los turnos del corte.
  const pendientes = comisionesPendientes(enCorte, overrides);

  let esperandoSaldo = 0;
  const lineasPorProfesional = new Map<string, LineaDeVistaPrevia[]>();
  for (const t of enCorte) {
    if (!t.payment) continue;
    const pct = resolvePct(t.pctGeneral, overrides.get(t.professionalId) ?? sinOverrides, t.serviceId);
    if (pct <= 0) continue; // no paga comisión: no entra ni se estampa (calcularLiquidacion)
    if (!sePuedeLiquidar({ precio: t.precio, cobros: t.cobros, pagoLegado: t.payment })) {
      esperandoSaldo += 1;
      continue;
    }
    const lista = lineasPorProfesional.get(t.professionalId) ?? [];
    lista.push({
      id: t.id,
      startsAt: t.startsAt,
      servicio: t.servicio ?? "Servicio",
      clienta: t.clienta ?? "",
      baseCents: aCentavos(t.payment.amount),
      pct,
      comisionCents: aCentavos(montoComision(t.payment.amount, pct)),
      deAntes: esDeAntes(t.startsAt, periodo),
    });
    lineasPorProfesional.set(t.professionalId, lista);
  }

  const profesionales = pendientes.map((p): VistaPreviaProfesional => {
    const lineas = (lineasPorProfesional.get(p.professionalId) ?? []).sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
    const totalCents = aCentavos(p.amount);
    return {
      professionalId: p.professionalId,
      professionalName: p.professionalName,
      lineas,
      totalCents,
      baseCents: aCentavos(p.ingresos),
      detalleCuadra: lineas.reduce((s, l) => s + l.comisionCents, 0) === totalCents,
    };
  });

  return {
    periodo,
    profesionales,
    totalCents: profesionales.reduce((s, p) => s + p.totalCents, 0),
    esperandoSaldo,
    despuesDelCorte,
  };
}
