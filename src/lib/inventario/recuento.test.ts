// La planilla de recuento y la regla "sin contar hace más de 30 días", ejecutadas con datos.

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildReason, motivoLabel } from "@/lib/stock/adjustment-core";
import {
  MOTIVO_RECUENTO,
  armarGondolas,
  desdeRecuentoReciente,
  pideRecuento,
  resumirRecuento,
  whereSinContarDesde,
  type ProductoARecontar,
} from "./recuento";

const P = (id: string, nombre: string, ultimoRecuento: string | null = null): ProductoARecontar => ({
  id,
  nombre,
  unidad: "kg",
  kilo: true,
  stock: 1,
  costo: null,
  ultimoRecuento,
});

test("góndolas en el orden del recorrido; las vacías no aparecen; lo que no está en el orden va al final", () => {
  const productos = [P("1", "Bondiola"), P("2", "Vacío"), P("3", "Salsa"), P("4", "Lomo")];
  const gondola = (p: ProductoARecontar) =>
    p.nombre === "Bondiola" ? { id: "cerdo", nombre: "Cerdo" } : p.nombre === "Salsa" ? { id: "rara", nombre: "Rara" } : { id: "vaca", nombre: "Vaca" };
  const g = armarGondolas(productos, gondola, ["vaca", "cerdo", "pollo"]);
  assert.deepEqual(
    g.map((x) => [x.id, x.productos.map((p) => p.nombre)]),
    [
      ["vaca", ["Vacío", "Lomo"]],
      ["cerdo", ["Bondiola"]],
      ["rara", ["Salsa"]],
    ],
  );
});

test("pide recuento: nunca contado, o contado antes de hace 30 días; el where de la base dice lo mismo", () => {
  const ahora = new Date("2026-09-23T15:00:00.000Z");
  const desde = desdeRecuentoReciente(ahora);
  assert.equal(desde.toISOString(), "2026-08-24T15:00:00.000Z");
  assert.equal(pideRecuento(null, desde), true);
  assert.equal(pideRecuento("2026-08-20T10:00:00.000Z", desde), true);
  assert.equal(pideRecuento("2026-09-01T10:00:00.000Z", desde), false);
  assert.deepEqual(whereSinContarDesde("t-qa", desde), {
    tenantId: "t-qa",
    deletedAt: null,
    active: true,
    trackStock: true,
    stockMovements: { none: { type: "AJUSTE", reason: { startsWith: "Recuento" }, createdAt: { gte: desde } } },
  });
});

test("resultado del recuento: coinciden, faltantes y sobrantes, en pesos sólo lo que tiene costo", () => {
  const r = resumirRecuento([
    { nombre: "Vacío", unidad: "kg", teorico: 10, contado: 9.5, diferencia: -0.5, pesos: -3271.5 },
    { nombre: "Lomo", unidad: "kg", teorico: 3, contado: 3, diferencia: 0, pesos: 0 },
    { nombre: "Entraña", unidad: "kg", teorico: 1, contado: 1.2, diferencia: 0.2, pesos: 1600 },
    { nombre: "Salsa", unidad: "u", teorico: 5, contado: 4, diferencia: -1, pesos: null },
  ]);
  assert.deepEqual(r, {
    contados: 4,
    coinciden: 1,
    conFaltante: 2,
    conSobrante: 1,
    pesosFaltante: 3271.5,
    pesosSobrante: 1600,
    sinCosto: 1,
  });
});

test("el prefijo del recuento es el motivo que escribe el ajuste: si uno cambia, este test lo ve", () => {
  assert.equal(MOTIVO_RECUENTO, motivoLabel("RECUENTO"));
  assert.ok(buildReason("RECUENTO", null).startsWith(MOTIVO_RECUENTO));
  assert.ok(buildReason("RECUENTO", "góndola 3").startsWith(MOTIVO_RECUENTO));
  // Y la regla "sin contar" busca ESE prefijo.
  const w = whereSinContarDesde("t-qa", new Date("2026-09-01T00:00:00.000Z"));
  assert.deepEqual(w.stockMovements.none.reason, { startsWith: MOTIVO_RECUENTO });
});
