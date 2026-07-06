import { Badge, Card } from "@/components/ui";
import type { OwnerInsight, InsightSeverity } from "@/lib/owner-insights";
import type { MetricTrend, TrendDirection } from "@/lib/owner-trends";

// Panel del Dueño — superficie visual (AGENCIA GROW, herramienta de gestión de
// negocios propios). Pinta la LECTURA DE NEGOCIO en lenguaje llano que producen los
// motores puros `owner-insights` (insights del período) y `owner-trends` (tendencias
// multi-período). Es un componente presentacional puro: recibe ya calculados los
// insights y las tendencias, no toca datos ni DB. Su valor de producto: el negocio
// "te habla", no te tira otro gráfico.

type Tone = "neutral" | "accent" | "success" | "warning" | "danger" | "info";

// Severidad del insight → tono del Badge + etiqueta corta.
const SEVERITY_META: Record<InsightSeverity, { tone: Tone; label: string }> = {
  alert: { tone: "danger", label: "Alerta" },
  warn: { tone: "warning", label: "Atención" },
  info: { tone: "info", label: "Dato" },
  good: { tone: "success", label: "Bien" },
};

// Sentimiento de la tendencia → tono. Neutral (plano/errático) queda sobrio.
const SENTIMENT_TONE: Record<MetricTrend["sentiment"], Tone> = {
  good: "success",
  bad: "danger",
  neutral: "neutral",
};

// Dirección → glifo. Sin librería de íconos (cero deps): flechas Unicode.
const DIRECTION_GLYPH: Record<TrendDirection, string> = {
  up: "↑",
  down: "↓",
  flat: "→",
  volatile: "↕",
};

function pctSigned(n: number | null): string | null {
  if (n === null) return null;
  const v = Math.round(n * 100);
  return `${v >= 0 ? "+" : ""}${v}%`;
}

export function OwnerPanel({
  insights,
  trends,
  hasPrevious,
  monthsAnalyzed,
}: {
  insights: OwnerInsight[];
  trends: MetricTrend[];
  // si no hay período previo, las comparaciones temporales de insights se omiten.
  hasPrevious: boolean;
  // cuántos meses completos alimentaron las tendencias (para el copy honesto).
  monthsAnalyzed: number;
}) {
  return (
    <section aria-labelledby="owner-panel-title" className="mb-8">
      <div className="mb-4">
        <h2 id="owner-panel-title" className="text-lg font-semibold text-strong">
          Tu negocio te habla
        </h2>
        <p className="text-sm text-muted">
          Lectura automática de tus números, en lenguaje llano — sin que tengas que interpretar
          gráficos.
        </p>
      </div>

      {/* --- Insights del período --- */}
      {insights.length === 0 ? (
        <Card className="mb-4">
          <p className="text-sm text-muted">
            Sin señales para destacar en este período. Buenas noticias: nada fuera de lo esperado.
            {!hasPrevious && " (Todavía no hay período previo para comparar la evolución.)"}
          </p>
        </Card>
      ) : (
        <div className="mb-4 space-y-2.5">
          {insights.map((ins) => {
            const meta = SEVERITY_META[ins.severity];
            const delta = pctSigned(ins.deltaPct);
            return (
              <Card key={ins.id} className="flex items-start gap-3 py-3.5">
                <Badge tone={meta.tone} className="mt-0.5 shrink-0">
                  {meta.label}
                </Badge>
                <p className="text-sm text-strong leading-relaxed">
                  {ins.title}
                  {delta && (
                    <span className="ml-1.5 text-xs text-muted">({delta} vs. período previo)</span>
                  )}
                </p>
              </Card>
            );
          })}
        </div>
      )}

      {/* --- Tendencias multi-período --- */}
      <div className="mb-3 mt-6">
        <h3 className="text-base font-semibold text-strong">Tendencias</h3>
        <p className="text-sm text-muted">
          Cómo vienen tus métricas mes a mes — no una foto, la película.
        </p>
      </div>

      {trends.length === 0 ? (
        <Card>
          <p className="text-sm text-muted">
            {monthsAnalyzed < 3
              ? "Necesitás al menos 3 meses completos de actividad para leer tendencias. Seguí cargando turnos y en unas semanas esto se activa solo."
              : "Tus métricas vienen estables, sin una tendencia marcada para señalar."}
          </p>
        </Card>
      ) : (
        <div className="space-y-2.5">
          {trends.map((t) => {
            const tone = SENTIMENT_TONE[t.sentiment];
            const delta = pctSigned(t.changePct);
            return (
              <Card key={t.metric} className="flex items-start gap-3 py-3.5">
                <span
                  aria-hidden
                  className={`mt-0.5 shrink-0 text-lg font-semibold ${
                    tone === "danger"
                      ? "text-danger"
                      : tone === "success"
                        ? "text-success"
                        : "text-muted"
                  }`}
                >
                  {DIRECTION_GLYPH[t.direction]}
                </span>
                <p className="text-sm text-strong leading-relaxed">
                  {t.title}
                  {delta && t.direction !== "flat" && (
                    <span className="ml-1.5 text-xs text-muted">({delta} punta a punta)</span>
                  )}
                </p>
              </Card>
            );
          })}
        </div>
      )}

      {/* Teaser del incremento cross-tenant (ADR-027, Agencia Digital): la comparativa
          contra el rubro llega cuando se active el benchmarking. No se construye acá. */}
      <p className="mt-4 text-xs text-muted">
        Próximamente: comparativa contra el promedio de tu rubro y zona — se activa cuando haya
        suficientes negocios en tu categoría.
      </p>
    </section>
  );
}
