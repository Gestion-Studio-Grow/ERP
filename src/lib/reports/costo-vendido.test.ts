// ============================================================================
// COSTO DE LO VENDIDO — la devolución de materiales del taller resta del costo de insumos (T6). PURO.
// Descontar 4 a $1000 y devolver 4 deja $0; la venta (costearLineas) no cambia.
// ============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";
import { costearInsumos, costearLineas, type SalidaDeStock } from "./costo-vendido";
import { salidaDeStockDe, whereSalidasDelMes } from "./resultado-lectura";
import { TALLER_DEVOLUCION_ACTOR_PREFIX } from "@/lib/taller-stands/actor";

const dev = `${TALLER_DEVOLUCION_ACTOR_PREFIX}user:ale`;
const consumo = (qty: number, unitCost: number | null): SalidaDeStock => ({ type: "CONSUMO", orderId: null, productId: "mdf", qty, unitCost });

test("costearInsumos: la salida suma, la devolución (qty +) resta; neto 0", () => {
  assert.deepEqual(costearInsumos([consumo(-4, 1000), consumo(4, 1000)], {}), { costo: 0, sinCosto: 0, alCostoDeHoy: 0 });
  assert.equal(costearInsumos([consumo(-4, 1000), consumo(4, 1000), consumo(-4, 1000)], {}).costo, 4000);
  assert.equal(costearInsumos([consumo(-4, 1000), consumo(1, 1000)], {}).costo, 3000, "devolución parcial");
  // Sin costo guardado en ninguna de las dos: las dos al costo de hoy, neto 0; el contador cuenta sólo la salida.
  assert.deepEqual(costearInsumos([consumo(-4, null), consumo(4, null)], { mdf: 1200 }), { costo: 0, sinCosto: 0, alCostoDeHoy: 1 });
  assert.deepEqual(costearInsumos([consumo(-4, null), consumo(4, null)], {}), { costo: 0, sinCosto: 1, alCostoDeHoy: 0 });
});

test("salidaDeStockDe: la REPOSICION del taller pasa a CONSUMO con qty positiva; otra REPOSICION se descarta", () => {
  assert.deepEqual(
    salidaDeStockDe({ type: "REPOSICION", orderId: null, productId: "mdf", qty: 4, unitCost: 1000, createdBy: dev }),
    { type: "CONSUMO", orderId: null, productId: "mdf", qty: 4, unitCost: 1000 },
  );
  assert.equal(salidaDeStockDe({ type: "REPOSICION", orderId: null, productId: "mdf", qty: 4, unitCost: 1000, createdBy: "user:ale" }), null);
  assert.deepEqual(
    salidaDeStockDe({ type: "CONSUMO", orderId: null, productId: "mdf", qty: -4, unitCost: 1000, createdBy: "user:ale" }),
    { type: "CONSUMO", orderId: null, productId: "mdf", qty: -4, unitCost: 1000 },
  );
  assert.deepEqual(
    salidaDeStockDe({ type: "VENTA", orderId: "o1", productId: "mdf", qty: -2, unitCost: null }),
    { type: "VENTA", orderId: "o1", productId: "mdf", qty: -2, unitCost: null },
  );
});

test("whereSalidasDelMes trae VENTA, CONSUMO y sólo las REPOSICION del taller", () => {
  const w = whereSalidasDelMes("t-qa", "2026-11");
  assert.deepEqual(w.OR, [
    { type: { in: ["VENTA", "CONSUMO"] } },
    { type: "REPOSICION", createdBy: { startsWith: "taller-devolucion:" } },
  ]);
  assert.equal(w.tenantId, "t-qa");
});

test("costearLineas no cambia: una devolución del taller no toca el costo de una venta", () => {
  const lineas = [{ orderId: "o1", productId: "mdf", nombre: "MDF", cantidad: 2, saleUnit: "UNIT" as const, importe: 5000 }];
  const salidas: SalidaDeStock[] = [
    { type: "VENTA", orderId: "o1", productId: "mdf", qty: -2, unitCost: 1000 },
    consumo(4, 1000),
  ];
  assert.deepEqual(costearLineas(lineas, salidas, {}).map((l) => [l.costo, l.fuente]), [[2000, "guardado"]]);
});
