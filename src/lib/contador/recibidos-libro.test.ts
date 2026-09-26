// Los comprobantes recibidos dentro del Libro IVA del cliente (frente C2, corrección del
// refutador): van al mes de la FECHA DEL COMPROBANTE, restan si son nota de crédito, su IVA es
// el crédito fiscal, y la nota del libro deja de decir que «las compras se cargan sin la
// factura del proveedor» cuando hay facturas cargadas. Sin facturas cargadas (CH hoy), el libro
// sale IGUAL que antes, letra por letra.

import { test } from "node:test";
import assert from "node:assert/strict";
import { armarLibroIva, type CompraRow, type LibroIva } from "@/lib/libros/libro-iva";
import { lineasLibroIva } from "@/lib/libros/libro-iva-export";
import { compraDelLibroDesdeFactura } from "./recibidos-libro";

const factura = (o: Partial<Parameters<typeof compraDelLibroDesdeFactura>[0]> = {}) =>
  compraDelLibroDesdeFactura({
    id: "c1",
    proveedor: "DISTRIBUIDORA DEL SUR SA",
    facturaTipo: 1,
    facturaPuntoVenta: 3,
    facturaNumero: 1234,
    facturaFecha: "20260812",
    facturaCuit: "30700000008",
    facturaIva: 210,
    facturaTotal: 1210,
    ...o,
  });

test("una factura de proveedor va al libro con la fecha del comprobante, su número y su IVA como crédito", () => {
  assert.deepEqual(factura(), {
    clave: "compra:c1",
    fecha: "2026-08-12",
    proveedor: "DISTRIBUIDORA DEL SUR SA",
    doc: "CUIT 30700000008",
    numero: "Factura A 00003-00001234",
    total: 1210,
    creditoIva: 210,
  });
});

test("la nota de crédito del proveedor resta el total y el crédito; una B no da crédito", () => {
  const nc = factura({ facturaTipo: 3, facturaNumero: 77, facturaIva: 21, facturaTotal: 121 });
  assert.equal(nc.total, -121);
  assert.equal(nc.creditoIva, -21);
  assert.equal(nc.numero, "Nota de crédito A 00003-00000077");
  const tiqueNc = factura({ facturaTipo: 112, facturaIva: 21, facturaTotal: 121 });
  assert.equal(tiqueNc.creditoIva, -21);
  const b = factura({ facturaTipo: 6, facturaIva: 0, facturaTotal: 1210 });
  assert.equal(b.creditoIva, 0);
  assert.equal(b.total, 1210);
});

const SIN_FACTURA: CompraRow = { clave: "compra:m1", fecha: "2026-08-03", proveedor: "Mayorista", doc: "—", numero: "Compra 1", total: 5000 };

function libroRi(compras: CompraRow[]): LibroIva {
  return armarLibroIva({ comprobantes: [], ventasSinComprobante: [], compras, condicion: "responsable-inscripto" });
}

test("el resumen del libro toma como crédito el IVA de las facturas cargadas, con la nota de crédito restando", () => {
  const libro = libroRi([SIN_FACTURA, factura(), factura({ id: "c2", facturaTipo: 3, facturaNumero: 77, facturaIva: 21, facturaTotal: 121 })]);
  assert.equal(libro.resumen.ivaCredito, 189);
  assert.equal(libro.resumen.ivaSaldo, -189);
  assert.equal(libro.resumen.comprasConFacturaCount, 2);
  assert.equal(libro.resumen.comprasTotal, 6089);
});

const NOTA_DE_SIEMPRE =
  "El crédito fiscal va en 0: las compras se cargan sin la factura del proveedor y sin ella no hay crédito. Sumá el crédito de las facturas de compra que tengas.";

test("con facturas cargadas, la nota del libro ya no dice que las compras van sin factura", () => {
  const csv = lineasLibroIva(libroRi([SIN_FACTURA, factura()])).join("\n");
  assert.doesNotMatch(csv, /se cargan sin la factura del proveedor/);
  assert.match(csv, /IVA crédito \(facturas de proveedor\);210,00/);
  assert.match(csv, /sale del IVA de la factura de proveedor cargada/);
});

test("sin facturas cargadas (CH hoy), el libro sale igual que antes: crédito 0 y la misma nota", () => {
  const libro = libroRi([SIN_FACTURA]);
  assert.equal(libro.resumen.ivaCredito, 0);
  assert.equal(libro.resumen.comprasConFacturaCount, 0);
  const csv = lineasLibroIva(libro).join("\n");
  assert.ok(csv.includes(NOTA_DE_SIEMPRE), "la nota de siempre, sin tocar una letra");
});

