/**
 * Motor de la rendición del proyecto: el premio por defender el costo («defensa») y el reparto de Total venta − costo
 * real entre MIA y las personas (GSG-MIA-056 · T04; Dis. § 1.5 y § 2.6). No es la rendición de gastos de campo
 * (`rendiciones-core.ts`): es la «RENDICION FINAL» de la planilla.
 * Esperados hechos a mano antes del código (plan § 2.1, caso Z y variantes). Todo en centavos. Semilla fija.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { calcularPrecio, TOPE_PLANTILLA, type PorcentajesPrecio } from "./precio-core";
import { ajusteEntre, calcularRendicion, cierraAlCentavo, DIFERENCIAS_CON_PLANILLA, MATRIZ_PLANTILLA, PARTICIPANTES, type MatrizReparto, type Rendicion } from "./rendicion-core";

const $ = (pesos: number) => pesos * 100;
const Z_PCT: PorcentajesPrecio = { productor1: 10, productor2: 0, comercial: 10, rentabilidad: 30, margenError: 5, iibGa: 7 };
const precioZ = () => calcularPrecio({ costoOriginal: $(1_000_000), adicionales: 0, porcentajes: Z_PCT, totalVenta: $(1_490_000), tope: TOPE_PLANTILLA });
const SIN_REPARTO = { productor1: 0, productor2: 0, comercial: 0 };
/** La matriz de la planilla base (Dis. § 1.5): defensa 75 % MIA y 25 % el productor; redondeo y margen de error, 100 % MIA. */
const MATRIZ_Z: MatrizReparto = { defensa: { productor1: 25, productor2: 0, comercial: 0 }, redondeo: SIN_REPARTO, margenError: SIN_REPARTO };
const rendicionZ = (costoReal: number, extra: Partial<Parameters<typeof calcularRendicion>[0]> = {}) =>
  calcularRendicion({ precio: precioZ(), costoReal, matriz: MATRIZ_Z, defensaNegativa: "descuenta", ...extra });

// ── Caso Z (plan § 2.1): costo real 900.000 ──

test("caso Z · defensa 100.000: 75.000 MIA y 25.000 el productor", () => {
  const r = rendicionZ($(900_000));
  assert.equal(r.defensa, $(100_000)); // CO + AD − real
  assert.equal(r.filas.empresa.defensa, $(75_000));
  assert.equal(r.filas.productor1.defensa, $(25_000));
  assert.equal(r.defensaNegativa, false);
});

test("caso Z · totales por participante: MIA 505.000 · productor 55.000 · comercial 30.000", () => {
  const r = rendicionZ($(900_000));
  assert.deepEqual(r.filas.empresa, { defensa: $(75_000), redondeo: $(65_000), comisiones: 0, margenError: $(65_000), rentabilidad: $(300_000), total: $(505_000) });
  assert.deepEqual(r.filas.productor1, { defensa: $(25_000), redondeo: 0, comisiones: $(30_000), margenError: 0, rentabilidad: 0, total: $(55_000) });
  assert.deepEqual(r.filas.productor2, { defensa: 0, redondeo: 0, comisiones: 0, margenError: 0, rentabilidad: 0, total: 0 });
  assert.deepEqual(r.filas.comercial, { defensa: 0, redondeo: 0, comisiones: $(30_000), margenError: 0, rentabilidad: 0, total: $(30_000) });
});

test("caso Z · control de cierre: la suma de las filas = total − real = 590.000, al centavo", () => {
  const r = rendicionZ($(900_000));
  assert.equal(r.control.esperado, $(590_000)); // 1.490.000 − 900.000
  assert.equal(r.control.suma, $(590_000));
  assert.equal(r.control.cierra, true);
  assert.equal(PARTICIPANTES.reduce((s, p) => s + r.filas[p].total, 0), $(590_000));
  assert.equal(cierraAlCentavo(r), true);
});

test("contra la planilla base · la fila de totales es la misma (Dis. § 1.5, fila 16)", () => {
  // La fila de totales de la planilla: defensa = (CO + AD) − real; redondeo = G21; comisiones = G12 + G13 + G14;
  // margen de error = G16; rentabilidad = G15; y la suma = Total venta − costo real.
  const r = rendicionZ($(900_000));
  assert.deepEqual(r.totales, { defensa: $(100_000), redondeo: $(65_000), comisiones: $(60_000), margenError: $(65_000), rentabilidad: $(300_000), total: $(590_000) });
});

// ── Variantes del plan § 2.1 ──

