// Motor de insights del "Panel del Dueño" — PROTOTIPO (sector Agencia, producto #1).
//
// Convierte los KPIs profundos que ya calcula `report-kpis.ts` (computeDeepKpis)
// en LECTURA DE NEGOCIO en lenguaje llano: "tu no-show subió", "tu ticket viene
// plano", "tu profesional más rentable es X". Es el incremento NO-GATEADO de la
// palanca #1 (analytics-producto): lógica PURA, single-tenant, sin cruzar tenants
// (eso es ADR-027), sin LLM (determinista, barato, testeable — ADR-026), sin DB.
//
// Referencia de producto: docs/sectores/agencia-digital/2026-07-05-pmo-propuesta-producto-1.md
//
// Entrada: los DeepKpis del período actual + (opcional) los del período anterior
// para las comparaciones temporales "contra vos mismo". Salida: insights ordenados
// por severidad, listos para pintar en una tarjeta.

import type { DeepKpis } from "./report-kpis";

export type InsightSeverity = "alert" | "warn" | "info" | "good";

export type OwnerInsight = {
  // id estable por regla (para test y para deduplicar en UI).
  id: string;
  severity: InsightSeverity;
  // clave de métrica que originó el insight (no-show, ticket, etc.).
  metric: string;
  // narrativa en español llano, lista para mostrar.
  title: string;
  // variación relativa vs. período previo (ej -0.12 = bajó 12%). null si no hay
  // período previo o la comparación no aplica.
  deltaPct: number | null;
};

export type InsightThresholds = {
  // tasaNoShow por encima de esto ⇒ alerta.
  noShowAlert: number;
  // tasaCancelacion por encima de esto ⇒ advertencia.
  cancelacionWarn: number;
  // caída relativa del ticket promedio (vs. previo) que dispara advertencia.
  ticketDropWarn: number;
  // tasaRecurrencia por debajo de esto ⇒ info (oportunidad de fidelización).
  recurrenciaLow: number;
};

// Umbrales por defecto — punto de partida razonable para una estética/retail; el
// tenant podrá ajustarlos (persistir umbrales sería una migración = Gate 2, fuera
// del MVP de solo-lectura).
export const DEFAULT_THRESHOLDS: InsightThresholds = {
  noShowAlert: 0.15,
  cancelacionWarn: 0.2,
  ticketDropWarn: 0.1,
  recurrenciaLow: 0.25,
};

const SEVERITY_RANK: Record<InsightSeverity, number> = {
  alert: 0,
  warn: 1,
  info: 2,
  good: 3,
};

// Variación relativa (actual vs previo). null si no hay previo o el previo es 0
// (no se puede dividir; un salto desde 0 no es un "% de cambio" honesto).
function deltaPct(actual: number, previo: number | null): number | null {
  if (previo === null || previo === 0) return null;
  return (actual - previo) / previo;
}

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

function signoPct(d: number): string {
  // d es una variación relativa (ej -0.12). Texto "subió 12%" / "bajó 12%".
  const abs = Math.abs(Math.round(d * 100));
  return d >= 0 ? `subió ${abs}%` : `bajó ${abs}%`;
}

// Genera los insights del período. `previous` puede ser null (primer período o sin
// histórico): en ese caso se omiten las comparaciones temporales y solo salen los
// insights de nivel absoluto (umbrales) + los estructurales (mejor profesional, mix).
export function generateOwnerInsights(
  current: DeepKpis,
  previous: DeepKpis | null = null,
  thresholds: InsightThresholds = DEFAULT_THRESHOLDS,
): OwnerInsight[] {
  const out: OwnerInsight[] = [];

  // --- Fuga operativa: no-show ---
  const noShow = current.estados.tasaNoShow;
  const noShowDelta = deltaPct(noShow, previous?.estados.tasaNoShow ?? null);
  if (noShow >= thresholds.noShowAlert) {
    out.push({
      id: "no-show-alto",
      severity: "alert",
      metric: "tasaNoShow",
      title: `Tu no-show está en ${pct(noShow)} — por encima del umbral (${pct(
        thresholds.noShowAlert,
      )}). Cada ausencia es una silla que no facturó.`,
      deltaPct: noShowDelta,
    });
  } else if (noShowDelta !== null && noShowDelta > 0.2) {
    out.push({
      id: "no-show-empeora",
      severity: "warn",
      metric: "tasaNoShow",
      title: `Tu no-show ${signoPct(noShowDelta)} vs. el período anterior (hoy ${pct(noShow)}).`,
      deltaPct: noShowDelta,
    });
  }

  // --- Fuga operativa: cancelación ---
  const cancel = current.estados.tasaCancelacion;
  if (cancel >= thresholds.cancelacionWarn) {
    out.push({
      id: "cancelacion-alta",
      severity: "warn",
      metric: "tasaCancelacion",
      title: `Tu tasa de cancelación es ${pct(cancel)}. Avisar con tiempo ayuda, pero conviene entender por qué.`,
      deltaPct: deltaPct(cancel, previous?.estados.tasaCancelacion ?? null),
    });
  }

  // --- Valor por venta: ticket promedio ---
  const ticketDelta = deltaPct(current.ticketPromedio, previous?.ticketPromedio ?? null);
  if (ticketDelta !== null && ticketDelta <= -thresholds.ticketDropWarn) {
    out.push({
      id: "ticket-cae",
      severity: "warn",
      metric: "ticketPromedio",
      title: `Tu ticket promedio ${signoPct(ticketDelta)} vs. el período anterior. Revisá precios, combos o upselling.`,
      deltaPct: ticketDelta,
    });
  } else if (ticketDelta !== null && ticketDelta >= thresholds.ticketDropWarn) {
    out.push({
      id: "ticket-sube",
      severity: "good",
      metric: "ticketPromedio",
      title: `Tu ticket promedio ${signoPct(ticketDelta)} vs. el período anterior. Buen trabajo de valor por venta.`,
      deltaPct: ticketDelta,
    });
  }

  // --- Retención: recurrencia del período ---
  const rec = current.retencion.tasaRecurrencia;
  if (current.retencion.clientesUnicos > 0 && rec < thresholds.recurrenciaLow) {
    out.push({
      id: "recurrencia-baja",
      severity: "info",
      metric: "tasaRecurrencia",
      title: `Solo el ${pct(rec)} de tus clientes del período volvió más de una vez. Hay lugar para fidelizar (recordatorios, packs).`,
      deltaPct: deltaPct(rec, previous?.retencion.tasaRecurrencia ?? null),
    });
  }

  // --- Productividad: mejor hora-silla ---
  const top = current.rentabilidadHoraSilla[0];
  if (top && top.porHora > 0) {
    out.push({
      id: "hora-silla-top",
      severity: "good",
      metric: "rentabilidadHoraSilla",
      title: `Tu hora-silla más rentable es la de ${top.label}: factura por hora bastante arriba del resto.`,
      deltaPct: null,
    });
  }

  // --- Mix de método de pago: concentración ---
  const totalPagos = current.mixMetodoPago.reduce((s, r) => s + r.total, 0);
  const lider = current.mixMetodoPago[0];
  if (lider && totalPagos > 0) {
    const share = lider.total / totalPagos;
    if (share >= 0.8) {
      out.push({
        id: "mix-concentrado",
        severity: "info",
        metric: "mixMetodoPago",
        title: `El ${pct(share)} de tu facturación entra por ${lider.method}. Diversificar medios de cobro reduce riesgo.`,
        deltaPct: null,
      });
    }
  }

  return out.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
}
