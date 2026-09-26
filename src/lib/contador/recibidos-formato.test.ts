// Lectura de «Mis Comprobantes Recibidos» (ARCA) con archivos de ejemplo anonimizados
// (fixtures/: CUIT de prueba 3070000000x, razones sociales inventadas), en los dos diseños que
// entrega ARCA y en Excel.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as XLSX from "xlsx";
import { parsearCsv } from "@/plugins/bancos/parser/csv";
import { parsearXlsx } from "@/plugins/bancos/parser/xlsx";
import {
  claveRecibido,
  esNotaDeCreditoRecibida,
  leerRecibidos,
  resumirRecibidos,
  rotuloRecibido,
  type ComprobanteRecibido,
} from "./recibidos-formato";

const fixture = (nombre: string) => parsearCsv(new Uint8Array(readFileSync(join(__dirname, "fixtures", nombre))));

function leerOk(matriz: Parameters<typeof leerRecibidos>[0]) {
  const r = leerRecibidos(matriz);
  assert.equal(r.ok, true, JSON.stringify(r));
  return r as Extract<typeof r, { ok: true }>;
}

const buscar = (lista: ComprobanteRecibido[], tipo: number, numero: number) => {
  const c = lista.find((x) => x.tipo === tipo && x.numero === numero);
  assert.ok(c, `falta el ${tipo}-${numero}`);
  return c;
};

test("diseño por alícuota: factura A al 21% entra con su desglose y sin marcas", () => {
  const r = leerOk(fixture("recibidos-por-alicuota.csv"));
  assert.equal(r.diseno, "por-alicuota");
  const a = buscar(r.comprobantes, 1, 1234);
  assert.equal(a.fecha, "20260803");
  assert.equal(a.cuitEmisor, "30700000008");
  assert.equal(a.puntoVenta, 3);
  assert.deepEqual(a.desglose, [{ alicuotaId: 5, base: 1000, importe: 210 }]);
  assert.equal(a.iva, 210);
  assert.equal(a.total, 1210);
  assert.equal(a.aRevisar, null);
});

test("factura A con dos alícuotas y percepción: desglose 10,5% y 21%, otros tributos aparte", () => {
  const r = leerOk(fixture("recibidos-por-alicuota.csv"));
  const a = buscar(r.comprobantes, 1, 1240);
  assert.deepEqual(a.desglose, [
    { alicuotaId: 4, base: 2000, importe: 210 },
    { alicuotaId: 5, base: 1000, importe: 210 },
  ]);
  assert.equal(a.neto, 3000);
  assert.equal(a.otrosTributos, 90);
  assert.equal(a.aRevisar, null);
});

test("factura B y factura C recibidas no dan crédito fiscal: IVA cero, sin marca", () => {
  const r = leerOk(fixture("recibidos-por-alicuota.csv"));
  const b = buscar(r.comprobantes, 6, 88);
  const c = buscar(r.comprobantes, 11, 45);
  for (const x of [b, c]) {
    assert.equal(x.iva, 0);
    assert.deepEqual(x.desglose, []);
    assert.equal(x.aRevisar, null);
  }
  assert.equal(b.total, 1210);
  assert.equal(c.total, 5000);
});

test("nota de crédito A entra y RESTA en el resumen", () => {
  const r = leerOk(fixture("recibidos-por-alicuota.csv"));
  const nc = buscar(r.comprobantes, 3, 77);
  assert.equal(nc.total, 121);
  const resumen = resumirRecibidos([buscar(r.comprobantes, 1, 1234), nc]);
  assert.equal(resumen.notasDeCredito, 1);
  assert.equal(resumen.neto, 900);
  assert.equal(resumen.iva, 189);
  assert.equal(resumen.total, 1089);
  assert.deepEqual(resumen.ivaPorAlicuota, [{ alicuotaId: 5, etiqueta: "21%", base: 900, importe: 189 }]);
});

