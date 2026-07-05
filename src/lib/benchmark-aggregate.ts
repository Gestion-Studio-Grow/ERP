// Agregación anónima por cohorte para el benchmarking cross-tenant — PROTOTIPO.
//
// Implementa el MECANISMO DE PRIVACIDAD que decide ADR-027: dado un set de métricas
// por tenant, produce SOLO agregados anónimos por cohorte (rubro × zona × período ×
// métrica) que respetan k-anonymity, o SUPRIME la celda si no alcanza el umbral.
// Es lógica PURA (sin DB, sin red, sin cruzar tenants en vivo): en producción la
// alimentaría un pipeline de plataforma sobre una réplica/branch (ADR-027 §2), pero
// el algoritmo de anonimización se puede construir y testear HOY con datos sintéticos.
//
// Garantías (ADR-027 §3):
//   · k-anonymity: se publica una cohorte solo si tiene ≥ k tenants distintos.
//   · anti-dominancia: si un tenant concentra > maxShare del total, se suprime
//     (evita inferir al líder aunque n ≥ k).
//   · solo estadísticos agregados (p25/p50/p75); nunca valores nominados por tenant.
//
// Referencia: docs/adr/ADR-027-analytics-cross-tenant-benchmarking.md

// Un punto = el valor de UNA métrica para UN tenant en una cohorte. El pipeline de
// plataforma arma estos puntos desde el dato ya agregado por tenant (nunca fila cruda
// de otro tenant expuesta a nadie).
export type MetricPoint = {
  tenantId: string;
  rubro: string;
  zona: string;
  periodo: string; // ej "2026-07"
  metric: string; // ej "ticket_promedio"
  value: number;
};

// Celda publicable: agregado anónimo de una cohorte. NO lleva tenantId de terceros.
export type BenchmarkCell = {
  rubro: string;
  zona: string;
  periodo: string;
  metric: string;
  nTenants: number;
  p25: number;
  p50: number;
  p75: number;
};

export type SuppressedCohort = {
  cohorte: string; // clave legible de la cohorte
  nTenants: number;
  reason: "below_k" | "dominance";
};

export type AggregateOptions = {
  // k-anonymity mínimo. Default 5 (conservador; la micro-agregación de la literatura
  // usa 3–5 como piso — ver ADR-027 §3).
  k: number;
  // fracción máxima del total que puede concentrar un solo tenant antes de suprimir.
  maxShare: number;
};

export const DEFAULT_OPTIONS: AggregateOptions = { k: 5, maxShare: 0.5 };

export type AggregateResult = {
  published: BenchmarkCell[];
  suppressed: SuppressedCohort[];
};

function cohortKey(p: {
  rubro: string;
  zona: string;
  periodo: string;
  metric: string;
}): string {
  return `${p.rubro}|${p.zona}|${p.periodo}|${p.metric}`;
}

// Percentil por interpolación lineal sobre una lista YA ordenada ascendente.
// q en [0,1]. Con un solo elemento devuelve ese elemento.
function percentile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const idx = q * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  const frac = idx - lo;
  return sorted[lo] * (1 - frac) + sorted[hi] * frac;
}

// Agrega puntos por tenant en valores por-tenant (un tenant que aparece varias veces
// en una cohorte se colapsa a su promedio: cada tenant pesa UNA vez para k-anonymity).
function valuePerTenant(points: MetricPoint[]): Map<string, number> {
  const acc = new Map<string, { sum: number; n: number }>();
  for (const p of points) {
    const a = acc.get(p.tenantId) ?? { sum: 0, n: 0 };
    a.sum += p.value;
    a.n += 1;
    acc.set(p.tenantId, a);
  }
  const out = new Map<string, number>();
  for (const [tenantId, a] of acc) out.set(tenantId, a.sum / a.n);
  return out;
}

// Núcleo: agrupa por cohorte, aplica k-anonymity + anti-dominancia, y emite solo
// celdas anónimas publicables. Las cohortes suprimidas se reportan aparte (para
// auditar/observar, nunca con dato identificable).
export function aggregateBenchmarks(
  points: MetricPoint[],
  options: AggregateOptions = DEFAULT_OPTIONS,
): AggregateResult {
  const groups = new Map<string, MetricPoint[]>();
  for (const p of points) {
    const key = cohortKey(p);
    const arr = groups.get(key) ?? [];
    arr.push(p);
    groups.set(key, arr);
  }

  const published: BenchmarkCell[] = [];
  const suppressed: SuppressedCohort[] = [];

  for (const [key, cohortPoints] of groups) {
    const perTenant = valuePerTenant(cohortPoints);
    const nTenants = perTenant.size;

    // k-anonymity: no publicar cohortes con menos de k tenants distintos.
    if (nTenants < options.k) {
      suppressed.push({ cohorte: key, nTenants, reason: "below_k" });
      continue;
    }

    const values = Array.from(perTenant.values());
    const total = values.reduce((s, v) => s + v, 0);

    // anti-dominancia: si un tenant concentra demasiado del total, suprimir.
    if (total > 0) {
      const maxValue = Math.max(...values);
      if (maxValue / total > options.maxShare) {
        suppressed.push({ cohorte: key, nTenants, reason: "dominance" });
        continue;
      }
    }

    const sorted = [...values].sort((a, b) => a - b);
    const [rubro, zona, periodo, metric] = key.split("|");
    published.push({
      rubro,
      zona,
      periodo,
      metric,
      nTenants,
      p25: percentile(sorted, 0.25),
      p50: percentile(sorted, 0.5),
      p75: percentile(sorted, 0.75),
    });
  }

  return { published, suppressed };
}
