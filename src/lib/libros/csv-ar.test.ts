// El CSV para la contadora, EJECUTADO: un texto que Excel tomaría como fórmula sale
// desactivado, y los números (importes negativos, stock en negativo) siguen siendo números.

import { test } from "node:test";
import assert from "node:assert/strict";
import { camposDeLineaCsv, filaCsv, lineaSinFormulas, sinFormula } from "./csv-ar";

test("un nombre que empieza con =, +, -, @ o tabulación sale con apóstrofo adelante", () => {
  assert.equal(sinFormula('=HYPERLINK("http://x","clic")'), `'=HYPERLINK("http://x","clic")`);
  assert.equal(sinFormula("+54 11 5555-5555"), "'+54 11 5555-5555");
  assert.equal(sinFormula("-2+3"), "'-2+3");
  assert.equal(sinFormula("@SUMA(A1)"), "'@SUMA(A1)");
  assert.equal(sinFormula("\t=1"), "'\t=1");
  assert.equal(sinFormula("Frigorífico Sur"), "Frigorífico Sur");
});

test("los números no se tocan: importes con signo, miles con punto, porcentajes", () => {
  assert.equal(sinFormula("-1234,50"), "-1234,50", "una nota de crédito resta");
  assert.equal(sinFormula("-1.234,50"), "-1.234,50");
  assert.equal(sinFormula("-3,5"), "-3,5", "stock en negativo");
  assert.equal(sinFormula("-21%"), "-21%");
  assert.equal(sinFormula(-5), -5);
});

test("filaCsv: neutraliza y además escapa ; y comillas", () => {
  assert.equal(filaCsv("2026-08-15", "=1+1", "-605,00", 'Juan "el del ;"'), `2026-08-15;'=1+1;-605,00;"Juan ""el del ;"""`);
});

test("una línea ajena (el libro de caja) se relee campo por campo y vuelve igual, salvo la fórmula", () => {
  const linea = `2026-08-15;Egreso;"Compra; hielo";-1500,00;"dice ""hola"""`;
  assert.deepEqual(camposDeLineaCsv(linea), ["2026-08-15", "Egreso", "Compra; hielo", "-1500,00", 'dice "hola"']);
  assert.equal(lineaSinFormulas(linea), linea, "sin fórmulas, la línea queda idéntica");
  assert.equal(lineaSinFormulas("2026-08-15;Ingreso;=HYPERLINK(1);100,00"), "2026-08-15;Ingreso;'=HYPERLINK(1);100,00");
  assert.equal(lineaSinFormulas(""), "");
  assert.deepEqual(camposDeLineaCsv(`a;"sin cerrar;b`), ["a", "sin cerrar;b"], "una comilla que no cierra toma el resto");
});
