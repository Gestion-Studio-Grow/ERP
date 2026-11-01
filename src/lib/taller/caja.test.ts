import { test } from "node:test";
import assert from "node:assert/strict";
import { detalleDelCobro, importeDeCaja, metodoDeCaja, repuestosADescontar } from "./caja";

test("caja: cada medio del taller cae en su columna del libro", () => {
  assert.equal(metodoDeCaja("EFECTIVO"), "EFECTIVO");
  assert.equal(metodoDeCaja("TRANSFERENCIA"), "MP");
  assert.equal(metodoDeCaja("MERCADO_PAGO"), "MP");
  assert.equal(metodoDeCaja("DEBITO"), "TARJETA");
  assert.equal(metodoDeCaja("CREDITO"), "TARJETA");
});

test("caja: al libro entra lo que se cobró de verdad, con el recargo de la tarjeta", () => {
  assert.equal(importeDeCaja(32000, 4800), 36800);
  assert.equal(importeDeCaja(69500, 0), 69500);
  assert.equal(detalleDelCobro(12, "AG555ZZ", "Seña"), "Taller · orden #12 · AG555ZZ · Seña");
  assert.equal(detalleDelCobro(12, "AG555ZZ"), "Taller · orden #12 · AG555ZZ");
});

test("stock: sólo salen los repuestos del catálogo, aprobados y puestos por el taller; se suman por producto", () => {
  const base = { tipo: "REPUESTO", decision: "APROBADO", productId: "p1", traidoPorCliente: false, cantidad: 1, descripcion: "Filtro" };
  const salidas = repuestosADescontar([
    base,
    { ...base, cantidad: 2 },
    { ...base, productId: "p2", descripcion: "Aceite", cantidad: 4 },
    { ...base, productId: "p3", decision: "RECHAZADO" },
    { ...base, productId: "p4", decision: "PENDIENTE" },
    { ...base, productId: "p5", traidoPorCliente: true },
    { ...base, productId: null },
    { ...base, productId: "p6", tipo: "MANO_OBRA" },
  ]);
  assert.deepEqual(salidas, [
    { productId: "p1", qty: 3, label: "Filtro" },
    { productId: "p2", qty: 4, label: "Aceite" },
  ]);
});

test("lo que asentó el Taller no se borra desde el libro, y un egreso tipeado a mano sí", async () => {
  const { readFileSync } = await import("node:fs");
  const { motivoParaNoBorrar, movimientoDelLedger } = await import("@/lib/caja/libro-caja");
  // Tal como los escribe este módulo: firmados con el usuario, sin `orderId`.
  const reversa = { type: "EGRESO" as const, orderId: null, createdBy: "user:u1", tallerPagoId: "p1" };
  assert.match(motivoParaNoBorrar(reversa) ?? "", /anulación de un cobro del Taller/);
  assert.match(motivoParaNoBorrar({ ...reversa, type: "VENTA" }) ?? "", /cobro del Taller.*desde la orden/);
  assert.equal(motivoParaNoBorrar({ ...reversa, tallerPagoId: null }), null, "el egreso a mano se sigue pudiendo borrar");
  const fila = { id: "m", occurredAt: new Date(), method: "EFECTIVO" as const, amount: 10, reason: "x", ...reversa };
  assert.equal(movimientoDelLedger(fila).borrable, false, "el libro no ofrece borrarlo");
  // La lista y la acción de borrar leen la columna que lo dice.
  const acciones = readFileSync(new URL("../libro-caja-actions.ts", import.meta.url), "utf8");
  assert.match(acciones, /createdBy: true,\s+tallerPagoId: true,\s+collectionId:/);
  assert.match(acciones, /createdBy: found\.createdBy, tallerPagoId: found\.tallerPagoId \}/);
});

test("una transferencia del taller va a su columna si el libro la tiene; si no, sigue en MP", async () => {
  const { asentarCobroInTx } = await import("./caja");
  const { olvidarTransferenciaEnElLibro } = await import("@/lib/caja/transferencia-en-el-libro");
  assert.equal(metodoDeCaja("TRANSFERENCIA", true), "TRANSFERENCIA");
  assert.equal(metodoDeCaja("MERCADO_PAGO", true), "MP", "Mercado Pago no se mueve");
  const asentar = async (medio: "TRANSFERENCIA" | "MERCADO_PAGO", valorEnLaBase: boolean) => {
    olvidarTransferenciaEnElLibro();
    const escritos: { method: string }[] = [];
    const tx = {
      cashMovement: { findFirst: async () => null, create: async (a: { data: { method: string } }) => void escritos.push(a.data) },
      cashSession: { findFirst: async () => null },
      $queryRawUnsafe: async () => (valorEnLaBase ? [{}] : []),
    };
    await asentarCobroInTx(tx as never, "t", { pagoId: "p", medio, monto: 100, recargo: 0, detalle: "d", actor: "user:u" });
    olvidarTransferenciaEnElLibro();
    return escritos[0].method;
  };
  assert.equal(await asentar("TRANSFERENCIA", true), "TRANSFERENCIA");
  assert.equal(await asentar("TRANSFERENCIA", false), "MP", "sin el paquete, el valor no existe en la base");
  assert.equal(await asentar("MERCADO_PAGO", true), "MP");
});
