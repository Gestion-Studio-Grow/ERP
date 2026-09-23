// Devolución a proveedor: TODAS las líneas se validan antes de escribir nada. Se ejecuta la
// regla con el caso del criterio de aceptación (3 líneas, una inválida → no se graba ninguna y
// el error se ve en esa línea).

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DevolucionRechazada,
  lineasPorProducto,
  NOTA_DE_CREDITO_PREFIX,
  registrarDevolucionEnTx,
  REINTEGRO_ACTOR_PREFIX,
  validarDevolucion,
  valorDeLaDevolucion,
  whereDevoluciones,
  type LineaDeCompra,
} from "./supplier-return";
import type { Prisma } from "@/generated/prisma/client";
import { medioDelPago } from "@/lib/cuentas/loader";

const compra: LineaDeCompra[] = [
  { productId: "vacio", nombre: "Vacío", unidad: "kg", comprado: 20, unitCost: 6543, yaDevuelto: 0, stock: 18 },
  { productId: "lomo", nombre: "Lomo", unidad: "kg", comprado: 10, unitCost: 9000, yaDevuelto: 8, stock: 7 },
  { productId: "entrana", nombre: "Entraña", unidad: "kg", comprado: 5, unitCost: 8000, yaDevuelto: 0, stock: 1 },
];

test("3 líneas y una inválida → ninguna es válida y el error queda EN esa línea", () => {
  const r = validarDevolucion(
    [
      { productId: "vacio", cantidad: "2,5" },
      { productId: "lomo", cantidad: "3" }, // de 10 comprados ya se devolvieron 8: quedan 2
      { productId: "entrana", cantidad: "1" },
    ],
    compra,
  );
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.deepEqual(
    r.errores.map((e) => e.productId),
    ["lomo"],
  );
  assert.match(r.errores[0].mensaje, /quedan 2 kg de Lomo/);
  // Nada vuelve como "válido": la acción no tiene qué registrar a medias.
  assert.equal("lineas" in r, false);
});

test("todas válidas → vuelven todas, con el costo de la compra de origen", () => {
  const r = validarDevolucion(
    [
      { productId: "vacio", cantidad: "2,5" },
      { productId: "lomo", cantidad: "2" },
      { productId: "entrana", cantidad: "" }, // vacía: no se pidió
    ],
    compra,
  );
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.deepEqual(r.lineas, [
    { productId: "vacio", nombre: "Vacío", qty: 2.5, unitCost: 6543 },
    { productId: "lomo", nombre: "Lomo", qty: 2, unitCost: 9000 },
  ]);
  assert.equal(valorDeLaDevolucion(r.lineas), 34357.5);
});

test("cada regla, con su mensaje: ilegible, fuera de la compra, repetida, más que el stock, todo devuelto", () => {
  const r = validarDevolucion(
    [
      { productId: "vacio", cantidad: "dos" },
      { productId: "pollo", cantidad: "1" },
      { productId: "entrana", cantidad: "2" }, // hay 1 en stock
      { productId: "entrana", cantidad: "1" },
    ],
    [...compra, { productId: "bife", nombre: "Bife", unidad: "kg", comprado: 3, unitCost: 1, yaDevuelto: 3, stock: 5 }],
  );
  assert.equal(r.ok, false);
  if (r.ok) return;
  const por = new Map(r.errores.map((e) => [e.productId, e.mensaje]));
  assert.match(por.get("vacio")!, /no es una cantidad/);
  assert.match(por.get("pollo")!, /no está en esta compra/);
  assert.equal(r.errores.filter((e) => e.productId === "entrana").length, 2);
  assert.match(r.errores.find((e) => e.productId === "entrana")!.mensaje, /Hay 1 kg de Entraña en stock/);
  assert.match(r.errores.filter((e) => e.productId === "entrana")[1].mensaje, /dos veces/);

  const todo = validarDevolucion([{ productId: "bife", cantidad: "1" }], [
    { productId: "bife", nombre: "Bife", unidad: "kg", comprado: 3, unitCost: 1, yaDevuelto: 3, stock: 5 },
  ]);
  assert.equal(todo.ok, false);
  if (!todo.ok) assert.match(todo.errores[0].mensaje, /ya se devolvió todo/);
});

test("sin ninguna cantidad cargada no hay errores ni líneas (la acción pide cargar al menos una)", () => {
  const r = validarDevolucion([{ productId: "vacio", cantidad: "" }], compra);
  assert.deepEqual(r, { ok: true, lineas: [] });
});