test("Z-neg · costo real 1.300.000: defensa −300.000; productor −45.000, comercial 30.000, MIA 205.000; suma 190.000", () => {
  const r = rendicionZ($(1_300_000));
  assert.equal(r.defensa, -$(300_000));
  assert.equal(r.defensaNegativa, true);
  assert.equal(r.filas.productor1.total, -$(45_000)); // 30.000 − 75.000
  assert.equal(r.filas.comercial.total, $(30_000));
  assert.equal(r.filas.empresa.total, $(205_000)); // 300.000 + 65.000 + 65.000 − 225.000
  assert.equal(r.control.suma, $(190_000));
  assert.equal(r.control.esperado, $(190_000));
  assert.ok(r.avisos.some((a) => /defensa negativa/i.test(a)), "avisa la defensa negativa (decisión 4 A, con aviso visible)");
});

test("Z-neg con piso cero (decisión 4 B, parámetro): las personas no pierden; MIA absorbe y la cuenta igual cierra", () => {
  const r = rendicionZ($(1_300_000), { defensaNegativa: "pisoCero" });
  assert.equal(r.filas.productor1.defensa, 0);
  assert.equal(r.filas.productor1.total, $(30_000));
  assert.equal(r.filas.empresa.defensa, -$(300_000));
  assert.equal(r.filas.empresa.total, $(130_000)); // 300.000 + 65.000 + 65.000 − 300.000
  assert.equal(r.control.suma, $(190_000));
  assert.equal(r.control.cierra, true);
});

test("Z-tarde · un comprobante de 10.000 después: defensa 90.000; ajuste −7.500 MIA y −2.500 el productor", () => {
  const antes = rendicionZ($(900_000));
  const despues = rendicionZ($(910_000));
  assert.equal(despues.defensa, $(90_000));
  assert.deepEqual(ajusteEntre(antes, despues), { empresa: -$(7_500), productor1: -$(2_500), productor2: 0, comercial: 0, total: -$(10_000) });
  // Liquidación original + ajuste = total − real nuevo.
  assert.equal(antes.control.suma + ajusteEntre(antes, despues).total, despues.control.esperado);
});

test("Z-tope y Z-mín también cierran: la cuenta no depende de que el total respete el tope", () => {
  for (const total of [153_225_806, $(1_400_000)]) {
    const precio = calcularPrecio({ costoOriginal: $(1_000_000), adicionales: 0, porcentajes: Z_PCT, totalVenta: total, tope: TOPE_PLANTILLA });
    const r = calcularRendicion({ precio, costoReal: $(900_000), matriz: MATRIZ_Z, defensaNegativa: "descuenta" });
    assert.equal(r.control.suma, total - $(900_000));
    assert.equal(r.control.cierra, true);
  }
});

// ── Reglas de plata del Dis. § 2.6 ──

test("el centavo que sobra va a MIA: a cada persona, su parte sin el centavo partido", () => {
  // Defensa de 1 centavo con 50 % al productor: el productor 0 y MIA 1 (nunca 1 y 0, ni MIA en −1).
  const precio = calcularPrecio({ costoOriginal: 1, adicionales: 0, porcentajes: { ...Z_PCT, rentabilidad: 0 }, totalVenta: 1, tope: TOPE_PLANTILLA });
  const r = calcularRendicion({ precio, costoReal: 0, matriz: { ...MATRIZ_Z, defensa: { productor1: 50, productor2: 0, comercial: 0 } }, defensaNegativa: "descuenta" });
  assert.equal(r.defensa, 1);
  assert.equal(r.filas.productor1.defensa, 0);
  assert.equal(r.filas.empresa.defensa, 1);
  // Defensa de 3 centavos con 33,33 % a dos personas: 0,9999 cada una → 0 y 0; MIA 3.
  const r3 = calcularRendicion({ precio: { ...precio, costoOriginal: 3, subtotal: 3, totalVenta: 3, redondeoBruto: 0 }, costoReal: 0, matriz: { ...MATRIZ_Z, defensa: { productor1: 33.33, productor2: 0, comercial: 33.33 } }, defensaNegativa: "descuenta" });
  assert.equal(r3.filas.productor1.defensa + r3.filas.comercial.defensa, 0);
  assert.equal(r3.filas.empresa.defensa, 3);
  // Con defensa negativa, igual: −1 centavo al 50 % → la persona 0 y MIA −1.
  const rn = calcularRendicion({ precio, costoReal: 2, matriz: { ...MATRIZ_Z, defensa: { productor1: 50, productor2: 0, comercial: 0 } }, defensaNegativa: "descuenta" });
  assert.equal(rn.defensa, -1);
  assert.equal(rn.filas.productor1.defensa, 0);
  assert.ok(!Object.is(rn.filas.productor1.defensa, -0));
  assert.equal(rn.filas.empresa.defensa, -1);
});

test("el redondeo no se reparte a personas hasta la respuesta de MIA (Dis. § 1.4 y § 2.6; plan § 4.2): rechazo", () => {
  assert.throws(() => rendicionZ($(900_000), { matriz: { ...MATRIZ_Z, redondeo: { productor1: 10, productor2: 0, comercial: 0 } } }), /redondeo/i);
});

