/**
 * Motor de precio por total (GSG-MIA-056 · T04). Casos del plan PLAN-MIA-50-OPERACIONES.md § 2.1 (caso patrón Z y
 * variantes), calculados a mano ANTES de escribir el código (R7): ningún esperado sale de la salida del motor.
 * Todo en centavos enteros. Deterministas: sin reloj ni azar real (semilla fija).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { aPuntosBasicos, calcularPrecio, multiplicarPorPuntos, PORCENTAJES_PLANTILLA, TOPE_PLANTILLA, type EntradaPrecio, type PorcentajesPrecio } from "./precio-core";

/** Los porcentajes del caso Z (los de la plantilla, publicados en DRIVE-INVENTARIO-2026-11-16.md:144): 10/0/10/30/5/7. */
const Z_PCT: PorcentajesPrecio = { productor1: 10, productor2: 0, comercial: 10, rentabilidad: 30, margenError: 5, iibGa: 7 };
const $ = (pesos: number) => pesos * 100; // los esperados se escriben en pesos enteros y se pasan a centavos
const z = (totalVenta: number | null, extra: Partial<EntradaPrecio> = {}): EntradaPrecio => ({
  costoOriginal: $(1_000_000),
  adicionales: 0,
  porcentajes: Z_PCT,
  totalVenta,
  tope: { pct: 5, medidoSobre: "bruto" },
  ...extra,
});

// ── Redondeo (R1 del ERP: medio centavo lejos del cero, src/lib/dinero/redondeo.ts:4) ──

test("redondeo · medio centavo hacia arriba, lejos del cero, en los dos signos", () => {
  assert.equal(multiplicarPorPuntos(1, 5000), 1); // 0,5 → 1
  assert.equal(multiplicarPorPuntos(-1, 5000), -1); // −0,5 → −1
  assert.equal(multiplicarPorPuntos(3, 3333), 1); // 0,9999 → 1
  assert.equal(multiplicarPorPuntos(1, 4999), 0); // 0,4999 → 0
  assert.equal(multiplicarPorPuntos(-1, 4999), 0); // −0,4999 → 0, nunca −0
  assert.ok(!Object.is(multiplicarPorPuntos(-1, 4999), -0));
  assert.equal(multiplicarPorPuntos(12_345, 1000), 1235); // 1.234,5 → 1.235
  assert.equal(multiplicarPorPuntos(-12_345, 1000), -1235);
});

test("redondeo · la cuenta es entera aunque el producto pase 2^53", () => {
  // 900.000.000.000.000 centavos (9 billones de pesos) × 33,33 %: el producto es 2,9997 × 10^18, fuera de un double exacto.
  // 900.000.000.000.000 × 3333 / 10000 = 299.970.000.000.000 exacto.
  assert.equal(multiplicarPorPuntos(900_000_000_000_000, 3333), 299_970_000_000_000);
  // 999.999.999.999.999 × 1 / 10000 = 99.999.999.999,9999 → 100.000.000.000
  assert.equal(multiplicarPorPuntos(999_999_999_999_999, 1), 100_000_000_000);
});

test("redondeo · IIB y GA: subtotal × p ÷ (100 − p), redondeado una sola vez", () => {
  // Z: 1.425.000 × 7 ÷ 93 = 107.258,0645… → 107.258,06
  assert.equal(calcularPrecio(z(null)).iibGa, 10_725_806);
  // Un subtotal de 76,92 pesos (7.692 centavos) sin otros renglones:
  assert.equal(calcularPrecio({ ...z(null), costoOriginal: 7_692, porcentajes: { ...Z_PCT, rentabilidad: 0, margenError: 0, productor1: 0, comercial: 0 } }).iibGa, 579); // 76,92 × 7/93 = 5,7898 → 5,79
});

