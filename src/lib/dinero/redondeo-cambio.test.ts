/**
 * R8 · el único redondeo del cobro fijado (D13): pesos en centavos ÷ tipo de cambio exacto (en millonésimos) → centavos
 * de la moneda del proyecto, medio centavo hacia arriba (como R1 y `round(numeric)` de Postgres). Todo en `bigint`:
 * ni el monto ni el tipo de cambio pasan por un `number` con decimales.
 *
 * Determinista: el barrido usa mulberry32 con semilla fija (ni reloj ni azar real).
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { esAlCentavo, importeDeCentavos, monedaCentavosDePesos, textoDeMicro, tipoCambioMicroDe } from "./redondeo";

/** mulberry32: entero sin signo de 32 bits, reproducible con la misma semilla. */
function mulberry32(semilla: number): () => number {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  };
}

/** Un bigint en [1, tope], con 64 bits del generador. */
function entre1Y(azar: () => number, tope: bigint): bigint {
  const n = (BigInt(azar()) << BigInt(32)) | BigInt(azar());
  return (n % tope) + BigInt(1);
}

test("R8 · tabla: el cambio exacto, el empate sube, el tc de 3 y el 0,1 + 0,2", () => {
  // $ 30.000 a 1.000 = 30 USD.
  assert.equal(monedaCentavosDePesos(BigInt(3_000_000), BigInt(1_000_000_000)), BigInt(3_000));
  // $ 600.000 a 1.200 = 500 USD.
  assert.equal(monedaCentavosDePesos(BigInt(60_000_000), BigInt(1_200_000_000)), BigInt(50_000));
  // $ 100.000 a 3 = 33.333,333… → 33.333,33.
  assert.equal(monedaCentavosDePesos(BigInt(10_000_000), BigInt(3_000_000)), BigInt(3_333_333));
  // $ 200.000 a 3 = 66.666,666… → 66.666,67.
  assert.equal(monedaCentavosDePesos(BigInt(20_000_000), BigInt(3_000_000)), BigInt(6_666_667));
  // Empate: $ 0,01 a 2 = 0,005 → 0,01 (medio centavo sube); $ 0,03 a 2 = 0,015 → 0,02.
  assert.equal(monedaCentavosDePesos(BigInt(1), BigInt(2_000_000)), BigInt(1));
  assert.equal(monedaCentavosDePesos(BigInt(3), BigInt(2_000_000)), BigInt(2));
  // Lejos del cero también para atrás (R1): −0,005 → −0,01.
  assert.equal(monedaCentavosDePesos(-BigInt(1), BigInt(2_000_000)), -BigInt(1));
  // 0,1 + 0,2 vale 0,3 (R7): $ 0,30 a 0,3 = 1 unidad.
  const tc = tipoCambioMicroDe(0.1 + 0.2);
  assert.equal(tc, BigInt(300_000));
  assert.equal(monedaCentavosDePesos(BigInt(30), tc!), BigInt(100));
  // Cero pesos, cero de la moneda.
  assert.equal(monedaCentavosDePesos(BigInt(0), BigInt(1_234_567)), BigInt(0));
});

test("R8 · un tipo de cambio que no es positivo es un error de quien llama", () => {
  assert.throws(() => monedaCentavosDePesos(BigInt(100), BigInt(0)), RangeError);
  assert.throws(() => monedaCentavosDePesos(BigInt(100), -BigInt(1)), RangeError);
});

