import assert from "node:assert/strict";
import { test } from "node:test";
import { PDFDocument } from "pdf-lib";
import { cortarEnLineas, pdfDeConstancia, pdfDeCotizacion, pdfDeLiquidacion, plataPdf, textoImprimible } from "./papel-pdf";

const COTIZACION = {
  proyecto: { nombre: "Stand Ñandú 🎪", lugar: "La Rural", ciudad: "CABA", client: { name: "Biogénesis" } },
  fechaEvento: "10 ene 2027",
  negocio: { nombre: "MIA Producciones" },
  codigo: "MIA-27-0001",
  moneda: "USD",
  version: 2,
  condiciones: "50 % al confirmar\n50 % antes del evento",
  grupos: [{ rubro: "Arquitectura", subtotal: 1500, lineas: [{ descripcion: "Módulo “A” — con iluminación", cantidad: 2, importe: 1500 }] }],
  neto: 1500,
  ivaPct: 21,
  iva: 315,
  total: 1815,
};

test("una cotización larga pasa de página y no falla por emojis ni comillas tipográficas", async () => {
  const lineas = Array.from({ length: 120 }, (_, i) => ({ descripcion: `Ítem ${i} con un detalle bastante largo para probar que corta bien la línea cuando no entra en la columna`, cantidad: 1, importe: 10 }));
  const bytes = await pdfDeCotizacion({ ...COTIZACION, grupos: [{ rubro: "Arquitectura", subtotal: 1200, lineas }] });
  const doc = await PDFDocument.load(bytes);
  assert.ok(doc.getPageCount() > 1);
  assert.equal(doc.getTitle(), "Cotización MIA-27-0001");
});

test("constancia y liquidación salen en una página", async () => {
  const constancia = await pdfDeConstancia({ negocio: "MIA", numero: "ABC", fecha: "1 nov 2026", cliente: "Biogénesis", proyecto: "Stand", concepto: "Anticipo", monto: 100, moneda: "ARS", medio: "Transferencia", factura: null });
  const liquidacion = await pdfDeLiquidacion({ negocio: "MIA", periodo: "noviembre 2026", estado: "Publicada", persona: "Ana", puesto: null, facturaA: null, base: 100, extras: [{ nombre: "Plus", monto: 10 }], total: 110 });
  assert.equal((await PDFDocument.load(constancia)).getPageCount(), 1);
  assert.equal((await PDFDocument.load(liquidacion)).getPageCount(), 1);
});

test("el texto se limpia y se corta", () => {
  assert.equal(textoImprimible("Ñandú “A” — ok 🎪"), 'Ñandú "A" - ok ??');
  assert.deepEqual(cortarEnLineas("uno dos tres", (t) => t.length, 7), ["uno dos", "tres"]);
  assert.deepEqual(cortarEnLineas("palabralarguisima x", (t) => t.length, 3), ["palabralarguisima", "x"]);
});

test("el importe lleva su moneda", () => {
  assert.equal(plataPdf(1234.5, "ARS"), "$ 1.234,50");
  assert.equal(plataPdf(1234.5, "USD"), "USD  1.234,50");
});