test("moneda extranjera: se pasa a pesos con el tipo de cambio del archivo, redondeado al centavo", () => {
  const r = leerOk(fixture("recibidos-por-alicuota.csv"));
  const d = buscar(r.comprobantes, 1, 500);
  assert.equal(d.moneda, "DOL");
  assert.equal(d.cotizacion, 1000.5);
  assert.equal(d.neto, 100050);
  assert.equal(d.iva, 21010.5);
  assert.equal(d.total, 121060.5);
  assert.deepEqual(d.desglose, [{ alicuotaId: 5, base: 100050, importe: 21010.5 }]);
});

test("moneda extranjera sin tipo de cambio se rechaza con el motivo", () => {
  const m = fixture("recibidos-por-alicuota.csv");
  const fila = [...m[6]];
  fila[9] = "";
  const r = leerOk([m[0], fila]);
  assert.equal(r.comprobantes.length, 0);
  assert.match(r.rechazos[0].motivo, /moneda extranjera \(DOL\).*tipo de cambio/);
});

test("duplicado dentro del archivo: el segundo se rechaza, el primero queda", () => {
  const r = leerOk(fixture("recibidos-por-alicuota.csv"));
  assert.equal(r.comprobantes.filter((c) => c.tipo === 1 && c.numero === 1234).length, 1);
  const rep = r.rechazos.find((x) => /repetido en el archivo/.test(x.motivo));
  assert.ok(rep);
  assert.equal(rep.fila, 8);
  assert.equal(rep.comprobante, "Factura A 00003-00001234");
});

test("IVA que no cierra con su alícuota: entra marcado «a revisar» y sin desglose inventado", () => {
  const r = leerOk(fixture("recibidos-por-alicuota.csv"));
  const x = buscar(r.comprobantes, 1, 900);
  assert.match(x.aRevisar ?? "", /21%.*no cierra/);
  assert.equal(x.desglose, null);
  const resumen = resumirRecibidos([x]);
  assert.equal(resumen.aRevisar, 1);
  assert.equal(resumen.ivaSinAlicuota, 150);
  assert.deepEqual(resumen.ivaPorAlicuota, []);
});

test("CUIT inválido se rechaza con el motivo; el Tique factura A (81) entra y da crédito fiscal", () => {
  const r = leerOk(fixture("recibidos-por-alicuota.csv"));
  assert.ok(r.rechazos.some((x) => x.fila === 10 && /CUIT del emisor no es válido/.test(x.motivo)));
  assert.ok(!r.rechazos.some((x) => x.fila === 11), "el tique factura A no se rechaza");
  const tique = buscar(r.comprobantes, 81, 15);
  assert.equal(tique.iva, 21);
  assert.deepEqual(tique.desglose, [{ alicuotaId: 5, base: 100, importe: 21 }]);
  assert.equal(rotuloRecibido(tique), "Tique factura A 00001-00000015");
  assert.equal(r.comprobantes.length, 8);
  assert.equal(r.rechazos.length, 2);
});

// Diseño clásico, una fila por tipo: lo que llega en el mes de un cliente con comercio,
// servicios públicos y compras en súper con tique.
const TITULOS_CLASICOS = () => fixture("recibidos-clasico.csv")[0];
const filaClasica = (tipo: string, numero: number, neto: string, iva: string, total: string) =>
  ["10/08/2026", tipo, "2", String(numero), String(numero), "76000000000099", "80", "30700000008", "DISTRIBUIDORA DEL SUR SA", "1", "$", neto, "0", "0", iva, total];

