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

test("fila repetida dentro del archivo: se toma una sola vez y NO cuenta como error (QA vuelta 7, bloqueante 3)", () => {
  const r = leerOk(fixture("recibidos-por-alicuota.csv"));
  assert.equal(r.comprobantes.filter((c) => c.tipo === 1 && c.numero === 1234).length, 1);
  const rep = r.repetidos.find((x) => /repetido en el archivo/.test(x.motivo));
  assert.ok(rep);
  assert.equal(rep.fila, 8);
  assert.equal(rep.comprobante, "Factura A 00003-00001234");
  assert.match(rep.motivo, /fila 2.*una sola vez/);
  assert.equal(r.rechazos.some((x) => /repetid/.test(x.motivo)), false, "la repetida no está entre los errores");
  assert.deepEqual(r.rechazos.map((x) => x.fila), [10], "el único error del archivo es la fila 10");
});

test("IVA que no cierra con su alícuota: entra marcado «a revisar» y sin desglose inventado", () => {
  const r = leerOk(fixture("recibidos-por-alicuota.csv"));
  const x = buscar(r.comprobantes, 1, 900);
  assert.match(x.aRevisar ?? "", /21%.*no cierra/);
  assert.equal(x.desglose, null);
  const resumen = resumirRecibidos([x]);
  assert.equal(resumen.aRevisar, 1);
  assert.equal(resumen.ivaARevisar, 150, "lo marcado va aparte");
  assert.equal(resumen.ivaSinAlicuota, 0, "y no se mezcla con lo que suma sin desglose");
  assert.equal(resumen.creditoFiscal, 0, "no suma al crédito");
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
  assert.equal(r.rechazos.length, 1, "sólo la fila 10: la fila repetida no es un error");
  assert.equal(r.repetidos.length, 1);
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
  // 420 sobre 3000 es 14%: ninguna alícuota sola. Puede ser 21 % + 10,5 %, pero el diseño clásico no
  // lo dice: queda «a revisar» (QA vuelta 5) y la contadora la marca revisada si está bien.
  const mezcla = buscar(r.comprobantes, 1, 1101);
  assert.equal(mezcla.desglose, null);
  assert.match(mezcla.aRevisar ?? "", /^El IVA es el 14 % del neto gravado y ninguna alícuota sola da eso\./);
  assert.equal(mezcla.iva, 420);
  // 10,5% con una percepción de 30 que el diseño clásico no separa: va a otros tributos.
  const conPercepcion = buscar(r.comprobantes, 1, 800);
  assert.deepEqual(conPercepcion.desglose, [{ alicuotaId: 4, base: 1000, importe: 105 }]);
  assert.equal(conPercepcion.otrosTributos, 30);
  assert.equal(conPercepcion.aRevisar, null);
  // Neto gravado con IVA cero en una A: la única alícuota vigente que cierra es 0 %.
  assert.deepEqual(buscar(r.comprobantes, 1, 1102).desglose, [{ alicuotaId: 3, base: 1000, importe: 0 }]);
  assert.equal(buscar(r.comprobantes, 1, 1102).aRevisar, null);
  // «3 - Nota de Crédito A» se reconoce por el código.
  assert.equal(buscar(r.comprobantes, 3, 70).total, 121);
  assert.equal(buscar(r.comprobantes, 6, 80).iva, 0);
  assert.equal(r.rechazos.length, 0);
});

