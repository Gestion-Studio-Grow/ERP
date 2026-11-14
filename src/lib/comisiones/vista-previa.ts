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
import { centavosDe } from "@/lib/dinero/redondeo";
import { sePuedeLiquidar } from "@/lib/comision-liquidable";
import { baseDeComision } from "./base";
import { seLiquidaSegunRendicion } from "./comision-no-rendida";
import { comisionesPendientes, type TurnoPendiente } from "@/lib/reports/comisiones";
import { entraEnElCorte, esDeAntes, type PeriodoComision } from "./periodo";

/** Pesos (Float con `round2`) → centavos enteros, con la regla única del módulo de plata. */
export const aCentavos = (pesos: number) => centavosDe(pesos);

export interface LineaDeVistaPrevia {
  id: string;
  startsAt: Date;
  servicio: string;
  clienta: string;
  /** La base del turno: lo cobrado menos lo pagado con voucher (`baseDeComision`), en centavos. */
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

/** Un turno que la profesional cobró y todavía no rindió: no se paga hasta que rinda. */
export interface LineaPendienteDeRendir extends LineaDeVistaPrevia {
  /** Lo que falta rendir de este turno (Σ de sus cobros a rendir pendientes), en centavos. */
  pendienteDeRendirCents: number;
}

/**
 * Lo que espera la rendición, por profesional (comisiones/comision-no-rendida.ts). Se muestra como
 * «Pendiente de rendir», sin botón: NO entra en `totalCents` ni en lo que paga `settleCommissions`.
 */
export interface PendienteDeRendirProfesional {
  professionalId: string;
  professionalName: string;
  lineas: LineaPendienteDeRendir[];
  /** Lo que falta rendir, en centavos («pendiente de rendir $37.000»). */
  pendienteDeRendirCents: number;
  /** La comisión de esos turnos, que se va a pagar cuando rinda (sólo informativa), en centavos. */
  comisionCents: number;
}

export interface VistaPrevia {
  periodo: PeriodoComision;
  profesionales: VistaPreviaProfesional[];
  totalCents: number;
  /**
   * Turnos del período que esperan que se cobre el saldo (no entran todavía). Cuenta sólo los que ya
   * tienen un pago APPROVED (el `where` de la liquidación); el aviso de Comisiones
   * (`leerTurnosEsperandoSaldo`) cuenta también los sin cobro. Deuda anotada en LIQUIDACION.md.
   */
  esperandoSaldo: number;
  /** Turnos pendientes de DESPUÉS del corte: entran en el período siguiente. */
  despuesDelCorte: number;
  /** Turnos del período saldados pero con cobros sin rendir: esperan la rendición (sin botón). */
  pendientesDeRendir: PendienteDeRendirProfesional[];
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
  const porRendir = new Map<string, PendienteDeRendirProfesional>();
  for (const t of enCorte) {
    if (!t.payment) continue;
    const pct = resolvePct(t.pctGeneral, overrides.get(t.professionalId) ?? sinOverrides, t.serviceId);
    if (pct <= 0) continue; // no paga comisión: no entra ni se estampa (calcularLiquidacion)
    if (!sePuedeLiquidar({ precio: t.precio, cobros: t.cobros, pagoLegado: t.payment })) {
      esperandoSaldo += 1;
      continue;
    }
    // La MISMA base que el total (reports/comisiones.ts → calcularLiquidacion): lo cobrado menos
    // lo pagado con voucher. Con `payment.amount` crudo el renglón no cuadraba con un voucher.
    const base = baseDeComision(t.payment.amount, t.cobros);
    const linea: LineaDeVistaPrevia = {
      id: t.id,
      startsAt: t.startsAt,
      servicio: t.servicio ?? "Servicio",
      clienta: t.clienta ?? "",
      baseCents: aCentavos(base),
      pct,
      comisionCents: aCentavos(montoComision(base, pct)),
      deAntes: esDeAntes(t.startsAt, periodo),
    };
    // La MISMA guarda que el total y que `settleCommissions`: con cobros sin rendir, espera.
    if (!seLiquidaSegunRendicion(t.pendienteDeRendir)) {
      let g = porRendir.get(t.professionalId);
      if (!g) {
        g = { professionalId: t.professionalId, professionalName: t.professionalName, lineas: [], pendienteDeRendirCents: 0, comisionCents: 0 };
        porRendir.set(t.professionalId, g);
      }
      const pendienteDeRendirCents = aCentavos(t.pendienteDeRendir ?? 0);
      g.lineas.push({ ...linea, pendienteDeRendirCents });
      g.pendienteDeRendirCents += pendienteDeRendirCents;
      g.comisionCents += linea.comisionCents;
      continue;
    }
    const lista = lineasPorProfesional.get(t.professionalId) ?? [];
    lista.push(linea);
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
    pendientesDeRendir: [...porRendir.values()]
      .map((g) => ({ ...g, lineas: g.lineas.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime()) }))
      .sort((a, b) => b.pendienteDeRendirCents - a.pendienteDeRendirCents),
  };
}