test("la matriz se valida: porcentajes de 0 a 100 con dos decimales, y las personas no suman más de 100", () => {
  assert.throws(() => rendicionZ($(900_000), { matriz: { ...MATRIZ_Z, defensa: { productor1: 60, productor2: 0, comercial: 41 } } }), RangeError);
  assert.throws(() => rendicionZ($(900_000), { matriz: { ...MATRIZ_Z, defensa: { productor1: -1, productor2: 0, comercial: 0 } } }), RangeError);
  assert.throws(() => rendicionZ($(900_000), { matriz: { ...MATRIZ_Z, margenError: { productor1: 0.001, productor2: 0, comercial: 0 } } }), RangeError);
  // 100 justo es válido: MIA recibe 0 de ese concepto.
  const r = rendicionZ($(900_000), { matriz: { ...MATRIZ_Z, defensa: { productor1: 50, productor2: 0, comercial: 50 } } });
  assert.equal(r.filas.empresa.defensa, 0);
  assert.equal(r.filas.comercial.total, $(80_000)); // 30.000 de comisión + 50.000 de defensa
});

test("sin total de venta no hay rendición; el costo real tiene que ser un entero de centavos", () => {
  const sinTotal = calcularPrecio({ costoOriginal: $(1_000_000), adicionales: 0, porcentajes: Z_PCT, totalVenta: null, tope: TOPE_PLANTILLA });
  assert.throws(() => calcularRendicion({ precio: sinTotal, costoReal: 0, matriz: MATRIZ_Z, defensaNegativa: "descuenta" }), RangeError);
  assert.throws(() => rendicionZ(10.5), RangeError);
  assert.throws(() => rendicionZ(-1), RangeError);
  assert.throws(() => rendicionZ(Number.NaN), RangeError);
});

test("cierraAlCentavo · un centavo de descuadre forzado se detecta (lo usa la aprobación de T10, O22)", () => {
  const r = rendicionZ($(900_000));
  const forzada: Rendicion = { ...r, filas: { ...r.filas, productor1: { ...r.filas.productor1, total: r.filas.productor1.total + 1 } } };
  assert.equal(cierraAlCentavo(forzada), false);
  const filaMal: Rendicion = { ...r, filas: { ...r.filas, empresa: { ...r.filas.empresa, defensa: r.filas.empresa.defensa + 1 } } };
  assert.equal(cierraAlCentavo(filaMal), false);
});

// ── Las cuatro diferencias con la planilla base (Dis. § 1.5): escritas, y el motor no las copia ──

test("las cuatro diferencias con la planilla quedan escritas, con su fuente", () => {
  assert.equal(DIFERENCIAS_CON_PLANILLA.length, 4);
  for (const d of DIFERENCIAS_CON_PLANILLA) {
    assert.ok(d.planilla.length > 20 && d.motor.length > 20 && /DRIVE-INVENTARIO-2026-11-16\.md:14[6-9]/.test(d.fuente), d.id);
  }
});

test("diferencia 1 · la comisión del productor 2 la cobra la fila del productor 2 (en la planilla, nadie)", () => {
  const precio = calcularPrecio({ costoOriginal: $(1_000_000), adicionales: 0, porcentajes: { ...Z_PCT, productor2: 5 }, totalVenta: $(1_510_000), tope: TOPE_PLANTILLA });
  const r = calcularRendicion({ precio, costoReal: $(900_000), matriz: MATRIZ_Z, defensaNegativa: "descuenta" });
  assert.equal(r.filas.productor2.comisiones, $(15_000)); // 300.000 × 5 %
  assert.equal(r.filas.productor2.total, $(15_000));
  assert.equal(r.control.cierra, true);
});

test("diferencia 2 · el total del comercial suma su parte de defensa (en la planilla, L19 no la suma)", () => {
  const r = rendicionZ($(900_000), { matriz: { ...MATRIZ_Z, defensa: { productor1: 25, productor2: 0, comercial: 10 } } });
  assert.equal(r.filas.comercial.defensa, $(10_000));
  assert.equal(r.filas.comercial.total, $(40_000));
  assert.equal(r.filas.empresa.defensa, $(65_000));
  assert.equal(r.control.cierra, true);
});

test("diferencia 3 · el costo real entra como un solo número: no se le suma ninguna línea que ya incluye", () => {
  const r = rendicionZ($(900_000));
  assert.equal(r.defensa, precioZ().costoOriginal + precioZ().adicionales - $(900_000));
});