test("QA vuelta 5 · diseño clásico: sin una alícuota que cierre sola, «a revisar» (no suma al crédito hasta revisarlo)", () => {
  const m = fixture("recibidos-clasico.csv");
  const i = m.findIndex((f) => String(f[3]) === "1101");
  assert.ok(i > 0, "la fila modelo está en el archivo");
  const fila = (numero: string, neto: string, iva: string, total: string) => {
    const f = [...m[i]];
    f[3] = numero;
    f[4] = numero;
    f[11] = neto;
    f[14] = iva;
    f[15] = total;
    return f;
  };
  const r = leerOk([
    ...m.slice(0, i),
    fila("2001", "1000,00", "300,00", "1300,00"), // 30 %: más que la alícuota más alta
    fila("2002", "0", "50,00", "50,00"), // IVA sin neto gravado
    fila("2003", "1000,00", "270,00", "1270,00"), // 27 % exacto
    fila("2004", "1000,00", "10,00", "1010,00"), // 1 %: 2,5 % sobre una parte y 0 % sobre el resto
    fila("2005", "2000,00", "315,00", "2315,00"), // 21 % sobre 1.000 + 10,5 % sobre 1.000
    fila("2006", "1000,00", "150,00", "1150,00"), // 15 %: la fila de (c) en el QA vuelta 5
    fila("2007", "1000,00", "210,00", "1210,00"), // 21 % exacto
  ]);
  assert.match(buscar(r.comprobantes, 1, 2001).aRevisar ?? "", /más del 27 % del neto gravado/);
  assert.match(buscar(r.comprobantes, 1, 2002).aRevisar ?? "", /no tiene neto gravado/);
  assert.deepEqual(buscar(r.comprobantes, 1, 2003).desglose, [{ alicuotaId: 6, base: 1000, importe: 270 }]);
  assert.equal(buscar(r.comprobantes, 1, 2003).aRevisar, null, "27 % exacto cierra solo");
  assert.equal(buscar(r.comprobantes, 1, 2007).aRevisar, null, "21 % exacto cierra solo");
  assert.match(buscar(r.comprobantes, 1, 2004).aRevisar ?? "", /^El IVA es el 1 % del neto gravado/);
  assert.match(buscar(r.comprobantes, 1, 2005).aRevisar ?? "", /^El IVA es el 15,75 % del neto gravado/);
  const quince = buscar(r.comprobantes, 1, 2006);
  assert.match(quince.aRevisar ?? "", /^El IVA es el 15 % del neto gravado y ninguna alícuota sola da eso\. .*marcala revisada y suma al crédito\.$/);
  assert.equal(quince.desglose, null);
  // En el resumen del mes, el 15 % y el 30 % no suman al crédito: sólo el 27 % y el 21 % exactos.
  const resumen = resumirRecibidos([2001, 2003, 2006, 2007].map((n) => buscar(r.comprobantes, 1, n)));
  assert.equal(resumen.creditoFiscal, 480);
  assert.equal(resumen.ivaARevisar, 450);
  assert.equal(resumen.ivaSinAlicuota, 0);
});

test("refutador 26/09 · revisado: la marca «a revisar» sale de las notas y queda quién y cuándo", async () => {
  const { notasRevisadas, aRevisarDeNotas, NOTA_REVISADO } = await import("./recibidos-formato");
  const antes = "Importado de Mis Comprobantes Recibidos (ARCA), por Ana. CAE 76000000000012. A revisar: El IVA es más del 27 % del neto gravado.";
  const despues = notasRevisadas(antes, "Ana  Pérez", "26/09/2026");
  assert.equal(aRevisarDeNotas(despues), null, "ya no está a revisar: el libro la cuenta");
  assert.ok(despues.startsWith("Importado de Mis Comprobantes Recibidos (ARCA), por Ana. CAE 76000000000012."));
  assert.match(despues, new RegExp(`${NOTA_REVISADO} Ana Pérez el 26/09/2026: su IVA suma al crédito fiscal \\(estaba marcado: El IVA es más del 27 %`));
  // Un nombre que trae la marca no la vuelve a poner.
  assert.equal(aRevisarDeNotas(notasRevisadas(antes, "A revisar: x", "26/09/2026")), null);
  assert.equal(notasRevisadas("sin marca", "Ana", "26/09/2026"), "sin marca");
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
  assert.equal(revisar[col("IVA a revisar (no suma)")], "150,00");
  assert.equal(revisar[col("IVA sin desglose (suma)")], "0,00");
  assert.match(revisar.slice(col("A revisar")).join(";"), /no cierra/);
  assert.equal(a[col("Fecha")], "05/08/2026");
  // QA vuelta 5: la fila marcada NO suma al crédito en el archivo (sumaba 150 y la pantalla no).
  assert.equal(revisar[col("IVA crédito fiscal")], "0,00");
  assert.equal(a[col("IVA crédito fiscal")], "420,00");
  assert.equal(nc[col("IVA crédito fiscal")], "-21,00");
  const pesos = (x: string) => Number(x.replace(/\./g, "").replace(",", "."));
  const columna = [a, nc, revisar].map((f) => pesos(f[col("IVA crédito fiscal")]));
  assert.equal(columna.reduce((x, y) => x + y, 0), resumirRecibidos(filas).creditoFiscal, "el archivo y la pantalla dan el mismo crédito");
  assert.equal(resumirRecibidos(filas).creditoFiscal, 399);
});