test("porcentajes · se leen con hasta dos decimales y se rechaza lo que no es un porcentaje", () => {
  assert.equal(aPuntosBasicos(30), 3000);
  assert.equal(aPuntosBasicos(7.5), 750);
  assert.equal(aPuntosBasicos(0.01), 1);
  assert.equal(aPuntosBasicos(33.33), 3333);
  assert.equal(aPuntosBasicos(1.1), 110); // 1,1 en binario es 1,1000000000000000888…: igual son 110
  assert.throws(() => aPuntosBasicos(1.005), RangeError); // tres decimales
  assert.throws(() => aPuntosBasicos(-1), RangeError);
  assert.throws(() => aPuntosBasicos(100.01), RangeError);
  assert.throws(() => aPuntosBasicos(Number.NaN), RangeError);
  assert.throws(() => calcularPrecio({ ...z(null), porcentajes: { ...Z_PCT, iibGa: 100 } }), RangeError); // ÷ 0
});

test("importes · se rechaza lo que no es un entero de centavos", () => {
  assert.throws(() => calcularPrecio({ ...z(null), costoOriginal: 10.5 }), RangeError);
  assert.throws(() => calcularPrecio({ ...z(null), costoOriginal: -1 }), RangeError);
  assert.throws(() => calcularPrecio({ ...z(null), adicionales: Number.NaN }), RangeError);
  assert.throws(() => calcularPrecio(z(1.5)), RangeError);
  assert.throws(() => calcularPrecio(z(-100)), RangeError);
});

// ── Caso Z, renglón por renglón (plan § 2.1) ──

test("caso Z · cada renglón del tablero es el de la tabla del plan § 2.1", () => {
  const p = calcularPrecio(z($(1_490_000)));
  assert.equal(p.costoOriginal, $(1_000_000));
  assert.equal(p.adicionales, 0);
  assert.equal(p.rentabilidad, $(300_000)); // (CO + AD) × 30 %
  assert.equal(p.comisiones.productor1, $(30_000)); // R × 10 %
  assert.equal(p.comisiones.productor2, 0); // R × 0 %
  assert.equal(p.comisiones.comercial, $(30_000)); // R × 10 %
  assert.equal(p.margenError, $(65_000)); // (CO + R) × 5 %
  assert.equal(p.subtotal, $(1_425_000));
  assert.equal(p.iibGa, 10_725_806); // 107.258,06
  assert.equal(p.totalVenta, $(1_490_000));
  assert.equal(p.redondeoBruto, $(65_000));
  assert.equal(p.redondeoPuntos, 436); // 65.000 ÷ 1.490.000 = 4,3624 % → 4,36 %
  assert.equal(p.redondeoNeto, -4_225_806); // 65.000 − 107.258,06 = −42.258,06
  assert.equal(p.totalMenorAlSubtotal, false);
  assert.equal(p.pasaTope, false); // 4,36 % bajo el 5 %
});

test("caso Z · la suma de las partes da el subtotal (el subtotal no suma IIB y GA, Dis. § 1.4 G18)", () => {
  const p = calcularPrecio(z($(1_490_000)));
  const partes = p.costoOriginal + p.adicionales + p.rentabilidad + p.comisiones.productor1 + p.comisiones.productor2 + p.comisiones.comercial + p.margenError;
  assert.equal(p.subtotal, partes);
  assert.equal(p.totalVenta, p.subtotal + (p.redondeoBruto as number));
  assert.equal(p.redondeoNeto, (p.redondeoBruto as number) - p.iibGa);
});

test("caso Z · el margen de error no incluye adicionales; la rentabilidad sí (Dis. § 1.4 G15 y G16)", () => {
  // AD 100.000: R = 1.100.000 × 30 % = 330.000; comisiones 33.000 y 33.000; ME = (1.000.000 + 330.000) × 5 % = 66.500.
  // Subtotal = 1.000.000 + 100.000 + 330.000 + 33.000 + 0 + 33.000 + 66.500 = 1.562.500.
  const p = calcularPrecio(z(null, { adicionales: $(100_000) }));
  assert.equal(p.rentabilidad, $(330_000));
  assert.equal(p.comisiones.productor1, $(33_000));
  assert.equal(p.margenError, $(66_500));
  assert.equal(p.subtotal, $(1_562_500));
  assert.equal(p.totalVenta, null);
  assert.equal(p.redondeoBruto, null);
  assert.equal(p.redondeoNeto, null);
  assert.equal(p.redondeoPuntos, null);
  assert.equal(p.pasaTope, false);
});

