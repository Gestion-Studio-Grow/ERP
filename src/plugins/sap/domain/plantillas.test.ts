// Tests de las planillas de SAP: encabezados, una fila por posición, bloques de asiento,
// instrucción de compensación, altas agrupadas y textos seguros. node:test.

import { test } from "node:test";
import assert from "node:assert/strict";
import type { AsientoSap, CancelacionFacturaSap, FacturaProveedorSap } from "../core-contract";
import {
  ENCABEZADO_ALTAS,
  ENCABEZADO_ASIENTOS,
  ENCABEZADO_CANCELACIONES,
  ENCABEZADO_FACTURAS,
  filasAltas,
  filasAsientos,
  filasCancelaciones,
  filasFacturas,
  textoSeguro,
} from "./plantillas";

const FACTURA: FacturaProveedorSap = {
  idFactura: "F-C-1",
  comprobanteId: "C-1",
  sociedad: "DEMO",
  claseDocumento: "KR",
  fechaDocumento: "2026-09-08",
  fechaContabilizacion: "2026-09-24",
  emisor: "10000102",
  referencia: "0005A00002298",
  lugarComercial: "0001",
  importeBruto: 7380000,
  moneda: "ARS",
  asignacion: "1150-2609-EF",
  posiciones: [
    {
      cuentaMayor: "52101004",
      importe: 6000000,
      indicadorIva: "V1",
      centroCosto: "OPS-03",
      numeroPersonal: "00001150",
      asignacion: "1150-2609-EF",
      texto: "Neto 21%",
    },
    {
      cuentaMayor: "11406002",
      importe: 120000,
      indicadorIva: "",
      centroCosto: "OPS-03",
      numeroPersonal: "00001150",
      asignacion: "1150-2609-EF",
      texto: "Percepción de IIBB BA",
    },
  ],
};

const ASIENTO: AsientoSap = {
  idAsiento: "A-R-1150-2609",
  rendicionId: "R-1150-2609",
  sociedad: "DEMO",
  claseDocumento: "SA",
  fechaDocumento: "2026-09-24",
  fechaContabilizacion: "2026-09-24",
  moneda: "ARS",
  referencia: "R-1150-2609",
  texto: "R-1150-2609 Martín Sosa con un nombre largo",
  posiciones: [
    {
      cuentaMayor: "52101004",
      debe: 780000,
      haber: 0,
      indicadorIva: "V0",
      centroCosto: "OPS-03",
      asignacion: "1150-2609-EF",
      texto: "=Kiosco Las Tres Marías Factura C 0001-00000321 con texto de más",
    },
    { cuentaMayor: "11409001", debe: 0, haber: 780000, asignacion: "1150-2609-EF", texto: "R-1150-2609 efectivo del anticipo" },
  ],
};

test("facturas: encabezado técnico y una fila por posición, repitiendo la cabecera", () => {
  const filas = filasFacturas([FACTURA]);
  assert.deepEqual(filas[0], [...ENCABEZADO_FACTURAS]);
  assert.equal(filas[0].length, 18);
  assert.equal(filas.length, 3);
  assert.deepEqual(filas[1], [
    "F-C-1",
    "DEMO",
    "KR",
    "2026-09-08",
    "2026-09-24",
    "10000102",
    "0005A00002298",
    "0001",
    "73800.00",
    "ARS",
    "1150-2609-EF",
    "52101004",
    "60000.00",
    "V1",
    "OPS-03",
    "00001150",
    "1150-2609-EF",
    "Neto 21%",
  ]);
  assert.deepEqual(filas[2].slice(0, 11), filas[1].slice(0, 11));
  assert.deepEqual(filas[2].slice(11), ["11406002", "1200.00", "", "OPS-03", "00001150", "1150-2609-EF", "Percepción de IIBB BA"]);
});