test("QA vuelta 5 · el mes de (b): el crédito del archivo es el de la pantalla (21.640,50) y la fila marcada no suma", async () => {
  const { csvComprasConFactura } = await import("./recibidos-export");
  const { compraDelLibroDesdeFactura } = await import("./recibidos-libro");
  // Las filas A de septiembre de (b) (qa-5/recibidos-b-2026-09.csv), como las guarda el importador.
  const base = { fecha: "20260903", puntoVenta: 3, cuitEmisor: "30700000008", emisor: "X", noGravado: 0, exento: 0 };
  const filas = [
    { ...base, tipo: 1, numero: 1234, neto: 1000, iva: 210, otrosTributos: 0, total: 1210, desglose: [{ alicuotaId: 5, base: 1000, importe: 210 }], aRevisar: null },
    { ...base, tipo: 1, numero: 1240, neto: 3000, iva: 420, otrosTributos: 90, total: 3510, desglose: [{ alicuotaId: 4, base: 2000, importe: 210 }, { alicuotaId: 5, base: 1000, importe: 210 }], aRevisar: null },
    { ...base, tipo: 3, numero: 77, neto: 100, iva: 21, otrosTributos: 0, total: 121, desglose: [{ alicuotaId: 5, base: 100, importe: 21 }], aRevisar: null },
    { ...base, tipo: 1, numero: 900, neto: 1000, iva: 150, otrosTributos: 0, total: 1150, desglose: null, aRevisar: "El IVA 21% no cierra con su neto: revisá el comprobante." },
    { ...base, tipo: 81, numero: 15, neto: 100, iva: 21, otrosTributos: 0, total: 121, desglose: [{ alicuotaId: 5, base: 100, importe: 21 }], aRevisar: null },
    { ...base, tipo: 1, numero: 500, neto: 100050, iva: 21010.5, otrosTributos: 0, total: 121060.5, desglose: [{ alicuotaId: 5, base: 100050, importe: 21010.5 }], aRevisar: null },
  ];
  const csv = csvComprasConFactura(filas);
  const [titulos, ...cuerpo] = csv.replace(/^﻿/, "").trim().split("\r\n").map((l) => l.split(";"));
  const credito = cuerpo.map((f) => Number(f[titulos.indexOf("IVA crédito fiscal")].replace(/\./g, "").replace(",", ".")));
  const suma = Math.round(credito.reduce((x, y) => x + y, 0) * 100) / 100;
  assert.equal(suma, 21640.5, "antes daba 21.790,50");
  assert.equal(resumirRecibidos(filas).creditoFiscal, 21640.5);
  // El Libro IVA del negocio (y el paquete) cuenta lo mismo con la misma regla.
  const libro = filas.map((f, i) =>
    compraDelLibroDesdeFactura({
      id: `c${i}`, proveedor: f.emisor, facturaTipo: f.tipo, facturaPuntoVenta: f.puntoVenta, facturaNumero: f.numero,
      facturaFecha: f.fecha, facturaCuit: f.cuitEmisor, facturaIva: f.iva, facturaTotal: f.total, facturaNeto: f.neto,
      notas: f.aRevisar ? `Importado de Mis Comprobantes Recibidos (ARCA), por Ana. A revisar: ${f.aRevisar}` : null,
    }),
  );
  assert.equal(Math.round(libro.reduce((x, c) => x + (c.creditoIva ?? 0), 0) * 100) / 100, 21640.5);
});
