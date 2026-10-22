/** Tests de la fuente única de planes de Facturita (ADR-078). */

import { test } from "node:test";
import assert from "node:assert/strict";
import { LIMITE_FACTURAS_FACTURITA } from "@/lib/facturita-core";
import {
  ESTADO_PRECIOS,
  PLAN_FACTURITA,
  PLAN_SALTO,
  PLANES_COMERCIANTE,
  precioConPeriodo,
  precioTexto,
} from "@/lib/facturita-planes";

test("Facturita es gratis y su tope es el mismo que aplica el motor", () => {
  assert.equal(PLAN_FACTURITA.precioMensual, 0);
  assert.equal(PLAN_FACTURITA.facturasPorMes, LIMITE_FACTURAS_FACTURITA);
});

test("frontera dura de ADR-076: Facturita no promete extracto, conciliación ni cobros MP", () => {
  const incluye = PLAN_FACTURITA.incluye.join(" ").toLowerCase();
  assert.doesNotMatch(incluye, /extracto|concilia|mercado pago/);
  const noIncluye = (PLAN_FACTURITA.noIncluye ?? []).join(" ").toLowerCase();
  assert.match(noIncluye, /extracto/);
  assert.match(noIncluye, /mercado pago/);
});

test("lista de Comerciante de ADR-078, en orden creciente", () => {
  assert.deepEqual(
    PLANES_COMERCIANTE.map((p) => p.precioMensual),
    [14_900, 39_900, 89_900, 149_900],
  );
  assert.equal(PLAN_SALTO.id, "solo");
  for (let i = 1; i < PLANES_COMERCIANTE.length; i++) {
    assert.ok(PLANES_COMERCIANTE[i].facturasPorMes > PLANES_COMERCIANTE[i - 1].facturasPorMes);
  }
});

test("los precios se marcan como provisionales", () => {
  assert.match(ESTADO_PRECIOS, /provisional/i);
  assert.match(ESTADO_PRECIOS, /dueño/);
});

test("formato argentino: Gratis / $14.900 / $149.900 por mes", () => {
  assert.equal(precioTexto(0), "Gratis");
  assert.equal(precioTexto(14_900), "$14.900");
  assert.equal(precioConPeriodo(149_900), "$149.900 por mes");
  assert.equal(precioConPeriodo(0), "Gratis");
});
