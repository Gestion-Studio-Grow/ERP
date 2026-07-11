// Tests del MAPEADOR — la joya del producto: detección de la fila de headers
// entre la basura, columnas por sinónimos Y por forma de datos, templates de
// bancos conocidos, confianza y normalización a MovimientoBancario.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CONFIANZA_MINIMA,
  mapearColumnas,
  normalizarMovimientos,
  StubMapeadorAsistido,
  type Celda,
} from "./mapeador";
import { buscarTemplate } from "./templates";

// Extracto estilo Galicia: 6 filas de basura arriba, headers del template,
// esquema débitos/créditos con números formato AR.
const EXTRACTO_GALICIA: Celda[][] = [
  ["Banco Galicia", "", "", "", "", ""],
  ["Resumen de cuenta", "", "", "", "", ""],
  ["Titular: COMERCIO EJEMPLO S.R.L.", "", "", "", "", ""],
  ["CBU: 0070999030000000000009", "", "", "", "", ""],
  ["Período: 01/07/2026 al 31/07/2026", "", "", "", "", ""],
  ["", "", "", "", "", ""],
  ["Fecha", "Descripción", "Origen", "Débitos", "Créditos", "Saldo"],
  ["01/07/2026", "Transferencia recibida CBU 285", "00123", "", "150.000,00", "1.150.000,00"],
  ["02/07/2026", "Comisión mantenimiento cuenta", "00124", "8.500,00", "", "1.141.500,00"],
  ["03/07/2026", "IVA 21% s/comisión", "00125", "1.785,00", "", "1.139.715,00"],
  ["04/07/2026", "SIRCREB Ingresos Brutos", "00126", "450,00", "", "1.139.265,00"],
  ["05/07/2026", "Transferencia recibida CBU 007", "00127", "", "89.999,50", "1.229.264,50"],
];

test("template Galicia: headers exactos dan confianza 1", () => {
  const mapeo = mapearColumnas(EXTRACTO_GALICIA);
  assert.ok(mapeo, "debe mapear");
  assert.equal(mapeo.templateId, "banco-galicia");
  assert.equal(mapeo.confianza, 1);
  assert.equal(mapeo.requiereConfirmacion, false);
  assert.equal(mapeo.filaHeaders, 6);
  assert.equal(mapeo.esquemaImporte, "debito-credito");
  assert.equal(mapeo.columnas.fecha, 0);
  assert.equal(mapeo.columnas.debito, 3);
  assert.equal(mapeo.columnas.credito, 4);
  assert.equal(mapeo.columnas.saldo, 5);
});

test("heurística por sinónimos: headers que no matchean template igual mapean alto", () => {
  const matriz: Celda[][] = [
    ["Detalle de movimientos de la cuenta", "", "", ""],
    ["F. Valor", "Detalle", "Importe ($)", "Saldo ($)"],
    ["01/07/2026", "Transferencia recibida", "150.000,00", "1.150.000,00"],
    ["02/07/2026", "Pago proveedor", "-98.000,00", "1.052.000,00"],
    ["03/07/2026", "Acreditación ventas", "45.500,00", "1.097.500,00"],
  ];
  const mapeo = mapearColumnas(matriz);
  assert.ok(mapeo);
  assert.equal(mapeo.templateId, undefined);
  assert.equal(mapeo.filaHeaders, 1);
  assert.equal(mapeo.esquemaImporte, "importe-unico");
  assert.equal(mapeo.columnas.importe, 2);
  assert.equal(mapeo.columnas.saldo, 3);
  assert.ok(mapeo.confianza >= CONFIANZA_MINIMA, `confianza ${mapeo.confianza} debe ser alta`);
  assert.equal(mapeo.requiereConfirmacion, false);
});

test("sin headers reconocibles: la forma de los datos manda y pide confirmación", () => {
  // Headers crípticos (siglas internas del banco) → solo la forma decide.
  const matriz: Celda[][] = [
    ["C1", "C2", "C3"],
    ["01/07/2026", "TRF REC 285", "150.000,00"],
    ["02/07/2026", "PAGO SERV", "-8.500,00"],
    ["03/07/2026", "ACRED VTAS", "45.500,00"],
    ["04/07/2026", "TRF ENV", "-12.000,00"],
  ];
  const mapeo = mapearColumnas(matriz);
  assert.ok(mapeo, "con fecha+importe+texto detectables debe haber mejor esfuerzo");
  assert.equal(mapeo.esquemaImporte, "importe-unico");
  assert.equal(mapeo.columnas.fecha, 0);
  assert.equal(mapeo.columnas.importe, 2);
  assert.equal(mapeo.columnas.descripcion, 1);
  assert.ok(mapeo.confianza < CONFIANZA_MINIMA, `confianza ${mapeo.confianza} debe ser baja`);
  assert.equal(mapeo.requiereConfirmacion, true);
});

