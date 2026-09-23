// El Libro IVA del mes, EJECUTADO con datos: qué se declara (comprobantes con CAE), qué es
// control (ventas sin comprobante, compras sin factura), cuándo se muestra la posición de
// IVA y cómo sale el archivo para la contadora.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  alicuotasDelDesglose,
  armarLibroIva,
  comprobanteDesdeInvoice,
  condicionPorTipos,
  dateToIso,
  fiscalDateToIso,
  libroOcultoPara,
  muestraPosicionIva,
  saldoIvaDesdeGrupos,
  whereAnuladasConFactura,
  whereComprobantesDelMes,
  type CompraRow,
  type VentaSinComprobanteRow,
} from "./libro-iva";
import { armarExportLibroIva } from "./libro-iva-export";
import { bordesDelMes } from "./fecha-fiscal";

const facturaA = (extra: Partial<Parameters<typeof comprobanteDesdeInvoice>[0]> = {}) =>
  comprobanteDesdeInvoice({
    fecha: "20260905", tipoComprobante: 1, puntoVenta: 3, numero: 42,
    docTipo: 80, docNro: "30712345679", neto: 1000, iva: 210, total: 1210,
    ivaDesglose: [{ alicuotaId: 5, base: 1000, importe: 210 }],
    ...extra,
  });

const sinComprobante: VentaSinComprobanteRow = { clave: "pedido:o-7", fecha: "2026-09-06", tipo: "Venta del mostrador", numero: "Pedido 7", cliente: "Juan", total: 5000 };
const compra: CompraRow = { clave: "compra:p-3", fecha: "2026-09-07", proveedor: "Frigorífico Sur", doc: "CUIT 30712345679", numero: "Compra 3", total: 121000 };

test("fiscalDateToIso: AAAAMMDD → YYYY-MM-DD; lo que no es fiscal pasa tal cual", () => {
  assert.equal(fiscalDateToIso("20260708"), "2026-07-08");
  assert.equal(fiscalDateToIso("2026-07-08"), "2026-07-08");
});

test("dateToIso fecha en el día de negocio: las 21:30 del 30 NO son el 1 del mes que viene", () => {
  // 2026-06-30 21:30 en Buenos Aires = 2026-07-01 00:30 UTC.
  assert.equal(dateToIso(new Date("2026-07-01T00:30:00.000Z")), "2026-06-30");
  assert.equal(dateToIso(new Date("2026-03-15T03:05:00.000Z")), "2026-03-15"); // 00:05 local
  assert.equal(dateToIso(new Date("2026-03-16T02:59:59.000Z")), "2026-03-15"); // 23:59:59 local
});

test("comprobante: montos exactos, número y documento; la alícuota sale del desglose guardado", () => {
  const r = facturaA();
  assert.equal(r.fecha, "2026-09-05");
  assert.equal(r.tipo, "Factura A");
  assert.equal(r.numero, "00003-00000042");
  assert.equal(r.doc, "CUIT 30712345679");
  assert.deepEqual(r.alicuotas, [{ alicuota: 0.21, base: 1000, importe: 210 }]);
  assert.equal(r.anuladaSinNotaDeCredito, false);
});

test("alícuotas: una factura con carne al 10,5% y embutidos al 21% se ve con las dos", () => {
  const r = facturaA({
    neto: 3000, iva: 315, total: 3315,
    ivaDesglose: [
      { alicuotaId: 4, base: 2000, importe: 210 },
      { alicuotaId: 5, base: 1000, importe: 105 },
    ],
  });
  assert.deepEqual(r.alicuotas.map((a) => a.alicuota), [0.105, 0.21]);
  // Antes: 315 / 3000 = 0,105 → "10,5%" para TODA la factura, que es falso.
});

test("alícuotas sin desglose (comprobantes viejos): la oficial más cercana, nunca un 20,98%", () => {
  assert.deepEqual(alicuotasDelDesglose(null, { neto: 826.45, iva: 173.55 }), [{ alicuota: 0.21, base: 826.45, importe: 173.55 }]);
  assert.deepEqual(alicuotasDelDesglose([{ alicuotaId: 99, base: 1, importe: 1 }], { neto: 100, iva: 10.5 })[0].alicuota, 0.105);
  // Factura C: IVA 0 → alícuota 0.
  assert.equal(alicuotasDelDesglose(undefined, { neto: 5000, iva: 0 })[0].alicuota, 0);
});

