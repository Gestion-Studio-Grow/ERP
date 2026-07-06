import { test } from "node:test";
import assert from "node:assert/strict";

import {
  aggregateBenchmarks,
  DEFAULT_OPTIONS,
  type MetricPoint,
} from "./benchmark-aggregate";

// Helper: arma N tenants en una misma cohorte con valores dados.
function cohort(
  values: number[],
  over: Partial<Omit<MetricPoint, "tenantId" | "value">> = {},
): MetricPoint[] {
  return values.map((value, i) => ({
    tenantId: `t${i}`,
    rubro: over.rubro ?? "estetica",
    zona: over.zona ?? "canning",
    periodo: over.periodo ?? "2026-07",
    metric: over.metric ?? "ticket_promedio",
    value,
  }));
}

test("cohorte con menos de k tenants se SUPRIME (k-anonymity)", () => {
  // 3 tenants, k=5 por defecto → no se publica.
  const res = aggregateBenchmarks(cohort([100, 200, 300]));
  assert.equal(res.published.length, 0);
  assert.equal(res.suppressed.length, 1);
  assert.equal(res.suppressed[0].reason, "below_k");
  assert.equal(res.suppressed[0].nTenants, 3);
});

test("cohorte con k o más tenants se publica solo como agregado", () => {
  const res = aggregateBenchmarks(cohort([100, 200, 300, 400, 500]));
  assert.equal(res.published.length, 1);
  const cell = res.published[0];
  assert.equal(cell.nTenants, 5);
  assert.equal(cell.p50, 300); // mediana de 100..500
  assert.equal(cell.rubro, "estetica");
  assert.equal(cell.zona, "canning");
  // La celda publicada NO expone ningún tenantId.
  assert.ok(!("tenantId" in cell));
});

test("anti-dominancia: un tenant que concentra > maxShare suprime la cohorte", () => {
  // 5 tenants (pasa k), pero uno vale 10000 y el resto 10 → domina el total.
  const res = aggregateBenchmarks(cohort([10000, 10, 10, 10, 10]));
  assert.equal(res.published.length, 0);
  assert.equal(res.suppressed[0].reason, "dominance");
});

test("un mismo tenant repetido pesa UNA sola vez para k-anonymity", () => {
  // 4 tenants distintos, pero t0 aparece 3 veces → siguen siendo 4 < 5 → suprime.
  const points: MetricPoint[] = [
    ...cohort([100, 200, 300, 400]),
    { tenantId: "t0", rubro: "estetica", zona: "canning", periodo: "2026-07", metric: "ticket_promedio", value: 150 },
    { tenantId: "t0", rubro: "estetica", zona: "canning", periodo: "2026-07", metric: "ticket_promedio", value: 160 },
  ];
  const res = aggregateBenchmarks(points);
  assert.equal(res.published.length, 0);
  assert.equal(res.suppressed[0].nTenants, 4);
});

test("cohortes distintas se agregan por separado", () => {
  const points = [
    ...cohort([100, 200, 300, 400, 500], { rubro: "estetica" }),
    ...cohort([10, 20, 30, 40, 50], { rubro: "carniceria" }),
  ];
  const res = aggregateBenchmarks(points);
  assert.equal(res.published.length, 2);
  const rubros = res.published.map((c) => c.rubro).sort();
  assert.deepEqual(rubros, ["carniceria", "estetica"]);
});

test("el estado actual del negocio (2 tenants) NO produce ningún benchmark", () => {
  // Refleja el gate de masa de ADR-027: hoy hay 2 tenants → cero cohortes válidas.
  const res = aggregateBenchmarks(cohort([100, 200]), DEFAULT_OPTIONS);
  assert.equal(res.published.length, 0);
});

test("k configurable: con k=3 una cohorte de 3 se publica", () => {
  const res = aggregateBenchmarks(cohort([100, 200, 300]), { k: 3, maxShare: 0.9 });
  assert.equal(res.published.length, 1);
  assert.equal(res.published[0].p50, 200);
});