test("el mismo producto en dos líneas de la compra: se suma lo comprado y el costo es el promedio ponderado", () => {
  // 10 kg de vacío a $6.000 y 5 kg a $6.600 en la misma compra: se pagaron $93.000 por 15 kg.
  const lineas = lineasPorProducto(
    [
      { productId: "vacio", name: "Vacío", unit: "kg", quantity: 10, unitCost: 6000 },
      { productId: "lomo", name: "Lomo", unit: "kg", quantity: 2, unitCost: 9000 },
      { productId: "vacio", name: "Vacío", unit: "kg", quantity: 5, unitCost: 6600 },
      { productId: null, name: "Borrado", unit: "u", quantity: 1, unitCost: 100 },
    ],
    new Map([["vacio", 3]]),
    new Map([["vacio", 12], ["lomo", 2]]),
  );
  const vacio = lineas.find((l) => l.productId === "vacio")!;
  assert.equal(lineas.length, 2, "una línea por producto; la de un producto borrado no se puede devolver");
  assert.equal(vacio.comprado, 15);
  assert.equal(vacio.unitCost, 6200, "(10 × 6.000 + 5 × 6.600) / 15, no el $6.600 de la última línea");
  assert.equal(vacio.yaDevuelto, 3);
  assert.equal(vacio.stock, 12);

  // Devolver 3 kg: el crédito vale 3 × $6.200 = $18.600 (con el costo de la última línea daba $19.800).
  const r = validarDevolucion([{ productId: "vacio", cantidad: "3" }], lineas);
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(valorDeLaDevolucion(r.lineas), 18600);
});

test("el where de las devoluciones es uno: el historial sin fecha y el número del Inicio desde el día 1", () => {
  assert.deepEqual(whereDevoluciones("t"), { tenantId: "t", type: "DEVOLUCION_PROVEEDOR" });
  const desde = new Date("2026-09-01T03:00:00.000Z");
  assert.deepEqual(whereDevoluciones("t", desde), { tenantId: "t", type: "DEVOLUCION_PROVEEDOR", createdAt: { gte: desde } });
});

// ── La devolución entera, con la transacción real (`registrarDevolucionEnTx`) ─────
//
// Un doble de transacción que hace lo que hace Postgres con estas consultas. Que una devolución
// rechazada no deje nada escrito lo garantiza la transacción de `registrarDevolucion`; acá se
// prueba que se rechaza ANTES de escribir cuando una línea no sirve.

function compraDoble(stockInicial: Record<string, number>) {
  const stock = new Map(Object.entries(stockInicial));
  const movimientos: Record<string, unknown>[] = [];
  const caja: Record<string, unknown>[] = [];
  const tx = {
    stockPurchase: {
      findFirst: async () => ({
        id: "compra-1",
        code: 42,
        supplier: "Frigorífico X",
        items: [
          { productId: "vacio", name: "Vacío", unit: "kg", quantity: 10, unitCost: 6000 },
          { productId: "lomo", name: "Lomo", unit: "kg", quantity: 2, unitCost: 9000 },
          { productId: "vacio", name: "Vacío", unit: "kg", quantity: 5, unitCost: 6600 },
          { productId: "entrana", name: "Entraña", unit: "kg", quantity: 3, unitCost: 8000 },
        ],
      }),
    },
    stockMovement: {
      groupBy: async () => [],
      create: async (a: { data: Record<string, unknown> }) => {
        movimientos.push(a.data);
        return a.data;
      },
    },
    product: {
      findMany: async () => [...stock.entries()].map(([id, s]) => ({ id, stock: s })),
      updateMany: async (a: { where: { id: string; stock?: { gte: number } }; data: { stock: number | { increment: number } } }) => {
        const actual = stock.get(a.where.id)!;
        if (a.where.stock && actual < a.where.stock.gte) return { count: 0 };
        stock.set(a.where.id, typeof a.data.stock === "number" ? a.data.stock : actual + a.data.stock.increment);
        return { count: 1 };
      },
      findUnique: async (a: { where: { id: string } }) => ({ stock: stock.get(a.where.id)! }),
    },
    accountPayable: { findFirst: async () => null },
    cashMovement: {
      findFirst: async () => null, // sin corte inicial
      create: async (a: { data: Record<string, unknown> }) => {
        caja.push(a.data);
        return a.data;
      },
    },
    auditLog: { findFirst: async () => null }, // ningún día cerrado
    cashSession: { findFirst: async () => ({ id: "turno-1" }) },
  };
  return { tx: tx as unknown as Prisma.TransactionClient, stock, movimientos, caja };
}

