// O40 · el rechazo por período cerrado (periodo-cerrado-core.ts). PURO: los textos se escribieron a mano.

import { test } from "node:test";
import assert from "node:assert/strict";
import { etiquetaMes, motivoPeriodoCerrado } from "./periodo-cerrado-core";

test("día abierto: no hay rechazo", () => {
  assert.equal(motivoPeriodoCerrado({ dia: "2026-11-17", frontera: null, mesCongelado: false }), null);
  assert.equal(motivoPeriodoCerrado({ dia: "2026-11-17", frontera: "2026-11-16", mesCongelado: false }), null);
});

test("día cerrado: dice qué no se registró, que la caja está cerrada y cómo seguir", () => {
  const m = motivoPeriodoCerrado({ dia: "2026-11-17", frontera: "2026-11-17", mesCongelado: false, que: "cobro" }) ?? "";
  assert.match(m, /^No se registró este cobro: la caja del .*17\/11\/2026 ya está cerrada/);
  assert.match(m, /reabrí el cierre del día en Caja › Cierre del día/);
  assert.match(m, /18\/11\/2026, el primer día abierto/);
});

test("mes congelado: manda a Cierre del mes aunque el día esté abierto", () => {
  const m = motivoPeriodoCerrado({ dia: "2026-11-17", frontera: null, mesCongelado: true, que: "anulación" }) ?? "";
  assert.match(m, /^No se registró esta anulación: noviembre de 2026 está congelado en Cierre del mes/);
  assert.match(m, /reabrir noviembre de 2026 en Caja › Cierre del mes/);
});

test("etiquetaMes", () => {
  assert.equal(etiquetaMes("2026-01"), "enero de 2026");
  assert.equal(etiquetaMes("2026-12"), "diciembre de 2026");
});