test("letra A y M dan crédito fiscal sea factura, recibo, liquidación o tique; el tique nota de crédito resta", () => {
  const r = leerOk([
    TITULOS_CLASICOS(),
    filaClasica("4", 1, "1000,00", "210,00", "1210,00"), // Recibo A
    filaClasica("5 - Nota de Venta al contado A", 2, "1000,00", "210,00", "1210,00"),
    filaClasica("63", 3, "1000,00", "210,00", "1210,00"), // Liquidación A
    filaClasica("17", 4, "1000,00", "270,00", "1270,00"), // Liquidación de servicios públicos clase A
    filaClasica("Tique Factura A", 5, "1000,00", "210,00", "1210,00"),
    filaClasica("118", 6, "1000,00", "210,00", "1210,00"), // Tique factura M
    filaClasica("112", 7, "100,00", "21,00", "121,00"), // Tique nota de crédito A
    filaClasica("82", 8, "0", "0", "1210,00"), // Tique factura B: entra, sin crédito
  ]);
  assert.equal(r.rechazos.length, 0, JSON.stringify(r.rechazos));
  assert.deepEqual(
    r.comprobantes.map((c) => [c.tipo, rotuloRecibido(c).replace(/ \d{5}-\d{8}$/, ""), c.iva]),
    [
      [4, "Recibo A", 210],
      [5, "Nota de venta al contado A", 210],
      [63, "Liquidación A", 210],
      [17, "Liquidación de servicios públicos clase A", 270],
      [81, "Tique factura A", 210],
      [118, "Tique factura M", 210],
      [112, "Tique nota de crédito A", 21],
      [82, "Tique factura B", 0],
    ],
  );
  assert.equal(esNotaDeCreditoRecibida(112), true);
  assert.equal(esNotaDeCreditoRecibida(119), true);
  const resumen = resumirRecibidos(r.comprobantes);
  assert.equal(resumen.notasDeCredito, 1);
  assert.equal(resumen.sinCreditoFiscal, 1);
  // 210 × 5 + 270 − 21 (el tique nota de crédito resta).
  assert.equal(resumen.iva, 1299);
});

test("un tipo que no está en la tabla se rechaza sin decir que no va a compras ni mandar a una carga que no existe", () => {
  const r = leerOk([TITULOS_CLASICOS(), filaClasica("99", 1, "1000,00", "210,00", "1210,00")]);
  assert.equal(r.comprobantes.length, 0);
  assert.equal(r.rechazos.length, 1);
  const motivo = r.rechazos[0].motivo;
  assert.match(motivo, /^Comprobante tipo 99: /);
  assert.doesNotMatch(motivo, /no va al libro|cargalo a mano/);
  assert.match(motivo, /Libro IVA Digital/);
  assert.match(motivo, /Soporte GSG/);
});

test("diseño clásico: la alícuota se deduce sólo si una oficial cierra exacto", () => {
  const r = leerOk(fixture("recibidos-clasico.csv"));
  assert.equal(r.diseno, "clasico");
  assert.deepEqual(buscar(r.comprobantes, 1, 1100).desglose, [{ alicuotaId: 5, base: 1000, importe: 210 }]);
  // 420 sobre 3000 es 14%: dos alícuotas mezcladas, no se adivina.
  const mezcla = buscar(r.comprobantes, 1, 1101);
  assert.equal(mezcla.desglose, null);
  assert.match(mezcla.aRevisar ?? "", /varias/);
  // 10,5% con una percepción de 30 que el diseño clásico no separa: va a otros tributos.
  const conPercepcion = buscar(r.comprobantes, 1, 800);
  assert.deepEqual(conPercepcion.desglose, [{ alicuotaId: 4, base: 1000, importe: 105 }]);
  assert.equal(conPercepcion.otrosTributos, 30);
  assert.equal(conPercepcion.aRevisar, null);
  // Neto gravado con IVA cero en una A: ¿0% o exento? a revisar.
  assert.match(buscar(r.comprobantes, 1, 1102).aRevisar ?? "", /IVA en cero/);
  // «3 - Nota de Crédito A» se reconoce por el código.
  assert.equal(buscar(r.comprobantes, 3, 70).total, 121);
  assert.equal(buscar(r.comprobantes, 6, 80).iva, 0);
  assert.equal(r.rechazos.length, 0);
});

