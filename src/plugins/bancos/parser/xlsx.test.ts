// Tests del parser XLSX del plugin BANCOS. Se arma un workbook en memoria con
// SheetJS (fechas Date, números number, filas basura arriba) y se verifica que
// la matriz cruda preserve los tipos. También el sniffing de magic bytes.

import { test } from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import { esXlsx, parsearXlsx, type Celda } from "./xlsx";

/** Arma un .xlsx en memoria a partir de una matriz (como lo exportaría un banco). */
function xlsxDesdeMatriz(matriz: Celda[][]): Uint8Array {
  const hoja = XLSX.utils.aoa_to_sheet(matriz, { cellDates: true });
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, "Movimientos");
  return new Uint8Array(XLSX.write(libro, { type: "array", bookType: "xlsx", cellDates: true }));
}

test("lee un xlsx con fechas Date y números number", () => {
  const bytes = xlsxDesdeMatriz([
    ["Banco Ejemplo S.A.", null, null, null],
    ["CBU: 0000003100000000000001", null, null, null],
    ["Fecha", "Descripción", "Débito", "Crédito"],
    [new Date(2026, 6, 5), "Transferencia recibida", null, 1500.5],
    [new Date(2026, 6, 6), "Comisión mantenimiento", 800, null],
  ]);

  const matriz = parsearXlsx(bytes);
  assert.equal(matriz.length, 5);
  assert.equal(matriz[2][0], "Fecha");
  assert.ok(matriz[3][0] instanceof Date, "la fecha debe salir como Date");
  assert.equal((matriz[3][0] as Date).getFullYear(), 2026);
  assert.equal(matriz[3][3], 1500.5);
  assert.equal(typeof matriz[4][2], "number");
});

test("filas totalmente vacías se descartan", () => {
  const bytes = xlsxDesdeMatriz([
    ["Fecha", "Importe"],
    [null, null],
    [new Date(2026, 6, 5), 100],
  ]);
  const matriz = parsearXlsx(bytes);
  assert.equal(matriz.length, 2);
});

test("esXlsx reconoce el magic ZIP de un .xlsx real", () => {
  const bytes = xlsxDesdeMatriz([["Fecha", "Importe"]]);
  assert.equal(esXlsx(bytes), true);
});

test("esXlsx reconoce el magic OLE de un .xls viejo", () => {
  const ole = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0]);
  assert.equal(esXlsx(ole), true);
});

test("esXlsx rechaza un CSV de texto plano", () => {
  const csv = new TextEncoder().encode("Fecha;Importe\n05/07/2026;100,00");
  assert.equal(esXlsx(csv), false);
});
