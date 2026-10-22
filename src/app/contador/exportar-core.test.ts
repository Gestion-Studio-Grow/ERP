// CSV del mes de toda la cartera (exportar-core.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import type { RenglonComprobante } from "@/lib/facturacion/lista-core";
import { CABECERA_CARTERA, lineasCsvCartera, nombreArchivoCartera } from "./exportar-core";

function renglon(p: Partial<RenglonComprobante> = {}): RenglonComprobante {
  return {
    id: "i1",
    fecha: "20261005",
    tipoComprobante: 11,
    puntoVenta: 3,
    numero: 12,
    status: "AUTHORIZED",
    total: 15000.5,
    docTipo: 99,
    docNro: "0",
    receptor: null,
    cae: "75000000000001",
    rechazoMotivo: null,
    ...p,
  };
}

test("lineasCsvCartera: cabecera con cliente y CUIT, una fila por comprobante, nota de crédito en negativo", () => {
  const lineas = lineasCsvCartera(
    [
      { alias: "Kiosco de Marta", cuit: "27222222228", renglones: [renglon(), renglon({ id: "i2", tipoComprobante: 13, total: -500 })], recortado: false },
      { alias: "Almacén", cuit: null, renglones: [], recortado: false },
    ],
    20000,
  );
  assert.equal(lineas.length, 3);
  assert.equal(lineas[0].split(";").length, CABECERA_CARTERA.length);
  assert.match(lineas[1], /^Kiosco de Marta;27222222228;05\/10\/2026;Factura C;3;12;Consumidor final;;Autorizado;75000000000001;15000,50;$/);
  assert.match(lineas[2], /Nota de crédito C/);
  assert.match(lineas[2], /;-500,00;/);
});

test("lineasCsvCartera: lo que no se pudo leer o quedó recortado se avisa arriba, con el nombre del cliente", () => {
  const lineas = lineasCsvCartera(
    [
      { alias: "Kiosco", cuit: "27222222228", renglones: null, recortado: false },
      { alias: "Grande", cuit: "27222222228", renglones: [renglon()], recortado: true },
    ],
    20000,
  );
  assert.match(lineas[0], /no se pudieron leer los comprobantes de Kiosco/);
  assert.match(lineas[1], /Grande tiene más de 20000/);
  assert.match(lineas[2], /^Cliente;/);
});

test("lineasCsvCartera: un alias que parece fórmula no se ejecuta en Excel", () => {
  const [, fila] = lineasCsvCartera([{ alias: "=HYPERLINK(1)", cuit: null, renglones: [renglon()], recortado: false }], 10);
  assert.ok(!fila.startsWith("="));
});

test("nombreArchivoCartera", () => {
  assert.equal(nombreArchivoCartera("2026-10"), "comprobantes-cartera-2026-10.csv");
});