test("una nota de crédito RESTA; una venta anulada con factura queda marcada", () => {
  const nc = comprobanteDesdeInvoice({
    fecha: "20260910", tipoComprobante: 3, puntoVenta: 3, numero: 5,
    docTipo: 80, docNro: "30712345679", neto: 500, iva: 105, total: 605,
    ivaDesglose: [{ alicuotaId: 5, base: 500, importe: 105 }],
  });
  assert.equal(nc.tipo, "Nota de crédito A");
  assert.equal(nc.total, -605);
  assert.equal(nc.iva, -105);
  assert.equal(nc.alicuotas[0].importe, -105);
  const anulada = facturaA({ origenAnulado: true });
  assert.equal(anulada.anuladaSinNotaDeCredito, true);

  const libro = armarLibroIva({ comprobantes: [facturaA(), nc, anulada], ventasSinComprobante: [], compras: [], condicion: "responsable-inscripto" });
  assert.equal(libro.resumen.ivaDebito, 210 - 105 + 210);
  assert.equal(libro.resumen.anuladasSinNotaDeCredito, 1);
});

test("una compra sin factura NO suma crédito; la venta sin comprobante NO suma débito", () => {
  const libro = armarLibroIva({
    comprobantes: [facturaA()],
    ventasSinComprobante: [sinComprobante],
    compras: [compra],
    condicion: "responsable-inscripto",
  });
  const s = libro.resumen;
  assert.equal(s.ivaDebito, 210, "sólo el comprobante; la venta sin comprobante no se estima al 21%");
  assert.equal(s.ivaCredito, 0, "la compra de $121.000 sin factura del proveedor no da crédito");
  assert.equal(s.ivaSaldo, 210);
  assert.equal(s.sinComprobanteTotal, 5000);
  assert.equal(s.comprasTotal, 121000);
  assert.deepEqual(s.porAlicuota, [{ alicuota: 0.21, neto: 1000, iva: 210 }]);
});

test("condición: con A o B es inscripto; sólo C, monotributo; nada, no se afirma", () => {
  assert.equal(condicionPorTipos([11, 6]), "responsable-inscripto");
  assert.equal(condicionPorTipos([11, 13]), "monotributo");
  assert.equal(condicionPorTipos([]), "sin-comprobantes");
  assert.equal(condicionPorTipos([null]), "sin-comprobantes");
  assert.equal(muestraPosicionIva("responsable-inscripto"), true);
  assert.equal(muestraPosicionIva("monotributo"), false, "a un monotributista no se le muestra IVA débito");
  assert.equal(muestraPosicionIva("sin-comprobantes"), false);
});

test("orden: cada bloque por fecha, y a igual fecha por número", () => {
  const libro = armarLibroIva({
    comprobantes: [facturaA({ fecha: "20260920", numero: 2 }), facturaA({ fecha: "20260902", numero: 9 }), facturaA({ fecha: "20260902", numero: 1 })],
    ventasSinComprobante: [],
    compras: [],
    condicion: "responsable-inscripto",
  });
  assert.deepEqual(libro.comprobantes.map((c) => c.numero), ["00003-00000001", "00003-00000009", "00003-00000002"]);
});

