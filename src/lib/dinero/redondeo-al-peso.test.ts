/**
 * El redondeo al peso y el porcentaje de un importe (ENG-109, D1-PLAN §3.3 R4). Misma regla
 * que el centavo (R1: el medio va lejos del cero; R7: un número vale sus 15 cifras), un
 * solo redondeo desde el valor exacto: nunca centavo primero y peso después.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { porcentajeDe, redondearAlPeso } from "./redondeo";

test("medio peso va hacia arriba: 1.234,50 → 1.235; 0,50 → 1; 12.344,5 → 12.345", () => {
  assert.equal(redondearAlPeso(1234.5), 1235);
  assert.equal(redondearAlPeso(0.5), 1);
  assert.equal(redondearAlPeso(12_344.5), 12_345);
  assert.equal(redondearAlPeso(999_999.5), 1_000_000);
});

test("menos de medio peso va hacia abajo: 1.234,49 → 1.234; 0,49 → 0", () => {
  assert.equal(redondearAlPeso(1234.49), 1234);
  assert.equal(redondearAlPeso(0.49), 0);
  assert.equal(redondearAlPeso(1234.4999), 1234);
});

test("un solo redondeo: 1.234,495 va a 1.234 (al centavo daría 1.234,50 y al peso 1.235)", () => {
  assert.equal(redondearAlPeso(1234.495), 1234);
  assert.equal(redondearAlPeso(0.495), 0);
});

test("un número vale sus 15 cifras: 1.234,4999999999998 es 1.234,5 y sube", () => {
  assert.equal(redondearAlPeso(1234.4999999999998), 1235);
  assert.equal(redondearAlPeso(0.1 * 12_345), 1235);
});

test("negativos: el medio peso se aleja del cero y lo que redondea a cero da 0, nunca −0", () => {
  assert.equal(redondearAlPeso(-1234.5), -1235);
  assert.equal(redondearAlPeso(-1234.49), -1234);
  assert.ok(Object.is(redondearAlPeso(-0.4), 0));
  assert.ok(Object.is(redondearAlPeso(-0), 0));
});

test("lo que no es un número pasa sin cambios, como con Math.round", () => {
  assert.ok(Number.isNaN(redondearAlPeso(Number.NaN)));
  assert.equal(redondearAlPeso(Number.POSITIVE_INFINITY), Number.POSITIVE_INFINITY);
});

test("barrido: los 1.000.000 de x,50 de $0 a $1.000.000 suben y los x,49 bajan", () => {
  let malos = 0;
  for (let p = 0; p < 1_000_000; p++) {
    if (redondearAlPeso(p + 0.5) !== p + 1) malos++;
    if (redondearAlPeso(p + 0.49) !== p) malos++;
  }
  assert.equal(malos, 0);
});

/**
 * El exacto, con enteros de precisión arbitraria (otra aritmética que la del módulo): base en
 * centavos × porcentaje en centésimos de punto, medio hacia arriba. Sólo para bases ≥ 0.
 */
function porcentajeExacto(baseCentavos: number, pctCentesimos: number, unidad: "peso" | "centavo"): number {
  const producto = BigInt(baseCentavos) * BigInt(pctCentesimos);
  const divisor = BigInt(unidad === "peso" ? 1_000_000 : 10_000);
  const dos = BigInt(2);
  const cociente = Number((dos * producto + divisor) / (dos * divisor));
  return unidad === "peso" ? cociente : cociente / 100;
}

test("porcentaje: 10 % de $12.345 da $1.235 al peso y $1.234,50 al centavo", () => {
  assert.equal(porcentajeDe(12_345, 10, "peso"), 1235);
  assert.equal(porcentajeDe(12_345, 10, "centavo"), 1234.5);
  assert.equal(porcentajeDe(12_500.5, 10, "peso"), 1250);
  assert.equal(porcentajeDe(12_500.5, 10, "centavo"), 1250.05);
  assert.equal(porcentajeDe(3, 15, "peso"), 0);
  assert.equal(porcentajeDe(3, 15, "centavo"), 0.45);
  assert.equal(porcentajeDe(10.05, 50, "centavo"), 5.03);
});

test("porcentaje: todos los % enteros de 1 a 100 sobre cada centavo de $0 a $1.000 dan el exacto", () => {
  let malos = 0;
  for (let pct = 1; pct <= 100; pct++) {
    for (let c = 0; c <= 100_000; c++) {
      const base = c / 100;
      if (porcentajeDe(base, pct, "peso") !== porcentajeExacto(c, pct * 100, "peso")) malos++;
      if (porcentajeDe(base, pct, "centavo") !== porcentajeExacto(c, pct * 100, "centavo")) malos++;
    }
  }
  assert.equal(malos, 0);
});

test("porcentaje: 1.000.000 de bases al azar hasta $1.000.000.000 con % de dos decimales dan el exacto", () => {
  let semilla = 20260925;
  const azar = (tope: number) => {
    semilla = (semilla * 1103515245 + 12345) % 2147483648;
    return Math.floor((semilla / 2147483648) * tope);
  };
  let malos = 0;
  const ejemplos: string[] = [];
  for (let i = 0; i < 1_000_000; i++) {
    const c = azar(100_000_000) * 1000 + azar(1000); // hasta 10^11 centavos
    const p = 1 + azar(10_000); // 0,01 % a 100,00 %
    const base = c / 100;
    const pct = p / 100;
    for (const unidad of ["peso", "centavo"] as const) {
      if (porcentajeDe(base, pct, unidad) !== porcentajeExacto(c, p, unidad)) {
        malos++;
        if (ejemplos.length < 5) ejemplos.push(`${pct}% de ${base} al ${unidad}`);
      }
    }
  }
  assert.equal(malos, 0, ejemplos.join("; "));
});

test("un porcentaje vale con dos decimales: 12,345 % se toma 12,35 % (R1 y R7 sobre el %)", () => {
  assert.equal(porcentajeDe(10_000, 12.345, "centavo"), 1235);
  assert.equal(porcentajeDe(10_000, 12.344, "centavo"), 1234);
});

test("lo que no es un número pasa sin cambios por el porcentaje", () => {
  assert.ok(Number.isNaN(porcentajeDe(Number.NaN, 10, "peso")));
  assert.ok(Number.isNaN(porcentajeDe(100, Number.NaN, "centavo")));
});

test("porcentaje de una base enorme (el producto no entra entero): igual redondea por R7", () => {
  assert.equal(porcentajeDe(20_000_000_000, 100, "peso"), 20_000_000_000);
  assert.equal(porcentajeDe(20_000_000_000.5, 10, "centavo"), 2_000_000_000.05);
  assert.equal(porcentajeDe(20_000_000_005, 10, "peso"), 2_000_000_001);
  // 10 % de $100.000.000.004,95 es $10.000.000.000,495: un solo redondeo, baja.
  assert.equal(porcentajeDe(100_000_000_004.95, 10, "peso"), 10_000_000_000);
});

test("porcentaje de un negativo se aleja del cero: 10 % de −$12.345 da −$1.235", () => {
  assert.equal(porcentajeDe(-12_345, 10, "peso"), -1235);
  assert.equal(porcentajeDe(-12_345, 10, "centavo"), -1234.5);
});
