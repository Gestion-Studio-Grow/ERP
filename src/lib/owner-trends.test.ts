import { test } from "node:test";
import assert from "node:assert/strict";

import {
  analyzeTrend,
  analyzeTrends,
  DEFAULT_TREND_THRESHOLDS,
  type TrendPoint,
} from "./owner-trends";

function serie(values: number[]): TrendPoint[] {
  return values.map((value, i) => ({ periodo: `p${i + 1}`, value }));
}

// --- Guardas ------------------------------------------------------------------

test("con menos de minPeriods no opina (null)", () => {
  assert.equal(analyzeTrend("ticketPromedio", serie([100, 110]), "up"), null);
});

// --- Plano --------------------------------------------------------------------

test("plano: ticket que apenas se mueve → flat con racha", () => {
  const t = analyzeTrend("ticketPromedio", serie([1000, 1010, 1005, 1015]), "up");
  assert.ok(t);
  assert.equal(t!.direction, "flat");
  assert.equal(t!.sentiment, "neutral");
  assert.match(t!.title, /viene plano/);
});

// --- Subida / bajada + sentimiento --------------------------------------------

test("suba sostenida del ticket es 'good'", () => {
  const t = analyzeTrend("ticketPromedio", serie([1000, 1100, 1210, 1330]), "up")!;
  assert.equal(t.direction, "up");
  assert.equal(t.sentiment, "good");
  assert.equal(t.streak, 3); // 3 pasos, todos hacia arriba
  assert.ok(t.changePct !== null && t.changePct > 0.3);
  assert.match(t.title, /subiendo/);
});

test("suba sostenida del no-show es 'bad' (subir es malo)", () => {
  const t = analyzeTrend("tasaNoShow", serie([0.08, 0.1, 0.13, 0.17]), "down")!;
  assert.equal(t.direction, "up");
  assert.equal(t.sentiment, "bad");
  assert.match(t.title, /en contra|frenar/);
});

test("baja sostenida del no-show es 'good' (bajar es bueno)", () => {
  const t = analyzeTrend("tasaNoShow", serie([0.2, 0.16, 0.12, 0.09]), "down")!;
  assert.equal(t.direction, "down");
  assert.equal(t.sentiment, "good");
  assert.match(t.title, /dirección correcta/);
});

// --- Racha parcial ------------------------------------------------------------

test("streak cuenta solo los períodos finales consistentes", () => {
  // baja, baja, y recién sube al final → dirección dominante down, pero la racha
  // final consistente hacia abajo es 0 (el último paso fue hacia arriba).
  const t = analyzeTrend("ticketPromedio", serie([1000, 900, 800, 810]), "up")!;
  assert.equal(t.direction, "down");
  assert.equal(t.streak, 0);
});

// --- Errático -----------------------------------------------------------------

test("errático: sube y baja sin dirección clara", () => {
  const t = analyzeTrend("ticketPromedio", serie([1000, 1300, 950, 1350, 980]), "up")!;
  assert.equal(t.direction, "volatile");
  assert.equal(t.sentiment, "neutral");
  assert.match(t.title, /inestable/);
});

// --- changePct desde 0 --------------------------------------------------------

test("changePct es null si el primer valor es 0", () => {
  const t = analyzeTrend("ingresos", serie([0, 100, 200, 300]), "up")!;
  assert.equal(t.changePct, null);
  // aún así clasifica dirección usando la normalización por rango.
  assert.equal(t.direction, "up");
});

// --- Dato sucio ---------------------------------------------------------------

test("descarta valores no finitos y sigue si quedan suficientes", () => {
  const dirty: TrendPoint[] = [
    { periodo: "p1", value: 1000 },
    { periodo: "p2", value: NaN },
    { periodo: "p3", value: 1100 },
    { periodo: "p4", value: 1200 },
  ];
  const t = analyzeTrend("ticketPromedio", dirty, "up");
  assert.ok(t); // quedan 3 puntos finitos ≥ minPeriods
  assert.equal(t!.direction, "up");
});

// --- analyzeTrends: orden -----------------------------------------------------

test("analyzeTrends prioriza lo accionable (bad) primero", () => {
  const res = analyzeTrends([
    { metric: "ticketPromedio", series: serie([1000, 1100, 1210, 1330]), good: "up" }, // good
    { metric: "tasaNoShow", series: serie([0.08, 0.11, 0.14, 0.18]), good: "down" }, // bad
    { metric: "tasaRecurrencia", series: serie([0.3, 0.305, 0.3, 0.31]), good: "up" }, // flat/neutral
  ]);
  assert.equal(res[0].metric, "tasaNoShow"); // bad va primero
  assert.equal(res[0].sentiment, "bad");
  assert.equal(res[res.length - 1].sentiment, "neutral"); // neutral al final
});

test("analyzeTrends omite series sin datos suficientes", () => {
  const res = analyzeTrends([
    { metric: "ticketPromedio", series: serie([1000, 1100]), good: "up" }, // solo 2 → fuera
    { metric: "tasaNoShow", series: serie([0.2, 0.16, 0.12, 0.09]), good: "down" },
  ]);
  assert.equal(res.length, 1);
  assert.equal(res[0].metric, "tasaNoShow");
});

test("umbrales configurables: banda muerta más ancha aplana una suba leve", () => {
  const leve = serie([1000, 1020, 1041, 1062]); // ~2% por paso
  const conDefault = analyzeTrend("ticketPromedio", leve, "up", DEFAULT_TREND_THRESHOLDS)!;
  assert.equal(conDefault.direction, "flat"); // 2% < 3% banda default
  const conBandaAngosta = analyzeTrend("ticketPromedio", leve, "up", {
    ...DEFAULT_TREND_THRESHOLDS,
    flatBand: 0.01,
  })!;
  assert.equal(conBandaAngosta.direction, "up"); // ahora 2% supera la banda
});
