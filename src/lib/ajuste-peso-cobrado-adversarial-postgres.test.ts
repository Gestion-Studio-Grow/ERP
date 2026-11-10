// Ataques de la certificación adversarial del ajuste por peso (F1: el mismo pago de MP no cobra dos veces).
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { apuntarLaAppA, baseEfimeraParaElTest, prismaComoDuenio } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";

test("ataques", async (t) => {
  const base = await baseEfimeraParaElTest(t);
  assert.ok(base, "la base efímera tiene que existir");
  if (!base) return;
  prepararAccionesDeServidor();
  apuntarLaAppA(base);
  const duenio = await prismaComoDuenio(base);
  const { a } = base;
  const { tenantTransaction } = await import("@/lib/rls");
  const { insertOrder, cobrarPedidoEnTx, cobrarPedidoPorAvisoDePago } = await import("@/lib/order-core");
  const { ajustarPesoInTx } = await import("@/lib/ajuste-peso-cobrado");
  const { anularVentaInTx } = await import("@/lib/order-anulacion");
  const { isFrozenDay } = await import("@/lib/caja/cierre-diario");
  const { todayInBusinessTz, dateStrInBusinessTz } = await import("@/lib/datetime");
  const { runInTenantContext } = await import("@/lib/tenant-context");
  const hoy = todayInBusinessTz();
  const actor = `user:${a.duenia.id}`;
  const pollo = await duenio.product.create({
    data: { tenantId: a.id, name: "Pollo", unit: "u", saleUnit: "UNIT", price: 10000, stock: 50, trackStock: true, active: true },
    select: { id: true },
  });
  const tomar = async (qty: number) => {
    const r = await ejecutarAccion({ negocio: a }, () =>
      insertOrder(a.id, { channel: "COUNTER", fulfillment: "PICKUP", customerName: "Marta", customerPhone: "", address: null, notes: null, scheduledFor: null, paid: false, paymentMethod: null, items: [{ productId: pollo.id, qty }] }),
    );
    return (r as unknown as { valor: { id: string; code: number } }).valor;
  };
  const ajustar = (orderId: string, qty: number) =>
    tenantTransaction((tx) => ajustarPesoInTx(tx, a.id, { orderId, pedidas: [{ productId: pollo.id, qty }], actor, permiteNegativo: () => false, clave: `k-${randomUUID()}`, cerradoHasta: null, hoy, ahora: new Date() }), { tenantId: a.id });
  const anular = (orderId: string) =>
    tenantTransaction((tx) => anularVentaInTx(tx, a.id, { orderId, motivo: "x", actor, devuelveStock: true, diaCerradoHasta: null, esDiaCerrado: isFrozenDay, diaDe: (d: Date) => dateStrInBusinessTz(d) }), { tenantId: a.id });
  const neto = async (orderIds: string[]) => {
    const filas = await duenio.cashMovement.findMany({ where: { tenantId: a.id }, select: { type: true, amount: true, orderId: true, collectionId: true, collection: { select: { orderId: true } } } });
    const mine = filas.filter((f) => (f.orderId && orderIds.includes(f.orderId)) || (f.collection?.orderId && orderIds.includes(f.collection.orderId)));
    return { n: mine.length, neto: Math.round(mine.reduce((s, f) => s + (f.type === "VENTA" ? 1 : -1) * Number(f.amount) * 100, 0)) / 100 };
  };
  const aviso = (orderId: string, paymentId: string, monto: number) => runInTenantContext(a.id, () => cobrarPedidoPorAvisoDePago({ tenantId: a.id, orderId, paymentId, monto }));

  // ── A. Reenvío del aviso de MP del pago ORIGINAL después de «pesó más» (1 pollo → 2: saldo = lo pagado).
  await t.test("A: aviso MP repetido tras pesó más no cobra el saldo", async () => {
    const p = await tomar(1);
    const r1 = await aviso(p.id, "PAY-1", 10000);
    assert.equal(r1.cobrado, true, JSON.stringify(r1));
    const aj = await ajustar(p.id, 2);
    assert.deepEqual(aj.diferencia, { tipo: "cobrar", monto: 10000 });
    const r2 = await aviso(p.id, "PAY-1", 10000); // MISMO pago reenviado (otro x-request-id)
    const o = await duenio.order.findUniqueOrThrow({ where: { id: p.id }, select: { paid: true } });
    const ventas = await neto([p.id]);
    assert.equal(r2.cobrado, false, `el mismo pago PAY-1 cobró el saldo: paid=${o.paid} libro=${JSON.stringify(ventas)}`);
  });

  // ── B. Pesó más y se anula ANTES de cobrar el saldo: sale lo cobrado, ni más ni menos.
  await t.test("B: anular pesó-más sin saldo cobrado", async () => {
    const p = await tomar(1);
    await tenantTransaction((tx) => cobrarPedidoEnTx(tx, a.id, { orderId: p.id, method: "EFECTIVO", actor }), { tenantId: a.id });
    await ajustar(p.id, 3);
    const an = await anular(p.id);
    assert.equal(an.applied, true);
    assert.deepEqual(await neto([p.id]), { n: 2, neto: 0 });
  });

  // ── C. Pesó menos, saldo luego anular (cobro con efectivo).
  await t.test("C: pesó menos + anular = neto 0", async () => {
    const p = await tomar(3);
    await tenantTransaction((tx) => cobrarPedidoEnTx(tx, a.id, { orderId: p.id, method: "EFECTIVO", actor }), { tenantId: a.id });
    await ajustar(p.id, 1);
    await anular(p.id);
    const all = await duenio.cashMovement.findMany({ where: { tenantId: a.id, reason: { contains: `#${p.code}` } }, select: { type: true, amount: true } });
    const n = Math.round(all.reduce((s, f) => s + (f.type === "VENTA" ? 1 : -1) * Number(f.amount) * 100, 0)) / 100;
    assert.equal(n, 0, JSON.stringify(all));
  });

  // ── D. Carrera ajuste (pesó más) vs anulación en paralelo.
  await t.test("D: Promise.all ajuste + anulación", async () => {
    const p = await tomar(1);
    await tenantTransaction((tx) => cobrarPedidoEnTx(tx, a.id, { orderId: p.id, method: "EFECTIVO", actor }), { tenantId: a.id });
    await Promise.allSettled([ajustar(p.id, 2), anular(p.id)]);
    const all = await duenio.cashMovement.findMany({ where: { tenantId: a.id, reason: { contains: `#${p.code}` } }, select: { type: true, amount: true } });
    const n = Math.round(all.reduce((s, f) => s + (f.type === "VENTA" ? 1 : -1) * Number(f.amount) * 100, 0)) / 100;
    assert.equal(n, 0, JSON.stringify(all));
  });

  // ── E. Carrera pesó menos vs anulación en paralelo.
  await t.test("E: Promise.all pesó menos + anulación", async () => {
    const p = await tomar(3);
    await tenantTransaction((tx) => cobrarPedidoEnTx(tx, a.id, { orderId: p.id, method: "EFECTIVO", actor }), { tenantId: a.id });
    await Promise.allSettled([ajustar(p.id, 1), anular(p.id)]);
    const all = await duenio.cashMovement.findMany({ where: { tenantId: a.id, reason: { contains: `#${p.code}` } }, select: { type: true, amount: true } });
    const n = Math.round(all.reduce((s, f) => s + (f.type === "VENTA" ? 1 : -1) * Number(f.amount) * 100, 0)) / 100;
    assert.equal(n, 0, JSON.stringify(all));
  });
  void runInTenantContext;
});