test("asientos: una fila de cabecera y una por posición; debe y haber en su columna", () => {
  const filas = filasAsientos([ASIENTO]);
  assert.deepEqual(filas[0], [...ENCABEZADO_ASIENTOS]);
  assert.equal(filas.length, 4);
  assert.deepEqual(filas[1], [
    "Cabecera",
    "DEMO",
    "SA",
    "2026-09-24",
    "2026-09-24",
    "ARS",
    "R-1150-2609",
    "R-1150-2609 Martín Sosa c", // 25 caracteres [A VALIDAR]
    "",
    "",
    "",
    "",
    "",
    "",
    "",
  ]);
  assert.deepEqual(filas[2], [
    "Part.ind.",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "52101004",
    "Kiosco Las Tres Marías Factura C 0001-00000321 con", // sin el "=" y a 50 caracteres
    "7800.00",
    "",
    "V0",
    "OPS-03",
    "1150-2609-EF",
  ]);
  assert.deepEqual(filas[3].slice(8), ["11409001", "R-1150-2609 efectivo del anticipo", "", "7800.00", "", "", "1150-2609-EF"]);
  for (const fila of filas) assert.equal(fila.length, ENCABEZADO_ASIENTOS.length);
});

test("cancelaciones: la instrucción para Tesorería, con cuenta y asignación", () => {
  const c: CancelacionFacturaSap = {
    idFactura: "F-C-1",
    comprobanteId: "C-1",
    emisor: "10000102",
    referencia: "0005A00002298",
    importe: 7380000,
    cuentaContrapartida: "11409001",
    asignacion: "1150-2609-EF",
  };
  const filas = filasCancelaciones([c]);
  assert.deepEqual(filas[0], [...ENCABEZADO_CANCELACIONES]);
  assert.deepEqual(filas[1], [
    "F-C-1",
    "C-1",
    "10000102",
    "0005A00002298",
    "73800.00",
    "11409001",
    "1150-2609-EF",
    "Compensar la factura 0005A00002298 del proveedor 10000102 por 73800.00 contra la cuenta 11409001, asignación 1150-2609-EF",
  ]);
});

test("altas: un proveedor por fila, con todos los comprobantes que lo piden", () => {
  const filas = filasAltas([
    { cuit: "30698882227", razonSocial: "Ferretería Industrial Lanús S.A.", comprobanteId: "C-1" },
    { cuit: "30716622041", razonSocial: "Gomería El Puente S.R.L.", comprobanteId: "C-2" },
    { cuit: "30698882227", razonSocial: "Ferretería Industrial Lanús S.A.", comprobanteId: "C-3" },
  ]);
  assert.deepEqual(filas, [
    [...ENCABEZADO_ALTAS],
    ["30698882227", "Ferretería Industrial Lanús S.A.", "C-1 C-3"],
    ["30716622041", "Gomería El Puente S.R.L.", "C-2"],
  ]);
});

test("textoSeguro: saca los caracteres de fórmula del principio y corta al largo", () => {
  assert.equal(textoSeguro("=HYPERLINK(\"x\")"), 'HYPERLINK("x")');
  assert.equal(textoSeguro("+-@ \tcosa"), "cosa");
  assert.equal(textoSeguro("Estación Ruta 5"), "Estación Ruta 5");
  assert.equal(textoSeguro("abcdef", 3), "abc");
  assert.equal(textoSeguro("Neto 21% - IVA"), "Neto 21% - IVA"); // en el medio no se toca
});

test("sin documentos, cada planilla es sólo su encabezado", () => {
  assert.deepEqual(filasFacturas([]), [[...ENCABEZADO_FACTURAS]]);
  assert.deepEqual(filasAsientos([]), [[...ENCABEZADO_ASIENTOS]]);
  assert.deepEqual(filasCancelaciones([]), [[...ENCABEZADO_CANCELACIONES]]);
  assert.deepEqual(filasAltas([]), [[...ENCABEZADO_ALTAS]]);
});