// En este entorno `xlsx` es un stub (el CDN de SheetJS está bloqueado): el test se saltea CON
// AVISO y se corre donde está la librería de verdad. La lectura de celdas tipadas de Excel
// (números y fechas) se prueba igual en el test siguiente, sin SheetJS.
const SIN_SHEETJS = String((XLSX as { version?: string }).version ?? "").endsWith("-stub");

test("Excel con el renglón de título de ARCA: encuentra los títulos y el CUIT del archivo", { skip: SIN_SHEETJS && "xlsx es un stub en este entorno" }, () => {
  const csv = fixture("recibidos-por-alicuota.csv");
  const hoja = XLSX.utils.aoa_to_sheet([["Mis Comprobantes Recibidos - CUIT 30-70000006-7"], ...csv]);
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, "Recibidos");
  const bytes = new Uint8Array(XLSX.write(libro, { type: "array", bookType: "xlsx" }) as ArrayBuffer);
  const r = leerOk(parsearXlsx(bytes));
  assert.equal(r.cuitDelArchivo, "30700000067");
  assert.equal(r.comprobantes.length, 8);
  assert.equal(buscar(r.comprobantes, 1, 1234).fila, 3);
});

test("Excel con números y fechas de verdad (no texto) se lee igual", () => {
  const titulos = fixture("recibidos-clasico.csv")[0];
  const fila = [new Date(2026, 6, 3), 1, 3, 1100, 1100, "76000000000011", 80, 30700000008, "DISTRIBUIDORA DEL SUR SA", 1, "$", 1000, 0, 0, 210, 1210];
  const r = leerOk([titulos, fila]);
  const c = r.comprobantes[0];
  assert.equal(c.fecha, "20260703");
  assert.equal(c.cuitEmisor, "30700000008");
  assert.equal(c.total, 1210);
});

test("un archivo que no es de ARCA se rechaza entero, sin leer filas", () => {
  const r = leerRecibidos([["Fecha", "Concepto", "Importe"], ["01/08/2026", "Luz", "100"]]);
  assert.equal(r.ok, false);
});

test("la clave es CUIT del emisor, tipo, punto de venta y número", () => {
  assert.equal(claveRecibido({ cuitEmisor: "30700000008", tipo: 1, puntoVenta: 3, numero: 1234 }), "30700000008|1|3|1234");
});

test("listado exportable: IVA por alícuota en columnas, la nota de crédito en negativo, a salvo de fórmulas", async () => {
  const { csvComprasConFactura } = await import("./recibidos-export");
  const r = leerOk(fixture("recibidos-por-alicuota.csv"));
  const filas = [buscar(r.comprobantes, 1, 1240), buscar(r.comprobantes, 3, 77), buscar(r.comprobantes, 1, 900)];
  filas[0] = { ...filas[0], emisor: "=HIPERVINCULO(\"x\")" };
  const csv = csvComprasConFactura(filas);
  const [titulos, a, nc, revisar] = csv.replace(/^﻿/, "").trim().split("\r\n").map((l) => l.split(";"));
  const col = (n: string) => titulos.indexOf(n);
  assert.equal(a[col("Neto 10,5%")], "2000,00");
  assert.equal(a[col("IVA 21%")], "210,00");
  assert.equal(a[col("Otros tributos")], "90,00");
  assert.ok(!a[col("Emisor")].replace(/^"/, "").startsWith("="), "no queda una fórmula en la planilla");
  assert.equal(nc[col("Comprobante")], "Nota de crédito A");
  assert.equal(nc[col("Total")], "-121,00");
  assert.equal(nc[col("IVA 21%")], "-21,00");
  assert.equal(revisar[col("IVA sin alícuota (a revisar)")], "150,00");
  assert.match(revisar.slice(col("A revisar")).join(";"), /no cierra/);
  assert.equal(a[col("Fecha")], "05/08/2026");
});
