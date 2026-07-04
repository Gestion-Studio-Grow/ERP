// QA del motor de cálculo fiscal (ADR-006). Corre con `npm test` (node:test vía
// tsx, sin dependencias nuevas). Protección de regresión: cada invariante fiscal
// que ARCA valida tiene su caso acá.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calcularComprobante,
  assertConsistente,
  ALICUOTAS_IVA,
  type LineaComprobante,
} from "../calculo-fiscal";

const linea = (
  importe: number,
  alicuota: LineaComprobante["alicuota"] = "21",
  extra: Partial<LineaComprobante> = {},
): LineaComprobante => ({ importe, alicuota, incluyeIva: true, ...extra });

// ---------------------------------------------------------------- catálogo ARCA
test("códigos de alícuota de ARCA (WSFEv1)", () => {
  assert.equal(ALICUOTAS_IVA["0"].id, 3);
  assert.equal(ALICUOTAS_IVA["10.5"].id, 4);
  assert.equal(ALICUOTAS_IVA["21"].id, 5);
  assert.equal(ALICUOTAS_IVA["27"].id, 6);
  assert.equal(ALICUOTAS_IVA["5"].id, 8);
  assert.equal(ALICUOTAS_IVA["2.5"].id, 9);
});

// ---------------------------------------------------------- Factura B (RI)
test("B: una línea 121000 IVA incluido al 21% -> neto 100000 / iva 21000", () => {
  const r = calcularComprobante("RESPONSABLE_INSCRIPTO", [linea(121000, "21")]);
  assert.equal(r.tipo, "FACTURA_B");
  assert.equal(r.neto, 100000);
  assert.equal(r.iva, 21000);
  assert.equal(r.total, 121000);
  assert.equal(r.ivaDetalle.length, 1);
  assert.equal(r.ivaDetalle[0].alicuotaId, 5);
});

test("B: línea con neto explícito (incluyeIva=false)", () => {
  const r = calcularComprobante("RESPONSABLE_INSCRIPTO", [linea(100000, "21", { incluyeIva: false })]);
  assert.equal(r.neto, 100000);
  assert.equal(r.iva, 21000);
  assert.equal(r.total, 121000);
});

test("B: todas las alícuotas calculan y quedan consistentes", () => {
  for (const cod of Object.keys(ALICUOTAS_IVA) as (keyof typeof ALICUOTAS_IVA)[]) {
    const r = calcularComprobante("RESPONSABLE_INSCRIPTO", [linea(12100, cod, { incluyeIva: false })]);
    assert.doesNotThrow(() => assertConsistente(r));
    assert.equal(r.neto, 12100);
    assert.equal(Math.round(r.iva * 100), Math.round(12100 * (ALICUOTAS_IVA[cod].pct / 100) * 100));
  }
});

// --------------------------------------------------------------- multi-alícuota
test("multi-alícuota: dos alícuotas en el desglose, total exacto", () => {
  const r = calcularComprobante("RESPONSABLE_INSCRIPTO", [linea(121000, "21"), linea(11050, "10.5")]);
  assert.equal(r.ivaDetalle.length, 2);
  assert.equal(r.total, 132050);
  assert.equal(r.neto + r.iva, r.total);
  const baseSum = r.ivaDetalle.reduce((a, i) => a + i.baseImp, 0);
  const ivaSum = r.ivaDetalle.reduce((a, i) => a + i.importe, 0);
  assert.ok(Math.abs(baseSum - r.neto) < 0.005);
  assert.ok(Math.abs(ivaSum - r.iva) < 0.005);
});

test("multi-línea misma alícuota agrega en UN ítem del desglose", () => {
  const r = calcularComprobante("RESPONSABLE_INSCRIPTO", [linea(1000, "21"), linea(2000, "21"), linea(3000, "21")]);
  assert.equal(r.ivaDetalle.length, 1);
  assert.equal(r.total, 6000);
});

// ------------------------------------------------------------------- redondeo
test("redondeo: 100 al 21% incluido -> 82.64 + 17.36 = 100 exacto", () => {
  const r = calcularComprobante("RESPONSABLE_INSCRIPTO", [linea(100, "21")]);
  assert.equal(r.neto, 82.64);
  assert.equal(r.iva, 17.36);
  assert.equal(r.neto + r.iva, 100);
});

test("redondeo: muchas líneas chicas mantienen total exacto", () => {
  const lineas = Array.from({ length: 17 }, () => linea(33.33, "21"));
  const r = calcularComprobante("RESPONSABLE_INSCRIPTO", lineas);
  assert.equal(Math.round(r.total * 100), Math.round(33.33 * 17 * 100));
  assert.equal(Math.round((r.neto + r.iva) * 100), Math.round(r.total * 100));
});

// -------------------------------------------------------- exento / no gravado
test("exento y no gravado no llevan IVA y suman al total", () => {
  const r = calcularComprobante("RESPONSABLE_INSCRIPTO", [
    linea(121000, "21"),
    linea(5000, "21", { concepto: "EXENTO" }),
    linea(3000, "21", { concepto: "NO_GRAVADO" }),
  ]);
  assert.equal(r.neto, 100000);
  assert.equal(r.iva, 21000);
  assert.equal(r.exento, 5000);
  assert.equal(r.noGravado, 3000);
  assert.equal(r.total, 129000);
  assert.equal(r.ivaDetalle.length, 1); // IVA solo sobre lo gravado
});

// -------------------------------------------------------------- Factura C
test("Monotributo -> Factura C sin IVA discriminado", () => {
  const r = calcularComprobante("MONOTRIBUTO", [linea(54450, "21")]);
  assert.equal(r.tipo, "FACTURA_C");
  assert.equal(r.iva, 0);
  assert.equal(r.exento, 0);
  assert.equal(r.noGravado, 0);
  assert.equal(r.neto, 54450);
  assert.equal(r.ivaDetalle.length, 0);
});

// ----------------------------------------------------- validación fail-closed
test("fail-closed: líneas vacías lanza", () => {
  assert.throws(() => calcularComprobante("RESPONSABLE_INSCRIPTO", []));
});
test("fail-closed: importe negativo lanza", () => {
  assert.throws(() => calcularComprobante("RESPONSABLE_INSCRIPTO", [linea(-100)]));
});
test("fail-closed: importe NaN lanza", () => {
  assert.throws(() => calcularComprobante("RESPONSABLE_INSCRIPTO", [linea(NaN)]));
});
test("fail-closed: alícuota desconocida lanza", () => {
  assert.throws(() =>
    calcularComprobante("RESPONSABLE_INSCRIPTO", [linea(100, "18" as never)]),
  );
});
test("fail-closed: total 0 lanza", () => {
  assert.throws(() => calcularComprobante("RESPONSABLE_INSCRIPTO", [linea(0)]));
});

// --------------------------------------------------- auto-chequeo de invariantes
test("assertConsistente detecta un total manipulado", () => {
  const r = calcularComprobante("RESPONSABLE_INSCRIPTO", [linea(121000, "21")]);
  assert.throws(() => assertConsistente({ ...r, total: r.total + 1 }));
});
test("assertConsistente detecta un desglose que no suma", () => {
  const r = calcularComprobante("RESPONSABLE_INSCRIPTO", [linea(121000, "21")]);
  const roto = { ...r, ivaDetalle: [{ ...r.ivaDetalle[0], importe: r.ivaDetalle[0].importe + 10 }] };
  assert.throws(() => assertConsistente(roto));
});
