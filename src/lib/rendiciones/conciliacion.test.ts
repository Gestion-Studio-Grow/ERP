// Tests de la conciliación contra la precarga de IVA Simple: clave fiscal, uno a uno,
// diferencias de importe, lo no electrónico y lo que nadie rindió. node:test.

import { test } from "node:test";
import assert from "node:assert/strict";
import { conciliarConPrecarga } from "./conciliacion";
import { CUIT_FUERA, CUIT_MAESTRO, EMPRESA, comprobante } from "./rendiciones.fixture";
import type { LineaPrecarga } from "./tipos";

function linea(parcial: Partial<LineaPrecarga> = {}): LineaPrecarga {
  return {
    cuitEmisor: CUIT_MAESTRO,
    razonSocialEmisor: "Proveedor del Maestro S.A.",
    tipoComprobanteArca: 1,
    puntoVenta: 1,
    numero: 101,
    fecha: "2026-09-10",
    total: 1210000,
    ...parcial,
  };
}

const A = comprobante({ id: "A" });
const B = comprobante({ id: "B", datos: { clase: "factura_b", puntoVenta: 2, numero: 5, lineasIva: [], total: 800000 } });
const TIQUE = comprobante({ id: "TIQUE", datos: { clase: "tique_consumidor_final", lineasIva: [] } });
const SIN = comprobante({ id: "SIN", datos: { clase: "sin_comprobante", cuitEmisor: undefined, lineasIva: [] } });
const PEAJE = comprobante({ id: "PEAJE", datos: { clase: "tique_peaje", numero: 77 } });
const SIN_NUMERO = comprobante({ id: "SIN_NUMERO", datos: { numero: undefined } });
const NO_ESTA = comprobante({ id: "NO_ESTA", datos: { cuitEmisor: CUIT_FUERA, numero: 3 } });
const REPETIDO = comprobante({ id: "REPETIDO" });

const PRECARGA = [
  linea(),
  linea({ tipoComprobanteArca: 6, puntoVenta: 2, numero: 5, total: 950000 }),
  linea({ razonSocialEmisor: "Lubricentro Oeste S.A.", cuitEmisor: "30708889993", numero: 5567, total: 8630000 }),
  linea({ cuitEmisor: EMPRESA.cuit, razonSocialEmisor: "La propia empresa (una venta)", numero: 1 }),
];

test("un comprobante que no está a nombre de la empresa no es dudoso: no puede estar en la precarga", () => {
  const aConsumidorFinal = comprobante({
    id: "CF",
    datos: { clase: "factura_b", puntoVenta: 9, numero: 44, cuitReceptor: undefined, lineasIva: [], total: 500000 },
  });
  const r = conciliarConPrecarga([aConsumidorFinal], PRECARGA, EMPRESA.cuit, 2);
  assert.deepEqual(r.rendidoNoEnPrecarga, [{ comprobanteId: "CF", motivo: "no_es_de_la_empresa" }]);
});

test("cruza por CUIT, tipo, punto de venta y número", () => {
  const r = conciliarConPrecarga([A, B, TIQUE, SIN, PEAJE, SIN_NUMERO, NO_ESTA, REPETIDO], PRECARGA, EMPRESA.cuit, 2);
  assert.deepEqual(r.coinciden, [{ comprobanteId: "A", precarga: PRECARGA[0] }]);
  assert.deepEqual(r.diferenciasImporte, [{ comprobanteId: "B", precarga: PRECARGA[1], diferencia: -150000 }]);
  assert.deepEqual(r.rendidoNoEnPrecarga, [
    { comprobanteId: "TIQUE", motivo: "no_electronico" },
    { comprobanteId: "SIN", motivo: "no_electronico" },
    { comprobanteId: "PEAJE", motivo: "no_electronico" },
    { comprobanteId: "SIN_NUMERO", motivo: "no_electronico" },
    { comprobanteId: "NO_ESTA", motivo: "no_encontrado" },
    { comprobanteId: "REPETIDO", motivo: "no_encontrado" }, // la línea ya la usó A: uno a uno
  ]);
  // Lo que emitió la propia empresa no es un gasto y no queda como "no rendido".
  assert.deepEqual(r.precargaNoRendida, [PRECARGA[2]]);
});

test("una diferencia dentro de la tolerancia coincide", () => {
  const r = conciliarConPrecarga([A], [linea({ total: 1210002 })], EMPRESA.cuit, 2);
  assert.equal(r.coinciden.length, 1);
  assert.equal(conciliarConPrecarga([A], [linea({ total: 1210003 })], EMPRESA.cuit, 2).diferenciasImporte.length, 1);
});

test("los CUIT se comparan sin guiones", () => {
  const conGuiones = comprobante({ id: "G", datos: { cuitEmisor: "30-70912345-5" } });
  const r = conciliarConPrecarga([conGuiones], [linea({ cuitEmisor: "30-70912345-5" })], "30-71588430-1", 2);
  assert.deepEqual(r.coinciden.map((x) => x.comprobanteId), ["G"]);
});

test("sin comprobantes, toda la precarga (salvo lo propio) queda sin rendir", () => {
  const r = conciliarConPrecarga([], PRECARGA, EMPRESA.cuit, 2);
  assert.equal(r.precargaNoRendida.length, 3);
  assert.equal(r.coinciden.length + r.diferenciasImporte.length + r.rendidoNoEnPrecarga.length, 0);
});
