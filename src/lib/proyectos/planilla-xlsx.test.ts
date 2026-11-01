import assert from "node:assert/strict";
import test from "node:test";
import * as XLSX from "xlsx";
import { libroDePlanilla } from "./planilla-xlsx";

const leer = (b: Buffer) => {
  const libro = XLSX.read(b, { type: "buffer" });
  return libro.Sheets[libro.SheetNames[0]];
};

const base = {
  proyecto: { nombre: "Gala", client: { name: "Cliente" } },
  moneda: "ARS", codigo: "2026-001",
  version: 2,
  grupos: [{ rubro: "Catering", subtotal: 1500.5, lineas: [{ descripcion: "Menú", cantidad: 3, importe: 1500.5 }] }],
  neto: 1500.5,
  ivaPct: 21,
  iva: 315.11,
  total: 1815.61,
};

test("los importes quedan como números y los totales al pie", () => {
  const h = leer(libroDePlanilla(base));
  assert.equal(h.A1.v, "Gala");
  assert.equal(h.D4.t, "n");
  assert.equal(h.D4.v, 1500.5);
  assert.equal(h.C4.v, 3);
  assert.equal(h.B5.v, "Subtotal");
  assert.equal(h.B8.v, "Total");
  assert.equal(h.D8.v, 1815.61);
});

test("no lleva columnas de costo ni margen", () => {
  const h = leer(libroDePlanilla(base));
  assert.deepEqual([h.A3.v, h.B3.v, h.C3.v, h.D3.v], ["Rubro", "Detalle", "Cantidad", "Importe"]);
  assert.equal(h.E3, undefined);
});

test("un texto con forma de fórmula sigue siendo texto", () => {
  const h = leer(libroDePlanilla({ ...base, grupos: [{ rubro: "=1+1", subtotal: 1, lineas: [{ descripcion: "=HYPERLINK(\"http://x\")", cantidad: null, importe: 1 }] }] }));
  assert.equal(h.A4.t, "s");
  assert.equal(h.A4.f, undefined);
  assert.equal(h.B4.t, "s");
  assert.equal(h.B4.f, undefined);
});
