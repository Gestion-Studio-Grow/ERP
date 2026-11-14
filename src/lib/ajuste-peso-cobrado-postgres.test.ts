// AJUSTE POR PESO REAL DE UN PEDIDO YA COBRADO contra una base de verdad (Postgres del arnés o
// PGlite: `node scripts/qa/p1-pglite.mjs src/lib/ajuste-peso-cobrado-postgres.test.ts`).
//
// Se recorre el circuito real: alta en el mostrador (`insertOrder`) → cobro (`cobrarPedidoEnTx`,
// la VENTA del libro) → ajuste (`ajustarPesoInTx`, la misma tx que la bandeja) → anulación
// (`anularVentaInTx`). Lo que se prueba es la plata: el doble clic deja UNA devolución, el
// segundo ajuste se rechaza, el día cerrado no recibe la devolución, la anulación posterior no
// devuelve dos veces, el pedido que pesó más cobra sólo el saldo, y el otro negocio no se toca.
// Nunca toca Neon: el arnés exige un servidor local. Con PGlite la RLS no se aplica y las
// conexiones se atienden de a una: la concurrencia real la prueba el Postgres del arnés.

import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { apuntarLaAppA, baseEfimeraParaElTest, prismaComoDuenio } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";

test("ajuste de un pedido cobrado: devolución única, segundo rechazado, anular no devuelve dos veces, saldo", async (t) => {
  const base = await baseEfimeraParaElTest(t);
  if (!base) return;
  prepararAccionesDeServidor();
  apuntarLaAppA(base);
  const duenio = await prismaComoDuenio(base);
  const { a, b } = base;

  const { tenantTransaction } = await import("@/lib/rls");
  const { insertOrder, cobrarPedidoEnTx } = await import("@/lib/order-core");
  const { ajustarPesoInTx, AjusteCobradoRechazado } = await import("./ajuste-peso-cobrado");
  const { anularVentaInTx } = await import("./order-anulacion");
  const { aCobrarDelPedido } = await import("./settlement/saldo-del-pedido");
  const { isFrozenDay } = await import("./caja/cierre-diario");
  const { todayInBusinessTz, dateStrInBusinessTz } = await import("@/lib/datetime");
  const hoy = todayInBusinessTz();
  const actor = `user:${a.duenia.id}`;

  const vacio = await duenio.product.create({
    data: { tenantId: a.id, name: "Vacío", unit: "kg", saleUnit: "WEIGHT", pricePerKg: 10000, price: 10000, stock: 20, trackStock: true, active: true },
    select: { id: true },
  });
  const stockDe = async () => (await duenio.product.findUniqueOrThrow({ where: { id: vacio.id }, select: { stock: true } })).stock;

  const tomar = async (qty: number) => {
    const r = await ejecutarAccion({ negocio: a }, () =>
      insertOrder(a.id, {
        channel: "COUNTER",
        fulfillment: "PICKUP",
        customerName: "Marta",
        customerPhone: "",
        address: null,
        notes: null,
        scheduledFor: null,
        paid: false,
        paymentMethod: null,
        items: [{ productId: vacio.id, qty }],
      }),
    );
    assert.equal(r.tipo, "respuesta");
    return (r as { valor: Awaited<ReturnType<typeof insertOrder>> }).valor;
  };
  const cobrar = (orderId: string, method: "EFECTIVO" | "MERCADOPAGO") =>
    tenantTransaction((tx) => cobrarPedidoEnTx(tx, a.id, { orderId, method, actor }), { tenantId: a.id });
  const ajustar = (orderId: string, qty: number, clave: string, cerradoHasta: string | null = null) =>
    tenantTransaction(
      (tx) =>
        ajustarPesoInTx(tx, a.id, {
          orderId,
          pedidas: [{ productId: vacio.id, qty }],
          actor,
          permiteNegativo: () => false,
          clave,
          cerradoHasta,
          hoy,
          ahora: new Date(),
        }),
      { tenantId: a.id },
    );
  const anular = (orderId: string) =>
    tenantTransaction(
      (tx) =>
        anularVentaInTx(tx, a.id, {
          orderId,
          motivo: "La clienta no vino",
          actor,
          devuelveStock: true,
          diaCerradoHasta: null,
          esDiaCerrado: isFrozenDay,
          diaDe: (d: Date) => dateStrInBusinessTz(d),
        }),
      { tenantId: a.id },
    );
  const libroDeA = () => duenio.cashMovement.findMany({ where: { tenantId: a.id }, select: { type: true, amount: true, method: true, orderId: true, collectionId: true, reason: true } });
  const suma = (filas: { type: string; amount: unknown }[], type: string) =>
    Math.round(filas.filter((f) => f.type === type).reduce((s, f) => s + Number(f.amount) * 100, 0)) / 100;
  const libroDeB = await duenio.cashMovement.count({ where: { tenantId: b.id } });
  const pedidosDeB = await duenio.order.count({ where: { tenantId: b.id } });

  // ── 1. Pesó MENOS: 1,24 kg cobrados ($ 12.400), pesó 1,10 kg ($ 11.000) → se devuelven $ 1.400. ──
  const p1 = await tomar(1.24);
  const c1 = await cobrar(p1.id, "MERCADOPAGO");
  assert.equal(c1.tipo, "cobrado");
  assert.equal(suma(await libroDeA(), "VENTA"), 12400);

  // Con el día de hoy ya cerrado, la devolución no entra: rechazo y NADA escrito (ni líneas).
  await assert.rejects(ajustar(p1.id, 1.1, `cerrado-${randomUUID()}`, hoy), (e: unknown) => e instanceof AjusteCobradoRechazado && e.motivo === "dia-cerrado");
  assert.equal(suma(await libroDeA(), "EGRESO"), 0);
  assert.equal(Number((await duenio.order.findUniqueOrThrow({ where: { id: p1.id }, select: { total: true } })).total), 12400);

  // Doble clic: dos envíos con la MISMA clave a la vez → UNA devolución y el mismo resultado.
  const clave = `clic-${randomUUID()}`;
  const [r1, r2] = await Promise.all([ajustar(p1.id, 1.1, clave), ajustar(p1.id, 1.1, clave)]);
  assert.deepEqual(r1.diferencia, { tipo: "devolver", monto: 1400 });
  assert.deepEqual(r2.diferencia, r1.diferencia);
  assert.equal([r1, r2].filter((r) => r.repetido).length, 1, "uno asentó y el otro leyó lo asentado");
  assert.equal(r1.porMercadoPago, true);
  let libro = await libroDeA();
  const egresos = libro.filter((f) => f.type === "EGRESO");
  assert.equal(egresos.length, 1);
  assert.equal(Number(egresos[0].amount), 1400);
  assert.equal(egresos[0].orderId, p1.id);
  assert.equal(egresos[0].method, "MP");
  assert.match(egresos[0].reason ?? "", /devolver por Mercado Pago \(a mano\)/);
  // La VENTA original no se reescribió.
  assert.equal(suma(libro, "VENTA"), 12400);
  const o1 = await duenio.order.findUniqueOrThrow({ where: { id: p1.id }, select: { total: true, paid: true } });
  assert.equal(Number(o1.total), 11000);
  assert.equal(o1.paid, true);
  assert.equal(await stockDe(), 20 - 1.1);

  // Segundo ajuste con plata (otra clave): rechazado, «anulá y rehacé».
  await assert.rejects(ajustar(p1.id, 1.0, `otra-${randomUUID()}`), (e: unknown) => e instanceof AjusteCobradoRechazado && e.motivo === "ya-ajustado");
  assert.equal(suma(await libroDeA(), "EGRESO"), 1400);

  // Anular después: sale sólo lo que quedó en la caja ($ 11.000). En total salió lo cobrado, no más.
  const an1 = await anular(p1.id);
  assert.equal(an1.applied, true);
  libro = await libroDeA();
  assert.equal(suma(libro, "EGRESO"), 12400, "devolución + anulación = lo cobrado, ni un peso más");
  assert.equal(await stockDe(), 20);

  // ── 2. Pesó MÁS: 1 kg cobrado ($ 10.000), pesó 1,25 kg ($ 12.500) → quedan $ 2.500 a cobrar. ──
  const p2 = await tomar(1);
  await cobrar(p2.id, "EFECTIVO");
  const r3 = await ajustar(p2.id, 1.25, `mas-${randomUUID()}`);
  assert.deepEqual(r3.diferencia, { tipo: "cobrar", monto: 2500 });
  const o2 = await duenio.order.findUniqueOrThrow({ where: { id: p2.id }, select: { total: true, paid: true } });
  assert.equal(o2.paid, false, "vuelve a «sin cobrar» por el saldo");
  assert.equal(Number(o2.total), 12500);
  assert.equal(await aCobrarDelPedido(duenio, a.id, { id: p2.id, total: 12500 }), 2500);
  // Lo ya pagado quedó como cobro del pedido, sin asiento nuevo (su plata ya está en la VENTA).
  const ventasAntes = suma(await libroDeA(), "VENTA");
  // Cobrar ahora cobra sólo el saldo.
  const c2 = await cobrar(p2.id, "EFECTIVO");
  assert.equal(c2.tipo, "cobrado");
  assert.equal(c2.tipo === "cobrado" ? c2.order.total : 0, 2500);
  assert.equal(Math.round((suma(await libroDeA(), "VENTA") - ventasAntes) * 100) / 100, 2500);
  // Un segundo ajuste del que pesó más también se rechaza.
  await assert.rejects(ajustar(p2.id, 1.3, `mas2-${randomUUID()}`), (e: unknown) => e instanceof AjusteCobradoRechazado);
  // Anular: salen los $ 12.500 (lo cobrado antes + el saldo), ni más ni menos.
  const egresosAntes = suma(await libroDeA(), "EGRESO");
  await anular(p2.id);
  assert.equal(Math.round((suma(await libroDeA(), "EGRESO") - egresosAntes) * 100) / 100, 12500);

  // ── 3. El otro negocio no se enteró. ──
  assert.equal(await duenio.cashMovement.count({ where: { tenantId: b.id } }), libroDeB);
  assert.equal(await duenio.order.count({ where: { tenantId: b.id } }), pedidosDeB);
  assert.equal(await duenio.collection.count({ where: { tenantId: b.id } }), 0);
});