test("Z-tope · total 1.532.258,06: redondeo de 7,00 %, pasa el 5 % medido como el Excel (bruto)", () => {
  const p = calcularPrecio(z(153_225_806));
  assert.equal(p.redondeoBruto, 10_725_806); // 1.532.258,06 − 1.425.000
  assert.equal(p.redondeoPuntos, 700);
  assert.equal(p.redondeoNeto, 0); // el bruto cubre justo el IIB y GA
  assert.equal(p.pasaTope, true);
  assert.equal(p.totalMenorAlSubtotal, false);
  // Medido sobre el neto (parámetro del § 4.1 del plan), el mismo total no pasa: el neto es 0.
  assert.equal(calcularPrecio({ ...z(153_225_806), tope: { pct: 5, medidoSobre: "neto" } }).pasaTope, false);
});

test("tope · justo en el 5 % no pasa; un centavo más, sí", () => {
  // Total T con redondeo = 5 % de T: T − 1.425.000 = 0,05 T → T = 1.500.000; redondeo 75.000 = 5,00 % exacto.
  assert.equal(calcularPrecio(z($(1_500_000))).pasaTope, false);
  assert.equal(calcularPrecio(z($(1_500_000))).redondeoPuntos, 500);
  assert.equal(calcularPrecio(z($(1_500_000) + 1)).pasaTope, true);
});

test("Z-mín · total 1.400.000, menor al subtotal: se marca y el redondeo queda negativo, sin pasar el tope", () => {
  const p = calcularPrecio(z($(1_400_000)));
  assert.equal(p.totalMenorAlSubtotal, true);
  assert.equal(p.redondeoBruto, -$(25_000));
  assert.equal(p.pasaTope, false);
});

test("total igual al subtotal: redondeo 0, no es menor; total 0 con subtotal 0: sin división por cero", () => {
  const p = calcularPrecio(z($(1_425_000)));
  assert.equal(p.redondeoBruto, 0);
  assert.equal(p.totalMenorAlSubtotal, false);
  const cero = calcularPrecio({ ...z(0), costoOriginal: 0 });
  assert.equal(cero.subtotal, 0);
  assert.equal(cero.redondeoPuntos, null);
  assert.equal(cero.pasaTope, false);
});

test("los porcentajes llegan como argumento: otra productora con otros valores, misma cuenta", () => {
  // CO 2.000.000, AD 0, rentabilidad 25 %, productor1 12,5 %, productor2 5 %, comercial 0 %, ME 3 %, IIB y GA 4,5 %.
  // R = 500.000 · c1 = 62.500 · c2 = 25.000 · cc = 0 · ME = 2.500.000 × 3 % = 75.000
  // Subtotal = 2.000.000 + 500.000 + 62.500 + 25.000 + 75.000 = 2.662.500
  // IIB y GA = 2.662.500 × 4,5 ÷ 95,5 = 11.981.250 ÷ 95,5 = 125.458,115… → 125.458,12
  // (la primera cuenta a mano decía 125.457,07: error de la cuenta, no del motor; se rehízo con fracciones exactas)
  const p = calcularPrecio({ costoOriginal: $(2_000_000), adicionales: 0, porcentajes: { rentabilidad: 25, productor1: 12.5, productor2: 5, comercial: 0, margenError: 3, iibGa: 4.5 }, totalVenta: null, tope: TOPE_PLANTILLA });
  assert.equal(p.rentabilidad, $(500_000));
  assert.equal(p.comisiones.productor1, $(62_500));
  assert.equal(p.comisiones.productor2, $(25_000));
  assert.equal(p.margenError, $(75_000));
  assert.equal(p.subtotal, $(2_662_500));
  assert.equal(p.iibGa, 12_545_812);
});

