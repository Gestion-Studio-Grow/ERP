// Liquidación del proyecto (T10): el motor puro. Los esperados salen a mano del escenario Z (plan MIA-50 § 2), en pesos
// y pasados a centavos (× 100). Ninguno se copió de una salida del motor.
//
// Z: CO 1.000.000 · AD 0 · rentabilidad 30 % = 300.000 · comisión productor 10 % de R = 30.000 · comercial 30.000 ·
//    margen 5 % de (CO + R) = 65.000 · subtotal 1.425.000 · total escrito 1.490.000 · redondeo bruto 65.000.
//    Real 900.000 → defensa = 1.000.000 − 900.000 = 100.000; productor 25 % = 25.000, empresa 75.000.
//    Productor = 25.000 + 30.000 = 55.000 · comercial = 30.000 ·
//    empresa = 75.000 + 65.000 (margen) + 65.000 (redondeo) + 300.000 (R) = 505.000.
//    Suma = 590.000 = 1.490.000 − 900.000.
// Z-neg: real 1.300.000 → defensa −300.000; productor −75.000 + 30.000 = −45.000; comercial 30.000;
//    empresa −225.000 + 65.000 + 65.000 + 300.000 = 205.000. Suma 190.000 = 1.490.000 − 1.300.000.
// Z-neg con piso cero: productor 30.000; comercial 30.000; empresa −300.000 + 430.000 = 130.000. Suma 190.000.
import { test } from "node:test";
import assert from "node:assert/strict";
import { calcularAjuste, calcularLiquidacion, cierraAlCentavo, saldosAFavor, comparacionesDeRevision, rechazoDeRevision, listaParaLaMensual, compensarConSaldos, aPagarDelAjuste } from "./liquidacion-proyecto-core";
import { calcularRendicion, MATRIZ_PLANTILLA } from "./rendicion-core";
import type { ParticipanteFoto } from "./precio-proyecto-core";

const $ = (pesos: number) => pesos * 100;

const PARTICIPANTES: ParticipanteFoto[] = [
  { equipoId: "eq-prod", personaId: "p-prod", nombre: "Productora", funcion: "PRODUCTOR", comisionPct: 10, reparto: { DEFENSA: 25 } },
  { equipoId: "eq-com", personaId: "p-com", nombre: "Comercial", funcion: "COMERCIAL", comisionPct: 10, reparto: { DEFENSA: 0 } },
  { equipoId: null, personaId: null, nombre: "Empresa", funcion: "EMPRESA", comisionPct: 0, reparto: { DEFENSA: 75, REDONDEO: 100 } },
];

const Z = (costoReal: number, defensaNegativa = "DESCUENTA") => ({
  totalVenta: $(1_490_000),
  costoOriginal: $(1_000_000),
  adicionales: 0,
  redondeoBruto: $(65_000),
  rentabilidad: $(300_000),
  margenError: $(65_000),
  comisiones: { PRODUCTOR: $(30_000), COMERCIAL: $(30_000) },
  participantes: PARTICIPANTES,
  costoReal: $(costoReal),
  defensaNegativa,
});

const totales = (r: ReturnType<typeof calcularLiquidacion>) => Object.fromEntries(r.lineas.map((l) => [l.clave, l.total]));

test("Z: productor 55.000, comercial 30.000, empresa 505.000; suma 590.000 = total − real", () => {
  const r = calcularLiquidacion(Z(900_000));
  assert.deepEqual(totales(r), { "eq-prod": $(55_000), "eq-com": $(30_000), EMPRESA: $(505_000) });
  assert.equal(r.esperado, $(590_000));
  assert.equal(r.cierra, true);
  assert.deepEqual(r.avisos, []);
});

test("Z-neg «descuenta»: productor −45.000, comercial 30.000, empresa 205.000; suma 190.000", () => {
  const r = calcularLiquidacion(Z(1_300_000));
  assert.deepEqual(totales(r), { "eq-prod": $(-45_000), "eq-com": $(30_000), EMPRESA: $(205_000) });
  assert.equal(r.cierra, true);
  assert.equal(r.avisos.length, 1);
});

test("Z-neg «piso cero»: productor 30.000, comercial 30.000, empresa 130.000", () => {
  const r = calcularLiquidacion(Z(1_300_000, "PISO_CERO"));
  assert.deepEqual(totales(r), { "eq-prod": $(30_000), "eq-com": $(30_000), EMPRESA: $(130_000) });
  assert.equal(r.cierra, true);
});