test("la hoja COMPRAS del paquete trae neto gravado, IVA crédito y total de cada factura de proveedor (la NC resta)", () => {
  const libro: LibroIva = armarLibroIva({
    comprobantes: [],
    ventasSinComprobante: [],
    compras: [
      factura({ facturaNeto: 1000 }),
      factura({ id: "c2", facturaTipo: 3, facturaNumero: 77, facturaNeto: 100, facturaIva: 21, facturaTotal: 121 }),
      { clave: "compra:c3", fecha: "2026-08-20", proveedor: "Sin factura SRL", doc: "—", numero: "Compra 3", total: 500 } satisfies CompraRow,
    ],
    condicion: "responsable-inscripto",
  });
  const out = lineasLibroIva(libro).join("\n");
  assert.match(out, /^Fecha;Proveedor;Documento;Número;Neto gravado;IVA crédito fiscal;Total$/m);
  assert.match(out, /^2026-08-12;DISTRIBUIDORA DEL SUR SA;CUIT 30700000008;Factura A 00003-00001234;1000,00;210,00;1210,00$/m);
  assert.match(out, /;-100,00;-21,00;-121,00$/m, "la nota de crédito resta en las tres columnas");
  assert.match(out, /^2026-08-20;Sin factura SRL;—;Compra 3;;sin factura;500,00$/m);
  assert.match(out, /^Subtotal compras;;;;900,00;189,00;1589,00$/m);
});

// Refutador 26/09 (fiscal, punto 7): el crédito fiscal es sólo de un Responsable Inscripto. Un
// monotributista no lo computa aunque reciba Factura A con el IVA discriminado (desde la RG 5003 es
// lo más común), y sin comprobantes con CAE no se sabe si el negocio es inscripto: tampoco se afirma.
const TITULO_COMPRAS = "COMPRAS (control: sin la factura del proveedor no dan crédito fiscal)";

for (const [condicion, nota] of [
  ["monotributo", /^Nota;Un monotributista no computa crédito fiscal: el IVA de las facturas A de sus proveedores es parte del costo, y cada compra va por el total\.$/m],
  ["sin-comprobantes", /^Nota;Todavía no hay comprobantes con CAE: no se sabe si el negocio es responsable inscripto, así que el IVA de las facturas de proveedor no se toma como crédito fiscal\. Cada compra va por el total\.$/m],
] as const) {
  test(`${condicion} con una Factura A de proveedor: la compra va por el total, sin columna de crédito fiscal y sin crédito en el resumen`, () => {
    const libro = armarLibroIva({ comprobantes: [], ventasSinComprobante: [], compras: [factura({ facturaNeto: 1000 }), SIN_FACTURA], condicion });
    assert.equal(libro.resumen.ivaCredito, 0, "no computa crédito fiscal");
    assert.equal(libro.resumen.ivaSaldo, 0);
    assert.equal(libro.resumen.comprasConFacturaCount, 1, "la factura está cargada: lo que cambia es que no da crédito");
    const out = lineasLibroIva(libro).join("\n");
    assert.doesNotMatch(out, /IVA crédito fiscal|Neto gravado/, "ni la columna ni el neto gravado");
    assert.match(out, /^Fecha;Proveedor;Documento;Número;Total$/m);
    assert.match(out, /^2026-08-12;DISTRIBUIDORA DEL SUR SA;CUIT 30700000008;Factura A 00003-00001234;1210,00$/m);
    assert.match(out, /^Subtotal compras;;;;6210,00$/m, "el subtotal va por el total, IVA incluido");
    assert.doesNotMatch(out, /210,00;|;210,00/, "el IVA de la factura no aparece en ningún renglón");
    assert.match(out, nota);
  });
}

test("monotributo sin facturas de proveedor (CH hoy): la hoja COMPRAS sale igual que siempre, sin nota", () => {
  const out = lineasLibroIva(armarLibroIva({ comprobantes: [], ventasSinComprobante: [], compras: [SIN_FACTURA], condicion: "monotributo" }));
  const i = out.indexOf(TITULO_COMPRAS);
  assert.deepEqual(out.slice(i, i + 5), [
    TITULO_COMPRAS,
    "Fecha;Proveedor;Documento;Número;Total",
    "2026-08-03;Mayorista;—;Compra 1;5000,00",
    "Subtotal compras;;;;5000,00",
    "",
  ]);
});
