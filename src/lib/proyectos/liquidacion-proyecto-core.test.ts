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
import { calcularLiquidacion, cierraAlCentavo, comparacionesDeRevision, rechazoDeRevision, listaParaLaMensual } from "./liquidacion-proyecto-core";
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
