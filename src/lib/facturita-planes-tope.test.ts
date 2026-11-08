/** T2 · Planes de Factoque en el motor: el tope sale del plan (Gratis 5 · Plus 40 · Pro 159). Puro. */

import { test } from "node:test";
import assert from "node:assert/strict";
import { CUPO_GRATIS, estadoLimite } from "@/lib/facturita-core";
import {
  ESTADO_PRECIOS,
  LO_QUE_SIGUE,
  PLAN_FACTOQUE_PLUS,
  PLAN_FACTOQUE_PRO,
  PLAN_FACTURITA,
  PLAN_SALTO,
  PLANES_FACTOQUE,
  cupoDelPlan,
  leerCambioDePlanFactoque,
  planFactoqueEfectivo,
} from "@/lib/facturita-planes";

const HOY = "20261108";

test("escalera de Factoque: 5 / 40 / 159, $0 / $8.900 / $15.000, finales (sin leyenda provisional)", () => {
  assert.deepEqual(PLANES_FACTOQUE.map((p) => p.facturasPorMes), [5, 40, 159]);
  assert.deepEqual(PLANES_FACTOQUE.map((p) => p.precioMensual), [0, 8_900, 15_000]);
  assert.deepEqual(PLANES_FACTOQUE.map((p) => p.id), ["facturita", "factoque-plus", "factoque-pro"]);
  assert.equal(PLAN_SALTO.id, "factoque-plus");
  assert.equal(LO_QUE_SIGUE.producto, "comerciante");
  assert.match(ESTADO_PRECIOS, /provisional/i); // sigue para Comerciante
  for (const p of PLANES_FACTOQUE) assert.doesNotMatch(`${p.nota ?? ""} ${p.incluye.join(" ")}`, /provisional|a confirmar/i);
});

test("el cupo por defecto del núcleo es el de Gratis de la fuente de planes", () => {
  assert.deepEqual(cupoDelPlan(PLAN_FACTURITA), CUPO_GRATIS);
});

test("Tenant.plan: null u otro valor = Gratis; los ids pagos dan su plan", () => {
  assert.equal(planFactoqueEfectivo(null, null, HOY).plan.id, "facturita");
  assert.equal(planFactoqueEfectivo("pyme", null, HOY).plan.id, "facturita");
  assert.equal(planFactoqueEfectivo("FACTOQUE-PRO", null, HOY).plan.id, "facturita");
  assert.equal(planFactoqueEfectivo("factoque-plus", null, HOY).plan.id, "factoque-plus");
  assert.equal(planFactoqueEfectivo("factoque-pro", null, HOY).plan.id, "factoque-pro");
});

test("vigencia: el último día pagado corre; al día siguiente vuelve a Gratis (tope 5)", () => {
  const ultimo = planFactoqueEfectivo("factoque-pro", "2026-11-08", HOY);
  assert.equal(ultimo.plan.id, "factoque-pro");
  assert.equal(ultimo.vencido, false);
  const vencido = planFactoqueEfectivo("factoque-pro", "2026-11-07", HOY);
  assert.equal(vencido.plan.id, "facturita");
  assert.equal(vencido.vencido, true);
  assert.equal(cupoDelPlan(vencido.plan).tope, 5);
  // Fecha ilegible: falla cerrada, corre el plan chico.
  assert.equal(planFactoqueEfectivo("factoque-plus", "2026-02-30", HOY).plan.id, "facturita");
  assert.equal(planFactoqueEfectivo("factoque-plus", "mañana", HOY).plan.id, "facturita");
});

test("aviso desde la anteúltima y tope, por plan", () => {
  for (const plan of PLANES_FACTOQUE) {
    const cupo = cupoDelPlan(plan);
    const tope = plan.facturasPorMes;
    assert.equal(estadoLimite(tope - 2, cupo).mensaje, null, plan.id);
    const aviso = estadoLimite(tope - 1, cupo);
    assert.ok(aviso.puedeEmitir);
    assert.match(aviso.mensaje ?? "", /Te queda 1 factura/);
    const lleno = estadoLimite(tope, cupo);
    assert.equal(lleno.puedeEmitir, false);
    assert.match(lleno.mensaje ?? "", new RegExp(`tope de ${tope} facturas`));
  }
  assert.match(estadoLimite(40, cupoDelPlan(PLAN_FACTOQUE_PLUS)).mensaje ?? "", /Factoque Pro.*159/);
  assert.match(estadoLimite(159, cupoDelPlan(PLAN_FACTOQUE_PRO)).mensaje ?? "", /se renueva/);
  assert.match(estadoLimite(4, cupoDelPlan(PLAN_FACTURITA)).mensaje ?? "", /gratis/);
});

test("downgrade con más emitidas que el tope nuevo: bloquea la siguiente, sin restantes negativos", () => {
  const e = estadoLimite(12, cupoDelPlan(PLAN_FACTURITA));
  assert.equal(e.puedeEmitir, false);
  assert.equal(e.restantes, 0);
  assert.equal(e.usadas, 12);
  assert.equal(e.limite, 5);
});

test("formulario «Cambiar plan»: valida plan y vencimiento", () => {
  assert.deepEqual(leerCambioDePlanFactoque("", ""), { ok: true, plan: null, vigenciaHasta: null });
  assert.deepEqual(leerCambioDePlanFactoque("facturita", null), { ok: true, plan: null, vigenciaHasta: null });
  assert.deepEqual(leerCambioDePlanFactoque("factoque-plus", "2026-12-08"), { ok: true, plan: "factoque-plus", vigenciaHasta: "2026-12-08" });
  assert.deepEqual(leerCambioDePlanFactoque("factoque-pro", ""), { ok: true, plan: "factoque-pro", vigenciaHasta: null });
  assert.equal(leerCambioDePlanFactoque("pyme", "").ok, false);
  assert.equal(leerCambioDePlanFactoque("factoque-plus", "08/12/2026").ok, false);
  assert.equal(leerCambioDePlanFactoque("", "2026-12-08").ok, false);
});
