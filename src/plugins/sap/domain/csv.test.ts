// Tests del CSV para SAP: BOM, separador, comillas y formato de importes. Dominio puro. node:test.

import { test } from "node:test";
import assert from "node:assert/strict";
import { BOM, aCsv, importeCsv } from "./csv";

test("arranca con BOM UTF-8 y separa renglones con CRLF, sin salto final", () => {
  const csv = aCsv([
    ["A", "B"],
    ["1", "2"],
  ]);
  assert.equal(csv, `${BOM}A;B\r\n1;2`);
  assert.equal(csv.charCodeAt(0), 0xfeff);
  assert.equal(aCsv([]), BOM);
});

test("comillas sólo cuando hacen falta; la comilla se duplica", () => {
  assert.equal(aCsv([["sin nada", "con;punto y coma", 'con "comillas"', "con\nsalto", "con\rretorno", "coma,sola"]]),
    `${BOM}sin nada;"con;punto y coma";"con ""comillas""";"con\nsalto";"con\rretorno";coma,sola`);
});

test("con otro separador, se comilla ese separador", () => {
  assert.equal(aCsv([["a,b", "c;d"]], ","), `${BOM}"a,b",c;d`);
});

test("las tildes pasan tal cual (el BOM le avisa a Excel que es UTF-8)", () => {
  assert.equal(aCsv([["Estación Ñandú"]]), `${BOM}Estación Ñandú`);
});

test("importes: punto decimal, dos decimales, sin separador de miles", () => {
  assert.equal(importeCsv(123456), "1234.56");
  assert.equal(importeCsv(100000000), "1000000.00");
  assert.equal(importeCsv(5), "0.05");
  assert.equal(importeCsv(0), "0.00");
  assert.equal(importeCsv(-500), "-5.00");
  assert.equal(importeCsv(21200000), "212000.00");
});