test("tipoCambioMicroDe: exacto hasta 6 decimales; si no, null (nunca se redondea el tc)", () => {
  assert.equal(tipoCambioMicroDe(1200), BigInt(1_200_000_000));
  assert.equal(tipoCambioMicroDe(1234.5678), BigInt(1_234_567_800));
  assert.equal(tipoCambioMicroDe(3), BigInt(3_000_000));
  assert.equal(tipoCambioMicroDe(0.000001), BigInt(1));
  assert.equal(tipoCambioMicroDe(1.123456), BigInt(1_123_456));
  assert.equal(tipoCambioMicroDe(999_999_999_999), BigInt("999999999999000000"));
  // 1/3 tiene 15 decimales significativos; 1,0000001 tiene 7: no se redondean, quedan sin fijar.
  assert.equal(tipoCambioMicroDe(1 / 3), null);
  assert.equal(tipoCambioMicroDe(1.0000001), null);
  assert.equal(tipoCambioMicroDe(0.0000001), null);
  for (const malo of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 0, -0, -5, -0.5]) {
    assert.equal(tipoCambioMicroDe(malo), null, String(malo));
  }
  // NUMERIC(18,6) tiene 12 cifras enteras: 1e12 y 1e13 no entran.
  assert.equal(tipoCambioMicroDe(1e12), null);
  assert.equal(tipoCambioMicroDe(1e13), null);
});

test("textoDeMicro e importeDeCentavos: el texto exacto para la base y el número sólo para mostrar", () => {
  assert.equal(textoDeMicro(BigInt(1_200_000_000)), "1200.000000");
  assert.equal(textoDeMicro(BigInt(300_000)), "0.300000");
  assert.equal(textoDeMicro(BigInt(1)), "0.000001");
  assert.equal(textoDeMicro(BigInt(1_234_567_800)), "1234.567800");
  assert.equal(textoDeMicro(-BigInt(1_500_000)), "-1.500000");
  assert.equal(importeDeCentavos(BigInt(12_345)), 123.45);
  assert.equal(importeDeCentavos(-BigInt(5)), -0.05);
  assert.equal(importeDeCentavos(BigInt(0)), 0);
});

test("R8 · barrido de 10.000 casos: error ≤ medio centavo, empate sube, monótona, tc = 1 es la identidad", () => {
  const azar = mulberry32(0x0d13_2026);
  for (let i = 0; i < 10_000; i++) {
    const p = entre1Y(azar, BigInt(100_000_000_000_000)); // hasta $ 1 billón, en centavos
    const tc = entre1Y(azar, BigInt("999999999999999999")); // hasta NUMERIC(18,6)
    const q = monedaCentavosDePesos(p, tc);
    const error = q * tc - p * BigInt(1_000_000);
    assert.ok(BigInt(2) * (error < BigInt(0) ? -error : error) <= tc, `p=${p} tc=${tc} q=${q}`);
    // Monótona: un centavo más de pesos nunca da menos.
    assert.ok(monedaCentavosDePesos(p + BigInt(1), tc) >= q, `monótona p=${p} tc=${tc}`);
    // tc = 1 peso por unidad: los mismos centavos.
    assert.equal(monedaCentavosDePesos(p, BigInt(1_000_000)), p);
    // Empate exacto (cociente q0 + 1/2): sube a q0 + 1.
    const k = entre1Y(azar, BigInt(1_000_000));
    const q0 = entre1Y(azar, BigInt(1_000_000_000)) - BigInt(1);
    const tcPar = BigInt(2_000_000) * k;
    const pEmpate = (BigInt(2) * q0 + BigInt(1)) * k;
    assert.equal(monedaCentavosDePesos(pEmpate, tcPar), q0 + BigInt(1), `empate q0=${q0} k=${k}`);
    // Simétrica: −p da −q.
    assert.equal(monedaCentavosDePesos(-p, tc), -q);
  }
});

test("esAlCentavo (cert. D13 · R1): sólo importes que ya están al centavo, leídos como R7", () => {
  for (const si of [0, 0.3, 0.1 + 0.2, 10004.99, 1234.5, 999999999.99, -12.34]) assert.equal(esAlCentavo(si), true, String(si));
  for (const no of [10004.995, 1234.567, 1e-7, 0.005, Number.NaN, Number.POSITIVE_INFINITY, 1e16]) assert.equal(esAlCentavo(no), false, String(no));
});
