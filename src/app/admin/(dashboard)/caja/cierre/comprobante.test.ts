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
  assert.deepEqual(m[0], { medio: "EFECTIVO", etiqueta: "Efectivo", esperado: 202828.65, declarado: 196578.25, diferencia: -6250.4, neto: null });
  assert.deepEqual(m[2], { medio: "TARJETA", etiqueta: "Tarjeta", esperado: 0, declarado: null, diferencia: null, neto: null });
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

// F2 (QA del 30/10): la hoja nueva escribe `porColumna` (lo tipeado contra lo que la columna
// esperaba). El comprobante muestra ESO, no `porMedio` (los saldos del libro).
test("con porColumna, el comprobante es la hoja que se contó, con sus etiquetas", () => {
  const m = mediosDelComprobante({
    porMedio: {
      EFECTIVO: { esperado: 15900, declarado: 15900, diferencia: 0 },
      MP: { esperado: 63200, declarado: 63200, diferencia: 0 },
      TRANSFERENCIA: { esperado: 30400, declarado: 30400, diferencia: 0 },
    },
    porColumna: {
      EFECTIVO: { esperado: 15900, declarado: 15900, diferencia: 0 },
      MP: { esperado: 29400, declarado: 29400, diferencia: 0 },
      TRANSFERENCIA: { esperado: 18900, declarado: 18900, diferencia: 0 },
    },
  })!;
  assert.deepEqual(
    m.map((x) => [x.etiqueta, x.declarado, x.esperado]),
    [["Efectivo", 15900, 15900], ["Mercado Pago", 29400, 29400], ["Transferencia", 18900, 18900]],
  );
});

// Cert. M1 v9 O2: Transferencia es un neto; si dio negativo, el comprobante dice por qué.
test("Transferencia con neto negativo: el comprobante lo aclara", () => {
  const m = mediosDelComprobante({
    hoja: "nueva",
    porColumna: { EFECTIVO: { esperado: 0, declarado: 0, diferencia: 0 }, TRANSFERENCIA: { esperado: -400, declarado: -400, diferencia: 0 } },
  })!;
  assert.equal(m[0].neto, null);
  assert.match(String(m[1].neto), /salió más de lo que entró/);
});
