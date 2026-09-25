// Tests de la plata en centavos: conversión, formato de la casa (igual a fmtMoneyARS, ADR-079),
// IVA de línea y suma. node:test.

import { test } from "node:test";
import assert from "node:assert/strict";
import { fmtMoneyARS } from "@/components/ui/format";
import { convertirAPesos, formatearPesos, formatearPesosCorto, ivaDeLinea, pesos, sumar } from "./dinero";

test("pesos: pasa a centavos enteros con round2, EPSILON-safe en el medio centavo", () => {
  assert.equal(pesos(1234.56), 123456);
  assert.equal(pesos(1.005), 101); // el Math.round pelado daría 100
  assert.equal(pesos(2.675), 268);
  assert.equal(pesos(0.1 + 0.2), 30);
  assert.equal(pesos(0), 0);
  assert.equal(pesos(-5), -500);
  assert.equal(pesos(212000), 21200000);
});

test("formatearPesos: formato de la casa, sin espacio y con el signo adelante", () => {
  assert.equal(formatearPesos(123456), "$1.234,56");
  assert.equal(formatearPesos(-500), "-$5,00");
  assert.equal(formatearPesos(0), "$0,00");
  assert.equal(formatearPesos(5), "$0,05");
  assert.equal(formatearPesos(-5), "-$0,05");
  assert.equal(formatearPesos(99999), "$999,99");
  assert.equal(formatearPesos(100000000), "$1.000.000,00");
  assert.equal(formatearPesos(44730000), "$447.300,00");
});

test("formatearPesos da exactamente lo mismo que fmtMoneyARS de components/ui", () => {
  const casos = [0, 1, 5, 99, 100, 101, 99999, 100000, 123456, 1270000, 44730000, 100000000, 123456789012];
  for (const c of [...casos, ...casos.map((x) => -x)]) {
    assert.equal(formatearPesos(c), fmtMoneyARS(c / 100), String(c));
  }
  for (let c = -2_000_003; c <= 2_000_003; c += 7_919) {
    assert.equal(formatearPesos(c), fmtMoneyARS(c / 100), String(c));
  }
});

test("formatearPesosCorto: sin ',00' cuando es redondo; igual a fmtMoneyARS sin decimales en ese caso", () => {
  assert.equal(formatearPesosCorto(50000000), "$500.000");
  assert.equal(formatearPesosCorto(1270000), "$12.700");
  assert.equal(formatearPesosCorto(-1270000), "-$12.700");
  assert.equal(formatearPesosCorto(123456), "$1.234,56");
  assert.equal(formatearPesosCorto(0), "$0");
  for (const c of [0, 100, 1270000, 50000000, -1270000, 100000000]) {
    assert.equal(formatearPesosCorto(c), fmtMoneyARS(c / 100, 0), String(c));
  }
  for (const c of [5, 123456, -99, 21200050]) {
    assert.equal(formatearPesosCorto(c), fmtMoneyARS(c / 100), String(c));
  }
});

test("ivaDeLinea: Math.round(neto * alicuota / 100), con el medio centavo hacia arriba", () => {
  assert.equal(ivaDeLinea(16000000, 21), 3360000);
  assert.equal(ivaDeLinea(826400, 21), 173544);
  assert.equal(ivaDeLinea(150, 21), 32); // 31,5 → 32
  assert.equal(ivaDeLinea(5, 10.5), 1); // 0,525 → 1
  assert.equal(ivaDeLinea(1, 10.5), 0); // 0,105 → 0
  assert.equal(ivaDeLinea(1000, 27), 270);
  assert.equal(ivaDeLinea(1000, 2.5), 25);
  assert.equal(ivaDeLinea(1000, 0), 0);
});

test("sumar: suma centavos; sin argumentos da cero", () => {
  assert.equal(sumar(), 0);
  assert.equal(sumar(1, 2, 3), 6);
  assert.equal(sumar(21200000, 1000000, -500), 22199500);
});

test("convertirAPesos: ARS no cambia; USD multiplica por la cotización y redondea con round2", () => {
  assert.equal(convertirAPesos(12345, "ARS", 999), 12345);
  assert.equal(convertirAPesos(10000, "USD", 1350.5), 13505000);
  assert.equal(convertirAPesos(333, "USD", 1.5), 500); // 4,995 → 5,00
  // US$ 10,05 a 0,1 = $ 1,005: con Math.round pelado sobre centavos (100,4999…) daría 100.
  assert.equal(convertirAPesos(1005, "USD", 0.1), 101);
  assert.equal(convertirAPesos(10000, "USD"), 10000); // sin cotización: 1 (el motor bloquea con V14)
});
