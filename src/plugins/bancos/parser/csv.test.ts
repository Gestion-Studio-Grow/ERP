// Tests del parser CSV del plugin BANCOS: separador autodetectado, comillas,
// BOM, encodings latin1/utf8 y finales de línea variados. Sin DB ni red.

import { test } from "node:test";
import assert from "node:assert/strict";
import { decodificar, detectarSeparador, parsearCsv } from "./csv";

test("autodetecta punto y coma (el clásico de los bancos AR)", () => {
  const csv = "Fecha;Concepto;Débito;Crédito;Saldo\n05/07/2026;Transferencia;;1.500,00;10.000,00";
  assert.equal(detectarSeparador(csv), ";");
  const filas = parsearCsv(csv);
  assert.equal(filas.length, 2);
  assert.deepEqual(filas[0], ["Fecha", "Concepto", "Débito", "Crédito", "Saldo"]);
  assert.deepEqual(filas[1], ["05/07/2026", "Transferencia", "", "1.500,00", "10.000,00"]);
});

test("autodetecta coma cuando el archivo es coma-separado", () => {
  const csv = 'Fecha,Concepto,Importe\n2026-07-05,"Venta local",1500.00';
  assert.equal(detectarSeparador(csv), ",");
  const filas = parsearCsv(csv);
  assert.deepEqual(filas[1], ["2026-07-05", "Venta local", "1500.00"]);
});

test("comillas: separador y comillas escapadas adentro de la celda", () => {
  const csv = 'Fecha;Concepto;Importe\n05/07/2026;"Pago ""La Esquina""; cuota 1";1.000,00';
  const filas = parsearCsv(csv);
  assert.deepEqual(filas[1], ["05/07/2026", 'Pago "La Esquina"; cuota 1', "1.000,00"]);
});

test("BOM UTF-8 no ensucia la primera celda", () => {
  const conBom = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode("Fecha;Importe\n05/07/2026;100,00")]);
  const filas = parsearCsv(conBom);
  assert.equal(filas[0][0], "Fecha");
});

test("latin1: los acentos de un export viejo de Windows sobreviven", () => {
  // "Descripción" en latin1: la ó es el byte 0xF3 (inválido como UTF-8 → cae a latin1).
  const texto = "Fecha;Descripción;Importe\n05/07/2026;Comisión;100,00";
  const bytes = new Uint8Array([...texto].map((ch) => ch.charCodeAt(0)));
  assert.equal(decodificar(bytes), texto);
  const filas = parsearCsv(bytes);
  assert.equal(filas[0][1], "Descripción");
  assert.equal(filas[1][1], "Comisión");
});

test("UTF-8 válido se decodifica como UTF-8", () => {
  const bytes = new TextEncoder().encode("Fecha;Descripción\n05/07/2026;Comisión");
  const filas = parsearCsv(bytes);
  assert.equal(filas[1][1], "Comisión");
});

test("finales de línea CRLF y CR pelado", () => {
  const filas = parsearCsv("a;b\r\nc;d\re;f");
  assert.deepEqual(filas, [
    ["a", "b"],
    ["c", "d"],
    ["e", "f"],
  ]);
});

test("salto de línea DENTRO de comillas no corta la fila", () => {
  const filas = parsearCsv('a;"linea 1\nlinea 2";c');
  assert.equal(filas.length, 1);
  assert.equal(filas[0][1], "linea 1\nlinea 2");
});

test("filas vacías decorativas se descartan", () => {
  const filas = parsearCsv("a;b\n;\n\nc;d");
  assert.deepEqual(filas, [
    ["a", "b"],
    ["c", "d"],
  ]);
});

test("archivo vacío devuelve matriz vacía", () => {
  assert.deepEqual(parsearCsv(""), []);
  assert.deepEqual(parsearCsv(new Uint8Array()), []);
});