test("equivale a la rendición de T04 en Z (mismo reparto, otra forma)", () => {
  const precio = { costoOriginal: $(1_000_000), adicionales: 0, rentabilidad: $(300_000), comisiones: { productor1: $(30_000), productor2: 0, comercial: $(30_000) }, margenError: $(65_000), subtotal: $(1_425_000), iibGa: 0, totalVenta: $(1_490_000), redondeoBruto: $(65_000), redondeoNeto: $(65_000), redondeoPuntos: 436, totalMenorAlSubtotal: false, pasaTope: false };
  for (const real of [900_000, 1_300_000, 999_999]) {
    const t04 = calcularRendicion({ precio, costoReal: $(real), matriz: MATRIZ_PLANTILLA, defensaNegativa: "descuenta" });
    const t10 = totales(calcularLiquidacion(Z(real)));
    assert.deepEqual(t10, { "eq-prod": t04.filas.productor1.total, "eq-com": t04.filas.comercial.total, EMPRESA: t04.filas.empresa.total }, `real ${real}`);
  }
});

test("el centavo partido queda en la empresa: defensa 0,03 al 25 % → productor 0 centavos", () => {
  const r = calcularLiquidacion({ ...Z(0), costoOriginal: 3, totalVenta: 3 + $(490_000) }); // 3 + 60.000 + 65.000 + 65.000 + 300.000 pesos
  assert.equal(r.lineas[0].detalle.defensa, 0); // 3 × 25 % = 0,75 centavos → 0
  assert.equal(r.lineas[2].detalle.defensa, 3);
  assert.equal(r.cierra, true);
});

test("comisión de una función sin persona: a la empresa, con aviso", () => {
  const r = calcularLiquidacion({ ...Z(900_000), comisiones: { PRODUCTOR: $(30_000), COMERCIAL: $(30_000), DISENO: $(10_000) }, totalVenta: $(1_500_000) });
  assert.equal(r.lineas[2].comision, $(10_000));
  assert.equal(r.cierra, true);
  assert.match(r.avisos[0], /DISENO/);
});

test("cierraAlCentavo: un centavo de descuadre no cierra (BigInt de la base o number)", () => {
  const r = calcularLiquidacion(Z(900_000));
  assert.equal(cierraAlCentavo(r.lineas, r.esperado), true);
  const big = r.lineas.map((l) => ({ comision: BigInt(l.comision), reparto: BigInt(l.reparto), redondeo: BigInt(l.redondeo), rentabilidad: BigInt(l.rentabilidad), total: BigInt(l.total) }));
  assert.equal(cierraAlCentavo(big, BigInt(r.esperado)), true);
  big[0] = { ...big[0], total: big[0].total + BigInt(1), reparto: big[0].reparto + BigInt(1) };
  assert.equal(cierraAlCentavo(big, BigInt(r.esperado)), false);
  const sinCuadrar = r.lineas.map((l, i) => (i === 0 ? { ...l, total: l.total + 1 } : l));
  assert.equal(cierraAlCentavo(sinCuadrar, r.esperado + 1), false); // la línea ya no suma sus partes
});

test("revisión: sin diferencia no pide nota; con diferencia, sí", () => {
  const sin = comparacionesDeRevision({ costoReal: $(900_000), comprobantes: $(900_000), facturado: $(1_802_900), cobrado: $(1_802_900) });
  assert.equal(rechazoDeRevision(sin, ""), null);
  const con = comparacionesDeRevision({ costoReal: $(910_000), comprobantes: $(900_000), facturado: $(1_802_900), cobrado: $(1_802_900) });
  assert.equal(con[0].diferencia, $(10_000));
  assert.match(rechazoDeRevision(con, " ") ?? "", /nota/);
  assert.equal(rechazoDeRevision(con, "Gasto de taxi sin comprobante"), null);
});

test("cuándo se paga: al cobrar todo espera el saldo; al aprobar, no", () => {
  assert.equal(listaParaLaMensual({ estado: "REVISADA", cuandoSePaga: "AL_APROBAR", porCobrar: 0 }).lista, false);
  const espera = listaParaLaMensual({ estado: "APROBADA", cuandoSePaga: "AL_COBRAR_TODO", porCobrar: $(100) });
  assert.equal(espera.lista, false);
  assert.match(espera.lista ? "" : espera.motivo, /pague todo/);
  assert.equal(listaParaLaMensual({ estado: "APROBADA", cuandoSePaga: "AL_COBRAR_TODO", porCobrar: 0 }).lista, true);
  assert.equal(listaParaLaMensual({ estado: "APROBADA", cuandoSePaga: "AL_APROBAR", porCobrar: $(100) }).lista, true);
});

