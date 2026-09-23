// ============================================================================
// COMISIONES A LIQUIDAR — lo que se le debe a cada profesional. PURO.
// ============================================================================
//
// Lo usan tres lugares y tienen que dar lo mismo: la app Comisiones (/admin/comisiones), la
// sección de comisiones de Reportes (que CH sigue viendo igual) y el botón del Inicio
// ("$412.000 a liquidar a 4 profesionales"). Antes el cálculo vivía dentro de
// `getCommissionsOverview` (commission-actions.ts) y un botón habría tenido que copiarlo.
//
// LA BASE DE CÁLCULO NO SE TOCA ACÁ. Es la de siempre: turnos COMPLETADOS, con pago
// aprobado, sin liquidar y SALDADOS (`sePuedeLiquidar`), sobre lo COBRADO (`payment.amount`),
// con el % del profesional o el de su servicio (`calcularLiquidacion`, la misma función que
// congela la liquidación). Si la comisión se devenga sobre el bruto o el neto es una decisión
// abierta del dueño (turnos/cobros.ts); esta pantalla no la toma de hecho.
//
// Sin Prisma de valor.

import { sePuedeLiquidar } from "@/lib/comision-liquidable";
import { calcularLiquidacion, type TurnoParaComision } from "@/lib/comision-liquidacion";
import { round2 } from "@/lib/round";

/**
 * Los turnos con comisión pendiente: realizados, cobrados y sin liquidar. El MISMO `where` que
 * la liquidación (`settleCommissions`) y la pantalla. Objeto plano, sin Prisma de valor.
 */
export function whereTurnosConComisionPendiente(tenantId: string) {
  return {
    tenantId,
    status: "COMPLETED" as const,
    commissionPayoutId: null,
    payment: { status: "APPROVED" as const },
  };
}

/** Un turno pendiente, leído con lo que hace falta para saber si está saldado y cuánto deja. */
export interface TurnoPendiente {
  id: string;
  serviceId: string;
  startsAt: Date;
  professionalId: string;
  professionalName: string;
  /** % general del profesional. */
  pctGeneral: number;
  /** Precio del turno (el reservado o, si no quedó, el del servicio). */
  precio: number;
  cobros: readonly { amount: number; method: string }[];
  payment: { status: string; amount: number } | null;
}

export interface ComisionPendiente {
  professionalId: string;
  professionalName: string;
  /** Comisión pendiente. */
  amount: number;
  /** Base sobre la que se calculó ("sobre $X"). */
  ingresos: number;
  appointmentCount: number;
  periodStart: Date | null;
  periodEnd: Date | null;
}

/**
 * Lo pendiente por profesional, de mayor a menor. Un turno con saldo pendiente espera (no se
 * liquida sobre una seña: se perdería la comisión del resto). `overrides` es el % por servicio
 * de cada profesional. PURA.
 */
export function comisionesPendientes(
  turnos: readonly TurnoPendiente[],
  overrides: ReadonlyMap<string, ReadonlyMap<string, number>>,
): ComisionPendiente[] {
  const porProfesional = new Map<string, { nombre: string; pctGeneral: number; turnos: TurnoParaComision[] }>();
  for (const t of turnos) {
    if (!t.payment) continue;
    if (!sePuedeLiquidar({ precio: t.precio, cobros: t.cobros, pagoLegado: t.payment })) continue;
    let g = porProfesional.get(t.professionalId);
    if (!g) {
      g = { nombre: t.professionalName, pctGeneral: t.pctGeneral, turnos: [] };
      porProfesional.set(t.professionalId, g);
    }
    // La base es lo COBRADO, no el precio de lista (decisión vigente, comision-liquidable.ts).
    g.turnos.push({ id: t.id, serviceId: t.serviceId, base: t.payment.amount, startsAt: t.startsAt });
  }
  const out: ComisionPendiente[] = [];
  for (const [professionalId, g] of porProfesional) {
    const calc = calcularLiquidacion(g.turnos, g.pctGeneral, overrides.get(professionalId) ?? new Map());
    if (calc.appointmentCount === 0) continue; // todos sus turnos son de servicios sin comisión
    out.push({
      professionalId,
      professionalName: g.nombre,
      amount: calc.amount,
      ingresos: calc.ingresos,
      appointmentCount: calc.appointmentCount,
      periodStart: calc.periodStart,
      periodEnd: calc.periodEnd,
    });
  }
  return out.sort((x, y) => y.amount - x.amount);
}

/** El total a liquidar y a cuántos profesionales. PURA. */
export function totalALiquidar(pendientes: readonly ComisionPendiente[]): { monto: number; profesionales: number } {
  return { monto: round2(pendientes.reduce((s, p) => s + p.amount, 0)), profesionales: pendientes.length };
}

/** Los overrides leídos (profesional → servicio → %) como mapa. PURA. */
export function overridesPorProfesional(
  filas: readonly { professionalId: string; serviceId: string; commissionPercent: number }[],
): Map<string, Map<string, number>> {
  const m = new Map<string, Map<string, number>>();
  for (const o of filas) {
    let p = m.get(o.professionalId);
    if (!p) m.set(o.professionalId, (p = new Map()));
    p.set(o.serviceId, o.commissionPercent);
  }
  return m;
}

// ── A dónde vuelve la liquidación ────────────────────────────────────────────

/** Las pantallas desde las que se liquida. Cualquier otro destino cae en Reportes. */
export const VUELTAS_DE_LIQUIDACION = ["/admin/reportes", "/admin/comisiones"] as const;
export type VueltaDeLiquidacion = (typeof VUELTAS_DE_LIQUIDACION)[number];

/**
 * A dónde vuelve el formulario de liquidar. Llega del formulario, así que no se confía: sólo
 * una de las dos pantallas; cualquier otra cosa (o nada, un formulario viejo) vuelve a
 * Reportes, que es donde CH liquida hoy. PURA.
 */
export function vueltaDeLiquidacion(raw: unknown): VueltaDeLiquidacion {
  return (VUELTAS_DE_LIQUIDACION as readonly string[]).includes(String(raw ?? ""))
    ? (String(raw) as VueltaDeLiquidacion)
    : "/admin/reportes";
}