test("el archivo: bloques con título, ; como separador, coma decimal y la posición sólo si es inscripto", () => {
  const ri = armarLibroIva({ comprobantes: [facturaA()], ventasSinComprobante: [sinComprobante], compras: [compra], condicion: "responsable-inscripto" });
  const out = armarExportLibroIva(ri, { mes: "2026-09", negocio: "Magra" });
  // CRLF, como el paquete del mes y el libro de caja: ninguna línea termina con un \n suelto.
  assert.ok(out.endsWith("\r\n"));
  assert.doesNotMatch(out, /[^\r]\n/);
  const lineas = out.split("\r\n");
  assert.equal(lineas[0], "Libro IVA;Magra;septiembre 2026 (del 01/09/2026 al 30/09/2026)");
  assert.match(out, /^COMPROBANTES EMITIDOS/m);
  assert.match(out, /^VENTAS SIN COMPROBANTE \(control/m);
  assert.match(out, /^COMPRAS \(control: sin la factura del proveedor no dan crédito fiscal\)/m);
  assert.match(out, /^2026-09-05;Factura A;00003-00000042;30712345679;CUIT 30712345679;1000,00;21%;210,00;1210,00;$/m);
  assert.match(out, /^IVA crédito \(facturas de proveedor\);0,00$/m);
  assert.match(out, /^Saldo IVA a pagar;210,00$/m);

  const mono = armarLibroIva({
    comprobantes: [comprobanteDesdeInvoice({ fecha: "20260905", tipoComprobante: 11, puntoVenta: 1, numero: 1, docTipo: 99, docNro: "0", neto: 5000, iva: 0, total: 5000 })],
    ventasSinComprobante: [],
    compras: [],
    condicion: "monotributo",
  });
  const outMono = armarExportLibroIva(mono, { mes: "2026-09" });
  assert.doesNotMatch(outMono, /IVA débito|Saldo IVA/);
  assert.match(outMono, /Emite Factura C \(monotributo\): no liquida IVA/);
});

test("anuladas con factura: el mismo where para el botón (por emisión) y el cierre (por fecha fiscal)", () => {
  const b = bordesDelMes("2026-08");
  assert.deepEqual(whereAnuladasConFactura("t-1", { fecha: b.fiscal }), {
    tenantId: "t-1",
    fecha: { gte: "20260801", lt: "20260901" },
    status: "AUTHORIZED",
    OR: [{ order: { status: "CANCELLED" } }, { appointment: { status: "CANCELLED" } }],
  });
  const porEmision = whereAnuladasConFactura("t-1", { createdAt: b.instantes }) as { createdAt?: unknown };
  assert.deepEqual(porEmision.createdAt, b.instantes);
});

test("la clave de cada fila es el id: dos ventas que se ven iguales no chocan", () => {
  assert.equal(facturaA({ id: "inv-1" }).clave, "inv-1");
  assert.equal(facturaA().clave, "Factura A-00003-00000042", "sin id, tipo y número (únicos con CAE)");
  // Medido en la base de QA (beauty-spa, agosto): 165 ventas sin comprobante y 134 claves
  // armadas con lo visible. Con el id del cobro, una por fila.
  const turno = (id: string): VentaSinComprobanteRow => ({ clave: `cobro:${id}`, fecha: "2026-08-12", tipo: "Turno cobrado", numero: "Limpieza facial", cliente: "Ana", total: 23000 });
  const libro = armarLibroIva({ comprobantes: [], ventasSinComprobante: [turno("a"), turno("b")], compras: [], condicion: "sin-comprobantes" });
  assert.equal(new Set(libro.ventasSinComprobante.map((v) => v.clave)).size, 2);
});

test("el número del botón y la pantalla: el mismo where y la misma cuenta", () => {
  assert.deepEqual(whereComprobantesDelMes("t-1", "2026-09"), {
    tenantId: "t-1",
    status: "AUTHORIZED",
    fecha: { gte: "20260901", lt: "20261001" },
  });

  // Los comprobantes de la pantalla, agrupados por tipo como los agrupa el botón.
  const nc = comprobanteDesdeInvoice({
    fecha: "20260910", tipoComprobante: 3, puntoVenta: 3, numero: 5,
    docTipo: 80, docNro: "30712345679", neto: 500, iva: 105, total: 605,
  });
  const b = facturaA({ tipoComprobante: 6, numero: 43, neto: 2000, iva: 420, total: 2420, ivaDesglose: null });
  const libro = armarLibroIva({ comprobantes: [facturaA(), b, nc], ventasSinComprobante: [sinComprobante], compras: [compra], condicion: "responsable-inscripto" });
  const grupos = [
    { tipoComprobante: 1, iva: 210 },
    { tipoComprobante: 6, iva: 420 },
    { tipoComprobante: 3, iva: 105 }, // el groupBy suma el IVA sin signo: la NC resta en la cuenta
  ];
  const r = saldoIvaDesdeGrupos(grupos);
  assert.deepEqual(r, { condicion: "responsable-inscripto", saldo: 525 });
  assert.equal(r.condicion === "responsable-inscripto" && r.saldo, libro.resumen.ivaSaldo);

  assert.deepEqual(saldoIvaDesdeGrupos([{ tipoComprobante: 11, iva: 0 }]), { condicion: "monotributo" });
  assert.deepEqual(saldoIvaDesdeGrupos([]), { condicion: "sin-comprobantes" });
});

test("el libro se le oculta a un monotributista; sin comprobantes todavía, no", () => {
  assert.equal(libroOcultoPara("monotributo"), true);
  assert.equal(libroOcultoPara("responsable-inscripto"), false);
  assert.equal(libroOcultoPara("sin-comprobantes"), false, "todavía no se sabe qué es");
});