test("matriz vacía o sin tabla devuelve null", () => {
  assert.equal(mapearColumnas([]), null);
  assert.equal(
    mapearColumnas([
      ["Estimado cliente", ""],
      ["Su resumen está listo", ""],
    ]),
    null,
  );
});

test("normalizarMovimientos: débito/crédito a monto con signo + hash idempotente", () => {
  const mapeo = mapearColumnas(EXTRACTO_GALICIA)!;
  const movs = normalizarMovimientos(EXTRACTO_GALICIA, mapeo);
  assert.equal(movs.length, 5);

  const [ingreso, comision] = movs;
  assert.equal(ingreso.fecha, "20260701");
  assert.equal(ingreso.monto, 150000);
  assert.equal(ingreso.origen, "banco");
  assert.equal(ingreso.referencia, "00123");
  assert.match(ingreso.id, /^[0-9a-f]{64}$/);

  assert.equal(comision.monto, -8500); // débito → signo negativo
  assert.equal(comision.descripcion, "Comisión mantenimiento cuenta");

  // Idempotencia: normalizar dos veces produce los mismos ids.
  const otraVez = normalizarMovimientos(EXTRACTO_GALICIA, mapeo);
  assert.deepEqual(
    movs.map((m) => m.id),
    otraVez.map((m) => m.id),
  );
});

test("normalizarMovimientos saltea filas de ruido (subtotales, leyendas)", () => {
  const matriz: Celda[][] = [
    ["Fecha", "Descripción", "Débito", "Crédito"],
    ["01/07/2026", "Venta", "", "1.000,00"],
    ["TOTAL", "", "", "1.000,00"], // sin fecha → ruido
    ["", "Los saldos expresados en pesos", "", ""], // sin fecha ni importe → ruido
  ];
  const mapeo = mapearColumnas(matriz)!;
  const movs = normalizarMovimientos(matriz, mapeo);
  assert.equal(movs.length, 1);
});

test("template Mercado Pago produce movimientos con origen mercadopago", () => {
  const matriz: Celda[][] = [
    ["Fecha", "Descripción", "ID de la operación", "Contraparte", "Monto", "Saldo"],
    ["05/07/2026", "Cobro por venta", "MP-001", "Juan Pérez", "12.500,00", "50.000,00"],
  ];
  const mapeo = mapearColumnas(matriz);
  assert.ok(mapeo);
  assert.equal(mapeo.templateId, "mercadopago");
  assert.equal(mapeo.origen, "mercadopago");
  const movs = normalizarMovimientos(matriz, mapeo);
  assert.equal(movs[0].origen, "mercadopago");
  assert.equal(movs[0].contraparte, "Juan Pérez");
});

test("celdas XLSX tipadas (Date y number) normalizan igual que las string", () => {
  const matriz: Celda[][] = [
    ["Fecha", "Concepto", "Débito", "Crédito", "Saldo"],
    [new Date(2026, 6, 1), "Transferencia recibida", null, 150000, 1150000],
    [new Date(2026, 6, 2), "Comisión", 8500, null, 1141500],
  ];
  const mapeo = mapearColumnas(matriz)!;
  const movs = normalizarMovimientos(matriz, mapeo);
  assert.equal(movs.length, 2);
  assert.equal(movs[0].fecha, "20260701");
  assert.equal(movs[0].monto, 150000);
  assert.equal(movs[1].monto, -8500);
});

test("buscarTemplate exige igualdad exacta (falso negativo > falso positivo)", () => {
  assert.ok(buscarTemplate(["fecha", "descripcion", "origen", "debitos", "creditos", "saldo"]));
  assert.equal(buscarTemplate(["fecha", "descripcion", "origen", "debitos", "creditos"]), null);
  assert.equal(buscarTemplate(["fecha", "descripcion", "extra", "debitos", "creditos", "saldo"]), null);
});

test("el stub del mapeador asistido devuelve el heurístico tal cual", async () => {
  const stub = new StubMapeadorAsistido();
  const mapeo = mapearColumnas(EXTRACTO_GALICIA);
  assert.equal(await stub.proponerMapeo(EXTRACTO_GALICIA, mapeo), mapeo);
  assert.equal(await stub.proponerMapeo([], null), null);
});