// T12 · Z-tarde (a mano): aprobada con real 900.000, llega un comprobante de 10.000 → real 910.000, defensa 90.000.
//   Productor 25 % de 90.000 = 22.500 (tenía 25.000): −2.500. Empresa 75 % = 67.500 (tenía 75.000): −7.500. Comercial 0.
//   Liquidación 590.000 + ajustes −10.000 = 580.000 = 1.490.000 − 910.000.
const guardadas = (r: ReturnType<typeof calcularLiquidacion>) => r.lineas.map((l) => ({ id: `l-${l.clave}`, clave: l.clave, personaId: l.personaId, nombre: l.nombre, total: BigInt(l.total) }));

test("T12 · C-O24 · Z-tarde: ajuste −2.500 al productor y −7.500 a la empresa; liquidación + ajustes = total − real nuevo", () => {
  const lineas = guardadas(calcularLiquidacion(Z(900_000)));
  const r = calcularAjuste({ lineas, previos: [], recalculo: calcularLiquidacion(Z(910_000)) });
  assert.deepEqual(r.renglones.map((x) => [x.clave, x.monto]), [["eq-prod", -$(2_500)], ["EMPRESA", -$(7_500)]]);
  assert.equal(r.cierra, true);
  assert.equal(lineas.reduce((s, l) => s + Number(l.total), 0) + r.renglones.reduce((s, x) => s + x.monto, 0), $(1_490_000) - $(910_000));
  // El mismo comprobante otra vez (ya ajustado): nada nuevo.
  const otra = calcularAjuste({ lineas, previos: r.renglones, recalculo: calcularLiquidacion(Z(910_000)) });
  assert.deepEqual(otra.renglones, []);
  assert.equal(otra.cierra, true);
  // Un descuadre de 1 centavo en lo previo: no cierra.
  assert.equal(calcularAjuste({ lineas, previos: [{ lineaId: "l-EMPRESA", monto: 1 }], recalculo: calcularLiquidacion(Z(910_000)) }).renglones.find((x) => x.clave === "EMPRESA")?.monto, -$(7_500) - 1);
});

test("T12 · C-O26 · Z-neg: el productor queda en −45.000 → saldo a favor de 45.000; la empresa no tiene saldo", () => {
  const r = calcularLiquidacion(Z(1_300_000));
  assert.deepEqual(saldosAFavor(r.lineas.map((l) => ({ personaId: l.personaId, monto: l.total }))), [{ personaId: "p-prod", monto: $(45_000) }]);
  assert.deepEqual(saldosAFavor([{ personaId: null, monto: -1 }, { personaId: "x", monto: 0 }]), []);
});

// MIA-184 (A) · el positivo primero cancela el saldo a favor de la misma persona; sólo el resto se paga. A mano:
// saldos de la productora 1.000 (sin aplicar) y 2.000 (500 aplicados) → libres 1.000 y 1.500. Renglón +3.000 →
// compensa 1.000 + 1.500 = 2.500 y paga 500. El comercial (+700, sin saldo) paga 700. La empresa no compensa.
test("MIA-184 · compensarConSaldos y aPagarDelAjuste", () => {
  const r = compensarConSaldos(
    [{ lineaId: "lp", personaId: "prod", monto: 3_000 }, { lineaId: "lc", personaId: "com", monto: 700 }, { lineaId: "le", personaId: null, monto: 9_000 }, { lineaId: "ln", personaId: "prod", monto: -400 }],
    [{ id: "s1", personaId: "prod", monto: 1_000, aplicado: 0 }, { id: "s2", personaId: "prod", monto: 2_000, aplicado: 500 }],
  );
  assert.deepEqual([...r.compensado], [["lp", 2_500]]);
  assert.deepEqual(r.aplicar, [{ saldoId: "s1", monto: 1_000 }, { saldoId: "s2", monto: 1_500 }]);
  assert.equal(aPagarDelAjuste({ monto: 3_000, detalle: { compensado: 2_500 } }), 500);
  assert.equal(aPagarDelAjuste({ monto: 700, detalle: {} }), 700);
  assert.equal(aPagarDelAjuste({ monto: 250, detalle: { compensado: 250 } }), 0);
  assert.equal(aPagarDelAjuste({ monto: -400, detalle: null }), 0, "un negativo nunca se paga");
});
