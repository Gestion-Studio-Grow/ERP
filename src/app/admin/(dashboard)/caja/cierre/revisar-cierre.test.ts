// Cierre del día: qué falta, dónde va el foco y qué dice la confirmación. Se EJECUTA la
// revisión de revisar-cierre.ts con los números de un cierre real; el recorrido con el teclado
// está en cierre-teclado.test.ts.

import { test } from "node:test";
import assert from "node:assert/strict";
import { CASH_METHOD_LABEL } from "@/lib/caja/libro-caja";
import { diferenciasDelCierre, revisarCierre } from "./revisar-cierre";

const ESPERADO = { EFECTIVO: 48_500, MP: 212_300, TARJETA: 0 };
const vacio = { EFECTIVO: "", MP: "", TARJETA: "" };
const revisar = (declarado: Partial<typeof vacio>, nota = "") =>
  revisarCierre({ declarado: { ...vacio, ...declarado }, esperado: ESPERADO, nota, etiquetas: CASH_METHOD_LABEL });

test("sin efectivo no se cierra: el foco va al efectivo con el motivo", () => {
  const r = revisar({ MP: "212.300" });
  assert.equal(r.listo, false);
  assert.ok(!r.listo && r.campo === "EFECTIVO");
  assert.ok(!r.listo && /obligatorio, aunque sea 0/.test(r.error));
});

test("un importe ilegible se marca en SU campo, no se toma como 'sin contar'", () => {
  const r = revisar({ EFECTIVO: "48500", MP: "doscientos" });
  assert.ok(!r.listo && r.campo === "MP");
  assert.ok(!r.listo && r.error.includes("no es un importe"));
});

test("con diferencia y sin nota, el foco va a la nota", () => {
  const r = revisar({ EFECTIVO: "47.000" });
  assert.ok(!r.listo && r.campo === "nota");
  assert.ok(!r.listo && /sin explicación por ahora/.test(r.error));
});

test("todo cargado: la confirmación dice medio por medio lo que se asienta", () => {
  const r = revisar({ EFECTIVO: "47.000", MP: "212.300" }, "faltante del cambio");
  assert.equal(r.listo, true);
  assert.ok(r.listo);
  assert.equal(r.hayDiferencia, true);
  // Sin espacios duros: el formato de pesos puede traerlos según la versión de Intl.
  assert.deepEqual(
    r.renglones.map((x) => x.replace(/\s/g, " ")),
    [
      "Efectivo: contaste $47.000,00, el libro dice $48.500,00. Faltan $1.500,00: se asienta como ajuste.",
      `${CASH_METHOD_LABEL.MP}: contaste $212.300,00, el libro dice $212.300,00. Cuadra.`,
      `${CASH_METHOD_LABEL.TARJETA}: sin contar, queda sin conciliar.`,
    ],
  );
});

test("cuadra justo: se cierra sin nota", () => {
  const r = revisar({ EFECTIVO: "48500" });
  assert.equal(r.listo, true);
  assert.ok(r.listo && !r.hayDiferencia);
});

test("las diferencias se redondean como el servidor y lo vacío es 'sin contar'", () => {
  const d = diferenciasDelCierre({ EFECTIVO: "48.500,10", MP: "", TARJETA: "0" }, ESPERADO);
  assert.equal(d.EFECTIVO, 0.1);
  assert.equal(d.MP, null);
  assert.equal(d.TARJETA, 0);
});