test("diferencia 4 · margen de error y rentabilidad de las personas: 0 salvo matriz; la rentabilidad, entera a MIA", () => {
  const r = rendicionZ($(900_000));
  for (const p of ["productor1", "productor2", "comercial"] as const) {
    assert.equal(r.filas[p].rentabilidad, 0);
    assert.equal(r.filas[p].margenError, 0);
  }
  assert.equal(r.filas.empresa.rentabilidad, precioZ().rentabilidad);
});

test("la matriz de la plantilla es la de la planilla base y está marcada provisional", () => {
  assert.deepEqual(MATRIZ_PLANTILLA.defensa, { productor1: 25, productor2: 0, comercial: 0 });
  assert.deepEqual(MATRIZ_PLANTILLA.redondeo, SIN_REPARTO);
  assert.deepEqual(MATRIZ_PLANTILLA.margenError, SIN_REPARTO);
  assert.equal(MATRIZ_PLANTILLA.provisional, true);
});

test("el motor no lee la base: no importa Prisma ni nada del servidor", async () => {
  const { readFileSync } = await import("node:fs");
  const fuente = readFileSync(new URL("./rendicion-core.ts", import.meta.url), "utf8");
  assert.doesNotMatch(fuente, /from\s+["'][^"']*(prisma|\.server|next\/)/);
  assert.doesNotMatch(fuente, /Date\.now|Math\.random/);
});

// ── Propiedad con semilla fija (Dis. § 6, PR 3; plan C-O14): la suma de las filas = total − real ──

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

test("propiedad · 5.000 casos al azar (semilla 20261117): cada concepto se reparte entero y las filas suman total − real", () => {
  const azar = generador(20261117);
  const entero = (max: number) => Math.floor(azar() * (max + 1));
  const pct = (max: number) => entero(max * 100) / 100;
  /** Porcentajes de tres personas que no pasan de 100. */
  const tres = () => {
    const a = pct(100);
    const b = Math.min(pct(100), Math.round((100 - a) * 100) / 100);
    const c = Math.min(pct(100), Math.round((100 - a - b) * 100) / 100);
    return { productor1: a, productor2: b, comercial: c };
  };
  for (let i = 0; i < 5000; i++) {
    const costoOriginal = entero(5_000_000_000_00);
    const adicionales = azar() < 0.3 ? entero(500_000_000_00) : 0;
    const porcentajes = { productor1: pct(20), productor2: pct(20), comercial: pct(20), rentabilidad: pct(60), margenError: pct(15), iibGa: pct(15) };
    const base = calcularPrecio({ costoOriginal, adicionales, porcentajes, totalVenta: null, tope: TOPE_PLANTILLA });
    const totalVenta = Math.max(0, base.subtotal + entero(base.subtotal / 10 + 1) - entero(base.subtotal / 10 + 1));
    const precio = calcularPrecio({ costoOriginal, adicionales, porcentajes, totalVenta, tope: TOPE_PLANTILLA });
    const costoReal = entero(Math.floor((costoOriginal + adicionales) * 1.5) + 1);
    const matriz: MatrizReparto = { defensa: tres(), redondeo: SIN_REPARTO, margenError: tres() };
    const defensaNegativa = azar() < 0.5 ? "descuenta" : "pisoCero";
    const r = calcularRendicion({ precio, costoReal, matriz, defensaNegativa });
    const esperado = totalVenta - costoReal;
    assert.equal(r.control.esperado, esperado, `caso ${i}`);
    assert.equal(r.control.suma, esperado, `caso ${i}`);
    assert.equal(r.control.cierra, true, `caso ${i}`);
    assert.equal(cierraAlCentavo(r), true, `caso ${i}`);
    for (const concepto of ["defensa", "redondeo", "comisiones", "margenError", "rentabilidad", "total"] as const) {
      assert.equal(PARTICIPANTES.reduce((s, p) => s + r.filas[p][concepto], 0), r.totales[concepto], `caso ${i}: ${concepto}`);
    }
    for (const p of PARTICIPANTES) {
      const f = r.filas[p];
      for (const v of Object.values(f)) assert.ok(Number.isSafeInteger(v), `caso ${i}: ${p} no es entero`);
      assert.equal(f.total, f.defensa + f.redondeo + f.comisiones + f.margenError + f.rentabilidad, `caso ${i}: fila ${p}`);
    }
    // Nadie recibe más que su parte exacta (en valor absoluto): el centavo partido queda en MIA.
    for (const p of ["productor1", "productor2", "comercial"] as const) {
      const exacta = Math.abs(r.defensa * matriz.defensa[p] / 100);
      assert.ok(Math.abs(r.filas[p].defensa) <= exacta + 1e-6 * Math.max(1, exacta), `caso ${i}: ${p} recibe de más`);
      if (defensaNegativa === "pisoCero" && r.defensa < 0) assert.equal(r.filas[p].defensa, 0, `caso ${i}`);
    }
  }
});
