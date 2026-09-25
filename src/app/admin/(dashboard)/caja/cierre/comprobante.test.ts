import { test } from "node:test";
import assert from "node:assert/strict";
import { diferenciaDelComprobante, mediosDelComprobante } from "./comprobante";

// La forma real que escribe `cerrarDia` (copiada de una fila del laboratorio).
const FILA = {
  day: "2026-09-24",
  note: "QA cierre",
  estado: "FALTANTE",
  porMedio: {
    MP: { esperado: 20654998.99, declarado: 20654998.99, diferencia: 0 },
    TARJETA: { esperado: 0, declarado: null, diferencia: null },
    EFECTIVO: { esperado: 202828.65, declarado: 196578.25, diferencia: -6250.4 },
  },
  movimientos: 14,
};

test("lee los tres medios en el orden de la caja, con lo no conciliado en null", () => {
  const m = mediosDelComprobante(FILA)!;
  assert.deepEqual(
    m.map((x) => x.medio),
    ["EFECTIVO", "MP", "TARJETA"],
  );
  assert.deepEqual(m[0], { medio: "EFECTIVO", esperado: 202828.65, declarado: 196578.25, diferencia: -6250.4 });
  assert.deepEqual(m[2], { medio: "TARJETA", esperado: 0, declarado: null, diferencia: null });
});

test("la diferencia del día suma sólo lo conciliado", () => {
  assert.equal(diferenciaDelComprobante(mediosDelComprobante(FILA)!), -6250.4);
});

test("una fila rara no inventa números: null", () => {
  assert.equal(mediosDelComprobante(null), null);
  assert.equal(mediosDelComprobante({ porMedio: "x" }), null);
  assert.equal(mediosDelComprobante({ porMedio: { EFECTIVO: { esperado: "12" } } }), null);
});

test("sin diferencia guardada, se calcula contado menos esperado", () => {
  const m = mediosDelComprobante({ porMedio: { EFECTIVO: { esperado: 1000, declarado: 700.5 } } })!;
  assert.equal(m[0].diferencia, -299.5);
});
