import { test } from "node:test";
import assert from "node:assert/strict";
import {
  deriveIvaFromGross,
  fiscalDateToIso,
  dateToIso,
  ventaFromInvoice,
  ventaFromGross,
  compraFromPurchase,
  summarizeLibroIva,
  buildLibroIva,
  IVA_ALICUOTA_GENERAL,
} from "./libro-iva";
import { buildLibroIvaExport } from "./libro-iva-export";
import { readFileSync } from "node:fs";

test("deriveIvaFromGross: descompone un total IVA-incluido al 21% (neto + iva = total)", () => {
  const { neto, iva } = deriveIvaFromGross(1210);
  assert.equal(neto, 1000);
  assert.equal(iva, 210);
  assert.equal(round2(neto + iva), 1210);
});

test("deriveIvaFromGross: redondeo estable (no deja centavos colgando)", () => {
  const { neto, iva } = deriveIvaFromGross(100);
  assert.equal(round2(neto + iva), 100, "neto+iva debe reconstruir el total");
});

test("fiscalDateToIso: AAAAMMDD → YYYY-MM-DD; no fiscal se devuelve tal cual", () => {
  assert.equal(fiscalDateToIso("20260708"), "2026-07-08");
  assert.equal(fiscalDateToIso("2026-07-08"), "2026-07-08");
});

test("ventaFromInvoice: comprobante fiscal exacto, tipo/número/doc mapeados", () => {
  const r = ventaFromInvoice({
    fecha: "20260708", tipoComprobante: 1, puntoVenta: 3, numero: 42,
    docTipo: 80, docNro: "30712345679", neto: 1000, iva: 210, total: 1210,
  });
  assert.equal(r.fecha, "2026-07-08");
  assert.equal(r.tipo, "Factura A");
  assert.equal(r.numero, "00003-00000042");
  assert.equal(r.doc, "CUIT 30712345679");
  assert.equal(r.neto, 1000);
  assert.equal(r.iva, 210);
  assert.equal(r.fuente, "comprobante");
  assert.ok(Math.abs(r.alicuota - 0.21) < 1e-9);
});

test("ventaFromInvoice: consumidor final (docTipo 99) → sin CUIT", () => {
  const r = ventaFromInvoice({
    fecha: "20260708", tipoComprobante: 6, puntoVenta: 1, numero: 7,
    docTipo: 99, docNro: "0", neto: 826.45, iva: 173.55, total: 1000,
  });
  assert.equal(r.tipo, "Factura B");
  assert.equal(r.doc, "Consumidor final");
  assert.equal(r.cliente, "Consumidor final");
});

test("ventaFromGross: retail/servicio sin comprobante → estimado 21%, consumidor final", () => {
  const r = ventaFromGross({ fecha: "2026-07-08", tipo: "Ticket", numero: "P-100", cliente: "Juan", total: 1210 });
  assert.equal(r.neto, 1000);
  assert.equal(r.iva, 210);
  assert.equal(r.fuente, "estimado");
  assert.equal(r.doc, "Consumidor final");
  assert.equal(r.alicuota, IVA_ALICUOTA_GENERAL);
  assert.equal(r.cliente, "Juan");
});

test("compraFromPurchase: estima 21%, CUIT si viene si no '—'", () => {
  const conCuit = compraFromPurchase({ fecha: "2026-07-08", proveedor: "Distri Norte", cuit: "30712345679", numero: "OC-1", total: 1210 });
  assert.equal(conCuit.neto, 1000);
  assert.equal(conCuit.iva, 210);
  assert.equal(conCuit.doc, "CUIT 30712345679");
  const sinCuit = compraFromPurchase({ fecha: "2026-07-08", proveedor: null, numero: "—", total: 121 });
  assert.equal(sinCuit.doc, "—");
  assert.equal(sinCuit.proveedor, "Proveedor sin identificar");
});

test("summarizeLibroIva: IVA débito/crédito/saldo + conteo de estimadas", () => {
  const ventas = [
    ventaFromInvoice({ fecha: "20260701", tipoComprobante: 1, puntoVenta: 1, numero: 1, docTipo: 80, docNro: "30", neto: 1000, iva: 210, total: 1210 }),
    ventaFromGross({ fecha: "2026-07-02", tipo: "Ticket", numero: "P-1", cliente: "x", total: 1210 }),
  ];
  const compras = [compraFromPurchase({ fecha: "2026-07-03", proveedor: "P", numero: "C-1", total: 605 })];
  const s = summarizeLibroIva(ventas, compras);
  assert.equal(s.ventasIva, 420); // 210 + 210
  assert.equal(s.ivaDebito, 420);
  assert.equal(s.comprasIva, 105); // 605 → neto 500, iva 105
  assert.equal(s.ivaCredito, 105);
  assert.equal(s.ivaSaldo, 315); // 420 - 105
  assert.equal(s.ventasEstimadas, 1);
  assert.equal(s.comprasEstimadas, 1);
});

