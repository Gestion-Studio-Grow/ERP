// Las ventas del mostrador en Reportes, EJECUTADAS: el día del negocio de cada venta, por medio
// y por producto, y el CSV con CRLF. Y el `where`: el de Ventas del día con los bordes del
// período de Reportes.

import { test } from "node:test";
import assert from "node:assert/strict";
import { businessWallTimeToUtc, dateStrInBusinessTz } from "@/lib/datetime";
import { agruparVentasMostrador, cantidadLegible, csvVentasMostrador, type VentaDelMostrador } from "./ventas-mostrador";
import { whereVentasDelPeriodo } from "./ventas-mostrador-lectura";

const venta = (x: Partial<VentaDelMostrador>): VentaDelMostrador => ({
  createdAt: new Date("2026-09-20T15:00:00.000Z"),
  total: 1000,
  paymentMethod: "EFECTIVO",
  items: [],
  ...x,
});

test("por día del negocio: una venta de las 23:30 del 19 es del 19, aunque en UTC ya sea el 20", () => {
  const r = agruparVentasMostrador(
    [
      venta({ createdAt: new Date("2026-09-20T02:30:00.000Z"), total: 500 }), // 19/09 23:30 en Buenos Aires
      venta({ createdAt: new Date("2026-09-20T15:00:00.000Z"), total: 1500, paymentMethod: "MERCADOPAGO" }),
      venta({ createdAt: new Date("2026-09-20T18:00:00.000Z"), total: 1000, paymentMethod: null }),
    ],
    dateStrInBusinessTz,
  );
  assert.equal(r.total, 3000);
  assert.equal(r.cantidad, 3);
  assert.equal(r.ticketPromedio, 1000);
  assert.deepEqual(r.porDia.map((d) => [d.dia, d.total, d.cantidad]), [
    ["2026-09-20", 2500, 2],
    ["2026-09-19", 500, 1],
  ]);
  assert.deepEqual(r.porMedio.map((m) => [m.etiqueta, m.total]), [
    ["Mercado Pago", 1500],
    ["Sin medio registrado", 1000],
    ["Efectivo", 500],
  ]);
});

test("la venta 'A cuenta' (saldada y sin medio, con su cuenta) va como 'A cuenta (fiado)', no como 'Sin medio registrado'", () => {
  const r = agruparVentasMostrador(
    [
      venta({ total: 2000, paymentMethod: null, aCuenta: true }),
      venta({ total: 700, paymentMethod: null }),
      venta({ total: 1000 }),
    ],
    dateStrInBusinessTz,
  );
  assert.deepEqual(r.porMedio.map((m) => [m.etiqueta, m.total, m.cantidad]), [
    ["A cuenta (fiado)", 2000, 1],
    ["Efectivo", 1000, 1],
    ["Sin medio registrado", 700, 1],
  ]);
});

test("por producto con las líneas ya sumadas por la base: sale de ellas y no de cada venta", () => {
  const r = agruparVentasMostrador([venta({ total: 20500 }), venta({ total: 2000 })], dateStrInBusinessTz, [
    { productId: "vacio", name: "Vacío", quantity: 1.25, saleUnit: "WEIGHT", lineTotal: 12500 },
    // El mismo producto con otro nombre (se renombró): una sola fila, con el primer nombre.
    { productId: "vacio", name: "Vacío especial", quantity: 0.8, saleUnit: "WEIGHT", lineTotal: 8000 },
    { productId: null, name: "Envío ", quantity: 1, saleUnit: "UNIT", lineTotal: 2000 },
  ]);
  assert.deepEqual(r.porProducto.map((p) => [p.nombre, p.cantidad, p.porKilo, p.total]), [
    ["Vacío", 2.05, true, 20500],
    ["Envío ", 1, false, 2000],
  ]);
  assert.equal(r.total, 22500);
});

test("por producto: kilos y unidades, y las líneas a mano por su nombre", () => {
  const r = agruparVentasMostrador(
    [
      venta({ items: [{ productId: "vacio", name: "Vacío", quantity: 1.25, saleUnit: "WEIGHT", lineTotal: 12500 }] }),
      venta({
        items: [
          { productId: "vacio", name: "Vacío", quantity: 0.8, saleUnit: "WEIGHT", lineTotal: 8000 },
          { productId: null, name: "Envío ", quantity: 1, saleUnit: "UNIT", lineTotal: 2000 },
        ],
      }),
    ],
    dateStrInBusinessTz,
  );
  assert.deepEqual(r.porProducto.map((p) => [p.nombre, p.cantidad, p.porKilo, p.total]), [
    ["Vacío", 2.05, true, 20500],
    ["Envío ", 1, false, 2000],
  ]);
  assert.equal(cantidadLegible(2.05, true), "2,05 kg");
  assert.equal(cantidadLegible(3, false), "3 u.");
});

test("el CSV: ; y coma decimal, CRLF en todas las líneas", () => {
  const r = agruparVentasMostrador([venta({ total: 1234.5, items: [{ productId: "x", name: "Vela\nlavanda", quantity: 2, saleUnit: "UNIT", lineTotal: 1234.5 }] })], dateStrInBusinessTz);
  const out = csvVentasMostrador(r, { desde: "2026-06-26", hasta: "2026-09-23", negocio: "Shine" });
  assert.ok(out.endsWith("\r\n"));
  assert.doesNotMatch(out, /[^\r]\n/, "ningún salto suelto, ni adentro de un campo");
  assert.match(out, /^Ventas cobradas;1234,50\r$/m);
  assert.match(out, /^Vela lavanda;2;u\.;1234,50\r$/m);
});

test("el where del período: el de Ventas del día, de las 00:00 del primer día a la medianoche del siguiente al último", () => {
  const { where, desde, hasta } = whereVentasDelPeriodo("t", "2026-09-23", 30);
  assert.equal(desde.getTime(), businessWallTimeToUtc("2026-08-25", "00:00").getTime());
  assert.equal(hasta.getTime(), businessWallTimeToUtc("2026-09-24", "00:00").getTime() - 1);
  assert.deepEqual(where, {
    tenantId: "t",
    paid: true,
    status: { not: "CANCELLED" },
    createdAt: { gte: desde, lt: businessWallTimeToUtc("2026-09-24", "00:00") },
  });
});
