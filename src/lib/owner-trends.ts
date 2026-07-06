// Motor de TENDENCIAS multi-período del "Panel del Dueño" — PROTOTIPO
// (sector Agencia, producto #1, segundo incremento).
//
// El motor actual (`owner-insights.ts`) compara el período contra UN período
// previo: sirve para "tu no-show subió 12% vs. el mes pasado", pero NO para el otro
// insight que la spec del PMO nombra explícitamente:
//   "Tu ticket promedio viene PLANO hace 3 meses"
// Eso exige mirar una SERIE de períodos, no un par. Este módulo aporta esa lectura:
// dada una serie temporal de una métrica (una entrada por período, del más viejo al
// más nuevo), clasifica la tendencia (subiendo / bajando / plano / errático) y arma
// la narrativa en lenguaje llano.
//
// Sigue el mismo criterio del resto del producto: lógica PURA, determinista, sin LLM,
// sin DB, cero deps, single-tenant (no cruza tenants — eso es ADR-027). Complementa
// a `owner-insights.ts` sin tocarlo; la pantalla del Panel puede pintar ambos.
//
// Referencia de producto: docs/sectores/agencia-digital/2026-07-05-pmo-propuesta-producto-1.md

export type TrendDirection = "up" | "down" | "flat" | "volatile";

// Una métrica de negocio con la dirección "buena". Para el no-show, subir es MALO;
// para el ticket promedio, subir es BUENO. La usamos para teñir la lectura.
export type MetricGoodDirection = "up" | "down";

export type TrendPoint = {
  periodo: string; // etiqueta legible, ej "2026-04" o "abr"
  value: number;
};

export type MetricTrend = {
  metric: string;
  direction: TrendDirection;
  // cantidad de períodos consecutivos (desde el más reciente hacia atrás) que
  // sostienen la dirección — "viene plano hace 3 meses" ⇒ 3.
  streak: number;
  // variación relativa total punta a punta (primer vs último período válido). null
  // si el primer valor es 0 (no hay % honesto desde 0).
  changePct: number | null;
  // pendiente relativa promedio por período (para ordenar por "qué se mueve más").
  slopePerPeriod: number;
  // lectura buena/mala/neutra según `good`.
  sentiment: "good" | "bad" | "neutral";
  // narrativa lista para pintar.
  title: string;
};

export type TrendThresholds = {
  // banda muerta: |cambio por período| por debajo de esto se considera "plano".
  flatBand: number;
  // dispersión de signos por encima de la cual se marca "errático" en vez de una
  // dirección: fracción de períodos que van "contra" la dirección dominante.
  volatileShare: number;
  // mínimo de períodos para arriesgar una tendencia (con menos, no se opina).
  minPeriods: number;
};

export const DEFAULT_TREND_THRESHOLDS: TrendThresholds = {
  flatBand: 0.03, // <3% de cambio medio por período ⇒ plano
  volatileShare: 0.4, // ≥40% de pasos en contra ⇒ errático
  minPeriods: 3,
};

function pct(n: number): string {
  return `${Math.round(Math.abs(n) * 100)}%`;
}

// Variación relativa entre dos valores. null si `from` es 0.
function rel(from: number, to: number): number | null {
  if (from === 0) return null;
  return (to - from) / from;
}

// Cuenta la racha (desde el final) de pasos que van en `sign` (+1 sube, -1 baja).
// Un paso dentro de la banda muerta cuenta como parte de la racha "plana" si sign===0.
function trailingStreak(steps: number[], sign: number, flatBand: number): number {
  let n = 0;
  for (let i = steps.length - 1; i >= 0; i--) {
    const s = steps[i];
    if (sign === 0) {
      if (Math.abs(s) < flatBand) n++;
      else break;
    } else {
      if (Math.sign(s) === sign && Math.abs(s) >= flatBand) n++;
      else break;
    }
  }
  return n;
}