test("la plantilla por defecto es la del Drive (10/0/10/30/5/7 y tope 5 % bruto) y está marcada provisional", () => {
  assert.deepEqual({ ...PORCENTAJES_PLANTILLA, provisional: undefined }, { productor1: 10, productor2: 0, comercial: 10, rentabilidad: 30, margenError: 5, iibGa: 7, provisional: undefined });
  assert.equal(PORCENTAJES_PLANTILLA.provisional, true);
  assert.equal(TOPE_PLANTILLA.pct, 5);
  assert.equal(TOPE_PLANTILLA.medidoSobre, "bruto");
  assert.equal(TOPE_PLANTILLA.provisional, true);
});

test("el motor no lee la base: no importa Prisma ni nada del servidor", async () => {
  const { readFileSync } = await import("node:fs");
  const fuente = readFileSync(new URL("./precio-core.ts", import.meta.url), "utf8");
  assert.doesNotMatch(fuente, /from\s+["'][^"']*(prisma|\.server|next\/)/);
  assert.doesNotMatch(fuente, /Date\.now|Math\.random/);
});

// ── Propiedad, con semilla fija: la suma de las partes da el subtotal y el total, siempre al centavo ──

/** mulberry32: el mismo generador y la misma semilla dan la misma corrida en cualquier máquina. */
function generador(semilla: number) {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test("propiedad · 5.000 casos al azar (semilla 20261117): subtotal = suma de renglones y total = subtotal + redondeo", () => {
  const azar = generador(20261117);
  const entero = (max: number) => Math.floor(azar() * (max + 1));
  const pct = (max: number) => entero(max * 100) / 100; // dos decimales
  for (let i = 0; i < 5000; i++) {
    const costoOriginal = entero(10_000_000_000_00); // hasta 10.000 millones de pesos
    const adicionales = azar() < 0.3 ? entero(1_000_000_000_00) : 0;
    const porcentajes = { productor1: pct(20), productor2: pct(20), comercial: pct(20), rentabilidad: pct(60), margenError: pct(15), iibGa: pct(15) };
    const sinTotal = calcularPrecio({ costoOriginal, adicionales, porcentajes, totalVenta: null, tope: TOPE_PLANTILLA });
    const totalVenta = Math.max(0, sinTotal.subtotal + entero(sinTotal.subtotal / 5 + 1) - entero(sinTotal.subtotal / 20 + 1));
    const p = calcularPrecio({ costoOriginal, adicionales, porcentajes, totalVenta, tope: TOPE_PLANTILLA });
    const renglones = [p.costoOriginal, p.adicionales, p.rentabilidad, p.comisiones.productor1, p.comisiones.productor2, p.comisiones.comercial, p.margenError];
    for (const r of [...renglones, p.subtotal, p.iibGa, p.redondeoBruto, p.redondeoNeto]) assert.ok(Number.isSafeInteger(r), `caso ${i}: ${r} no es un entero de centavos`);
    assert.equal(p.subtotal, renglones.reduce((s, r) => s + r, 0), `caso ${i}`);
    assert.equal(p.totalVenta, p.subtotal + (p.redondeoBruto as number), `caso ${i}`);
    assert.equal(p.redondeoNeto, (p.redondeoBruto as number) - p.iibGa, `caso ${i}`);
    assert.equal(p.totalMenorAlSubtotal, totalVenta < p.subtotal, `caso ${i}`);
    // El tope con aritmética entera: redondeo × 10.000 > 500 × total.
    assert.equal(p.pasaTope, totalVenta > 0 && BigInt(p.redondeoBruto as number) * 10_000n > 500n * BigInt(totalVenta), `caso ${i}`);
    // Cada renglón está a medio centavo o menos de la cuenta exacta.
    const r = (costoOriginal + adicionales) * porcentajes.rentabilidad / 100;
    assert.ok(Math.abs(p.rentabilidad - r) <= 0.5 + 1e-6 * Math.max(1, r), `caso ${i}: rentabilidad ${p.rentabilidad} contra ${r}`);
  }
});