test("devolución de 3 líneas con una inválida: se rechaza con el error EN esa línea y no se escribe nada", async () => {
  const w = compraDoble({ vacio: 15, lomo: 2, entrana: 1 });
  await assert.rejects(
    registrarDevolucionEnTx(w.tx, "t-qa", {
      purchaseId: "compra-1",
      motivo: "vino con olor",
      lineas: [
        { productId: "vacio", cantidad: "3" },
        { productId: "lomo", cantidad: "1" },
        { productId: "entrana", cantidad: "2" }, // hay 1 kg en stock
      ],
      destino: { tipo: "caja", method: "EFECTIVO" },
      by: "user:duena",
    }),
    (err: unknown) => {
      assert.ok(err instanceof DevolucionRechazada);
      assert.deepEqual(err.errores.map((e) => e.productId), ["entrana"]);
      return true;
    },
  );
  assert.deepEqual(w.movimientos, [], "ninguna línea salió del stock");
  assert.deepEqual(w.caja, [], "ni entró plata a la caja");
  assert.equal(w.stock.get("vacio"), 15);
});

test("devolución válida a caja: sale del stock al costo PROMEDIO de la compra y entra el reintegro en el turno abierto", async () => {
  const w = compraDoble({ vacio: 15, lomo: 2, entrana: 3 });
  const r = await registrarDevolucionEnTx(w.tx, "t-qa", {
    purchaseId: "compra-1",
    motivo: null,
    lineas: [
      { productId: "vacio", cantidad: "3" },
      { productId: "lomo", cantidad: "1" },
    ],
    destino: { tipo: "caja", method: "EFECTIVO" },
    by: "user:duena",
  });
  // 3 kg × $6.200 (promedio de 10 a $6.000 y 5 a $6.600) + 1 kg × $9.000.
  assert.equal(r.total, 27600);
  assert.equal(r.lineas, 2);
  assert.deepEqual(
    w.movimientos.map((m) => [m.productId, m.qty, m.unitCost, m.type, m.purchaseId]),
    [
      ["vacio", -3, 6200, "DEVOLUCION_PROVEEDOR", "compra-1"],
      ["lomo", -1, 9000, "DEVOLUCION_PROVEEDOR", "compra-1"],
    ],
  );
  assert.equal(w.stock.get("vacio"), 12);
  assert.equal(w.caja.length, 1);
  assert.equal(w.caja[0].type, "INGRESO");
  assert.equal(w.caja[0].amount, 27600);
  assert.equal(w.caja[0].method, "EFECTIVO");
  assert.equal(w.caja[0].sessionId, "turno-1");
  assert.equal(w.caja[0].createdBy, `${REINTEGRO_ACTOR_PREFIX}compra-1`);
});

test("descontar de la deuda sin una deuda abierta: se rechaza con qué hacer (la transacción deshace el stock)", async () => {
  const w = compraDoble({ vacio: 15, lomo: 2, entrana: 3 });
  await assert.rejects(
    registrarDevolucionEnTx(w.tx, "t-qa", {
      purchaseId: "compra-1",
      motivo: null,
      lineas: [{ productId: "vacio", cantidad: "1" }],
      destino: { tipo: "deuda" },
      by: "user:duena",
    }),
    /no tiene una deuda abierta/,
  );
  assert.deepEqual(w.caja, []);
});

test("cuentas a pagar: el crédito de una devolución se lee 'Nota de crédito por devolución', no 'Transferencia'", () => {
  // La nota con que la devolución graba el crédito contra la deuda (registrarDevolucionEnTx).
  const nota = `${NOTA_DE_CREDITO_PREFIX} — compra #12 (vencido)`;
  assert.equal(medioDelPago("TRANSFERENCIA", nota), "Nota de crédito por devolución");
  // Un pago de verdad sigue diciendo su medio.
  assert.equal(medioDelPago("TRANSFERENCIA", "pago parcial"), "Transferencia");
  assert.equal(medioDelPago("EFECTIVO", null), "Efectivo");
  assert.equal(medioDelPago("MERCADOPAGO", undefined), "Mercado Pago");
});