// Analiza una serie (más viejo → más nuevo) y devuelve la tendencia, o null si no
// hay suficientes períodos para opinar con seriedad.
export function analyzeTrend(
  metric: string,
  series: TrendPoint[],
  good: MetricGoodDirection = "up",
  thresholds: TrendThresholds = DEFAULT_TREND_THRESHOLDS,
): MetricTrend | null {
  // Filtramos períodos no finitos por las dudas (dato sucio) pero conservamos orden.
  const pts = series.filter((p) => Number.isFinite(p.value));
  if (pts.length < thresholds.minPeriods) return null;

  // pasos relativos período a período (usa el valor previo como base; si es 0, cae
  // a diferencia absoluta normalizada por el rango para no perder el signo).
  const range = Math.max(...pts.map((p) => p.value)) - Math.min(...pts.map((p) => p.value)) || 1;
  const steps: number[] = [];
  for (let i = 1; i < pts.length; i++) {
    const base = pts[i - 1].value;
    const r = base !== 0 ? (pts[i].value - base) / Math.abs(base) : (pts[i].value - base) / range;
    steps.push(r);
  }

  const meanStep = steps.reduce((s, v) => s + v, 0) / steps.length;
  const dominantSign = Math.sign(meanStep);

  // ¿errático? fracción de pasos (fuera de la banda) que van contra el signo dominante.
  const significativos = steps.filter((s) => Math.abs(s) >= thresholds.flatBand);
  const contra = significativos.filter((s) => Math.sign(s) !== dominantSign).length;
  const contraShare = significativos.length > 0 ? contra / significativos.length : 0;

  let direction: TrendDirection;
  if (Math.abs(meanStep) < thresholds.flatBand) {
    direction = "flat";
  } else if (contraShare >= thresholds.volatileShare) {
    direction = "volatile";
  } else {
    direction = dominantSign > 0 ? "up" : "down";
  }

  const streak =
    direction === "flat"
      ? trailingStreak(steps, 0, thresholds.flatBand)
      : direction === "up"
        ? trailingStreak(steps, 1, thresholds.flatBand)
        : direction === "down"
          ? trailingStreak(steps, -1, thresholds.flatBand)
          : 0;

  const changePct = rel(pts[0].value, pts[pts.length - 1].value);

  const sentiment = sentimentOf(direction, good);
  const title = narrate(metric, direction, streak, changePct, sentiment);

  return {
    metric,
    direction,
    streak,
    changePct,
    slopePerPeriod: meanStep,
    sentiment,
    title,
  };
}

function sentimentOf(direction: TrendDirection, good: MetricGoodDirection): "good" | "bad" | "neutral" {
  if (direction === "flat" || direction === "volatile") return "neutral";
  const goingGood = (direction === "up" && good === "up") || (direction === "down" && good === "down");
  return goingGood ? "good" : "bad";
}

// Etiqueta amable de la métrica para la narrativa. Fallback: la clave cruda.
const METRIC_LABEL: Record<string, string> = {
  tasaNoShow: "tu no-show",
  tasaCancelacion: "tu cancelación",
  ticketPromedio: "tu ticket promedio",
  tasaRecurrencia: "la recurrencia de tus clientes",
  ingresos: "tu facturación",
};

function label(metric: string): string {
  return METRIC_LABEL[metric] ?? metric;
}

// "N períodos" con singular/plural. El PMO ejemplifica con meses, pero la serie puede
// ser semanal/mensual: usamos "períodos" neutro y dejamos que la UI diga el grano.
function periodos(n: number): string {
  return n === 1 ? "1 período" : `${n} períodos`;
}

function narrate(
  metric: string,
  direction: TrendDirection,
  streak: number,
  changePct: number | null,
  sentiment: "good" | "bad" | "neutral",
): string {
  const m = label(metric);
  const cambio = changePct !== null ? ` (${changePct >= 0 ? "+" : "-"}${pct(changePct)} punta a punta)` : "";
  const Cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

  switch (direction) {
    case "flat":
      return `${Cap(m)} viene plano hace ${periodos(streak || 0)}${cambio}. Sin movimiento — puede ser estabilidad o estancamiento.`;
    case "up":
      return sentiment === "good"
        ? `${Cap(m)} viene subiendo hace ${periodos(streak)}${cambio}. Buena racha, sostenela.`
        : `${Cap(m)} viene subiendo hace ${periodos(streak)}${cambio}. Conviene frenar la tendencia.`;
    case "down":
      return sentiment === "good"
        ? `${Cap(m)} viene bajando hace ${periodos(streak)}${cambio}. Vas en la dirección correcta.`
        : `${Cap(m)} viene bajando hace ${periodos(streak)}${cambio}. Atención, la tendencia juega en contra.`;
    case "volatile":
      return `${Cap(m)} viene inestable${cambio}: sube y baja sin una dirección clara. Difícil de planificar.`;
  }
}

// Conveniencia: analiza varias métricas de una y devuelve las tendencias que ameritan
// mostrarse (no-plano y no-neutral primero), ordenadas por relevancia (magnitud de la
// pendiente). Las métricas se pasan con su serie y su dirección "buena".
export type MetricSeriesInput = {
  metric: string;
  series: TrendPoint[];
  good?: MetricGoodDirection;
};

export function analyzeTrends(
  inputs: MetricSeriesInput[],
  thresholds: TrendThresholds = DEFAULT_TREND_THRESHOLDS,
): MetricTrend[] {
  const out: MetricTrend[] = [];
  for (const inp of inputs) {
    const t = analyzeTrend(inp.metric, inp.series, inp.good ?? "up", thresholds);
    if (t) out.push(t);
  }
  // Prioridad: primero lo accionable (bad), luego lo bueno, luego neutral; dentro de
  // cada grupo, mayor magnitud de pendiente arriba.
  const rank: Record<string, number> = { bad: 0, good: 1, neutral: 2 };
  return out.sort(
    (a, b) => rank[a.sentiment] - rank[b.sentiment] || Math.abs(b.slopePerPeriod) - Math.abs(a.slopePerPeriod),
  );
}
