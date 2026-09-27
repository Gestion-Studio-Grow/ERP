import { test } from "node:test";
import assert from "node:assert/strict";
import { agregarAlTicket, cobroDesdeAfuera, importeDelRenglon, pagosParaElTotal, quitarDelTicket, vistaDelTicket, type RenglonDeCaja } from "./ticket-caja";
import type { ProductoDeCaja } from "./lectura";
import type { Promocion } from "./promociones";

const coca: ProductoDeCaja = { id: "coca", name: "Coca 2,25 L", codigo: "1", saleUnit: "UNIT", price: 4600, pricePerKg: null, seccion: "bebidas", presentacion: "2,25 L" };
const queso: ProductoDeCaja = { id: "queso", name: "Queso cremoso", codigo: "00201", saleUnit: "WEIGHT", price: null, pricePerKg: 12990, seccion: "fiambreria", presentacion: "kg" };

test("pasar dos veces el mismo producto por unidad suma en su renglón; lo pesado es un renglón por etiqueta", () => {
  let t: RenglonDeCaja[] = [];
  t = agregarAlTicket(t, { producto: coca, cantidad: 1, importe: null, porBalanza: false }, "a").ticket;
  t = agregarAlTicket(t, { producto: coca, cantidad: 2, importe: null, porBalanza: false }, "b").ticket;
  t = agregarAlTicket(t, { producto: queso, cantidad: 0.348, importe: null, porBalanza: true }, "c").ticket;
  t = agregarAlTicket(t, { producto: queso, cantidad: 0.5, importe: null, porBalanza: true }, "d").ticket;
  assert.deepEqual(t.map((r) => [r.clave, r.cantidad]), [["a", 3], ["c", 0.348], ["d", 0.5]]);
  assert.deepEqual(quitarDelTicket(t, "c").map((r) => r.clave), ["a", "d"]);
});

test("el importe del renglón es el del alta: cantidad × precio al centavo, o el de la etiqueta", () => {
  assert.equal(importeDelRenglon({ cantidad: 0.348, precio: 12990, importe: null }), 4520.52);
  assert.equal(importeDelRenglon({ cantidad: 0.348, precio: 12990, importe: 4520 }), 4520);
  assert.equal(importeDelRenglon({ cantidad: 3, precio: 1234.5, importe: null }), 3703.5);
});

test("la vista del ticket aplica las promos con el mismo motor que el servidor", () => {
  const dosPorUno: Promocion = {
    id: "p-2x1",
    nombre: "2×1 Coca",
    tipo: "nxm",
    lleva: 2,
    paga: 1,
    productos: ["coca"],
    secciones: [],
    dias: [],
    prioridad: 20,
    acumulable: false,
    activa: true,
  };
  let t: RenglonDeCaja[] = [];
  t = agregarAlTicket(t, { producto: coca, cantidad: 2, importe: null, porBalanza: false }, "a").ticket;
  t = agregarAlTicket(t, { producto: queso, cantidad: 0.348, importe: 4520, porBalanza: true }, "b").ticket;
  const v = vistaDelTicket(t, [dosPorUno], { fecha: "2026-10-27", diaSemana: 2, medio: null });
  assert.equal(v.bruto, 9200 + 4520);
  assert.equal(v.ahorro, 4600);
  assert.equal(v.total, 4600 + 4520);
  assert.equal(v.unidades, 3);
});

test("el cobro que llega de afuera se valida campo por campo", () => {
  const ok = { clave: "ticket-12345678", renglones: [{ productId: "coca", cantidad: 2 }], pagos: [{ medio: "EFECTIVO", monto: 10000 }] };
  assert.deepEqual(cobroDesdeAfuera(ok), { ...ok, renglones: [{ productId: "coca", cantidad: 2, importe: null }], cliente: null });
  assert.equal(cobroDesdeAfuera({ ...ok, clave: "x" }), null);
  assert.equal(cobroDesdeAfuera({ ...ok, renglones: [] }), null);
  assert.equal(cobroDesdeAfuera({ ...ok, renglones: [{ productId: "coca", cantidad: -1 }] }), null);
  assert.equal(cobroDesdeAfuera({ ...ok, renglones: [{ productId: "coca", cantidad: 1, importe: "10" }] }), null);
  assert.equal(cobroDesdeAfuera({ ...ok, pagos: [{ medio: "BITCOIN", monto: 1 }] }), null);
  assert.equal(cobroDesdeAfuera({ ...ok, pagos: Array(5).fill({ medio: "EFECTIVO", monto: 1 }) }), null);
  assert.equal(cobroDesdeAfuera(null), null);
});

test("con un solo medio que no es efectivo se cobra el total exacto; con efectivo, lo que entregó", () => {
  assert.deepEqual(pagosParaElTotal([{ medio: "MERCADOPAGO", monto: 999 }], 12345), [{ medio: "MERCADOPAGO", monto: 12345 }]);
  assert.deepEqual(pagosParaElTotal([{ medio: "EFECTIVO", monto: 20000 }], 12345), [{ medio: "EFECTIVO", monto: 20000 }]);
  assert.deepEqual(
    pagosParaElTotal([{ medio: "MERCADOPAGO", monto: 5000 }, { medio: "EFECTIVO", monto: 0 }, { medio: "EFECTIVO", monto: 8000 }], 12345),
    [{ medio: "MERCADOPAGO", monto: 5000 }, { medio: "EFECTIVO", monto: 8000 }],
  );
});