test("buildLibroIva: ordena ventas y compras por fecha ascendente", () => {
  const ventas = [
    ventaFromGross({ fecha: "2026-07-05", tipo: "Ticket", numero: "b", cliente: "x", total: 100 }),
    ventaFromGross({ fecha: "2026-07-01", tipo: "Ticket", numero: "a", cliente: "x", total: 100 }),
  ];
  const libro = buildLibroIva(ventas, []);
  assert.deepEqual(libro.ventas.map((v) => v.fecha), ["2026-07-01", "2026-07-05"]);
});

test("buildLibroIvaExport: estructurado (secciones + subtotales + resumen), no volcado plano", () => {
  const ventas = [ventaFromGross({ fecha: "2026-07-02", tipo: "Ticket", numero: "P-1", cliente: "x", total: 1210 })];
  const compras = [compraFromPurchase({ fecha: "2026-07-03", proveedor: "P", numero: "C-1", total: 605 })];
  const libro = buildLibroIva(ventas, compras);
  const out = buildLibroIvaExport(libro, { desde: "2026-07-01", hasta: "2026-07-31", tenant: "Estudio Norte" });
  assert.match(out, /VENTAS \(IVA débito\)/);
  assert.match(out, /COMPRAS \(IVA crédito\)/);
  assert.match(out, /Subtotal ventas/);
  assert.match(out, /Subtotal compras/);
  assert.match(out, /RESUMEN/);
  assert.match(out, /Saldo IVA a pagar;105,00/); // ventas iva 210 − compras iva 105
  // Estructura, no flat: tiene encabezados de sección, no solo filas de datos.
  assert.ok(out.split("\n").length > ventas.length + compras.length + 5);
});

// round2 local para asserts (misma regla que el sistema).
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// ── La fecha del libro es el DÍA DE NEGOCIO, no el día UTC ──────────────────
//
// Decía `d.toISOString().slice(0,10)`. Argentina es UTC−3, así que todo lo cobrado entre
// las 21:00 y las 23:59 hora local se declaraba con la fecha del día siguiente: tres horas
// de cada día, sin nada que lo delatara. En un borde de mes corre facturación de un período
// fiscal al otro. Es un libro de IVA: la fecha ES el dato.

test("dateToIso fecha en el día de negocio: las 21:30 del 30 NO son el 1 del mes que viene", () => {
  // 2026-06-30 21:30 en Buenos Aires = 2026-07-01 00:30 UTC.
  const instante = new Date("2026-07-01T00:30:00.000Z");
  assert.equal(
    dateToIso(instante),
    "2026-06-30",
    "un comprobante del 30 a las 21:30 se declaraba el 1 de julio: cruza el período fiscal",
  );
});

test("dateToIso: el resto del día no se mueve, y la medianoche local tampoco", () => {
  // Mediodía local: 2026-03-15 12:00 -03 = 15:00 UTC. Nunca estuvo mal, no puede romperse.
  assert.equal(dateToIso(new Date("2026-03-15T15:00:00.000Z")), "2026-03-15");
  // 00:05 local del 15 = 03:05 UTC del 15. El otro borde: tampoco cae al 14.
  assert.equal(dateToIso(new Date("2026-03-15T03:05:00.000Z")), "2026-03-15");
  // 23:59:59 local del 15 = 02:59:59 UTC del 16.
  assert.equal(dateToIso(new Date("2026-03-16T02:59:59.000Z")), "2026-03-15");
});

test("dateToIso no usa toISOString: la conversión tiene que mirar la zona del negocio", () => {
  // Chequeo de forma, porque el bug vuelve escribiendo una línea de cuatro palabras.
  const fuente = readFileSync(new URL("./libro-iva.ts", import.meta.url), "utf8");
  const cuerpo = fuente.slice(fuente.indexOf("export function dateToIso"));
  assert.doesNotMatch(
    cuerpo.slice(0, 200),
    /toISOString/,
    "dateToIso volvió a fechar en UTC. El día fiscal es el día de negocio (dateStrInBusinessTz).",
  );
  const loader = readFileSync(new URL("./libro-iva-loader.ts", import.meta.url), "utf8");
  const tf = loader.slice(loader.indexOf("function toFiscal"));
  assert.doesNotMatch(
    tf.slice(0, 200),
    /toISOString/,
    "toFiscal volvió a fechar en UTC: los bordes del período se corren tres horas y dejan " +
      "adentro o afuera los comprobantes de la última franja de cada día.",
  );
});
