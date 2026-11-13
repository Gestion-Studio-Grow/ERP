// Riesgos de plata del pedido con una parte ya cobrada (ajuste por peso, D9), EJECUTADOS contra Postgres:
//
//   · D1  el aviso del cierre del día («ventas sin cobrar», «envíos sin rendir», «pagados de más») cuenta
//         el SALDO de cada pedido, no su total: lo ya cobrado no se alerta otra vez;
//   · D2  el aviso de Mercado Pago cobra por el saldo; por el total (viejo o nuevo) es «monto-distinto»; y
//         el monto se vuelve a mirar ADENTRO de la transacción (un ajuste entre la lectura y el cobro no
//         deja una VENTA por un monto que Mercado Pago no cobró);
//   · D3  carreras con Promise.all: dos ajustes del mismo pedido cobrado; ajuste + cobro del saldo; ajuste +
//         aviso de Mercado Pago. Un solo EGRESO de devolución, una sola VENTA de saldo, caja al centavo.
//
// Con el Postgres del arnés (CI, o uno local) las transacciones corren de verdad en paralelo (dos
// conexiones; el candado es la fila del pedido). En PGlite (`node scripts/qa/p1-pglite.mjs`) los
// mensajes se atienden de a uno: ahí se prueba el RESULTADO, no la carrera.
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { apuntarLaAppA, baseEfimeraParaElTest, prismaComoDuenio, type NegocioDePrueba } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";

test("contra Postgres: saldo de un pedido con parte cobrada (cierre, aviso de MP, carreras)", async (t) => {
  const base = await baseEfimeraParaElTest(t);
  if (!base) return;
  prepararAccionesDeServidor();
  apuntarLaAppA(base);
  Object.assign(process.env as Record<string, string | undefined>, { DB_CONNECTION_LIMIT: process.env.ERP_TEST_DB_CONNECTION_LIMIT ?? "6", DB_CONNECT_TIMEOUT_MS: "3000" });
  const duenio = await prismaComoDuenio(base);
  const { a, b } = base;
  const { tenantTransaction } = await import("@/lib/rls");
  const { insertOrder, cobrarPedidoEnTx, cobrarPedidoPorAvisoDePago } = await import("@/lib/order-core");
  type Deps = NonNullable<Parameters<typeof cobrarPedidoPorAvisoDePago>[1]>;
  const { ajustarPesoInTx, claveCobradoAntesDePesar } = await import("@/lib/ajuste-peso-cobrado");
  const { aCobrarDelPedido, cobradoDelPedido, claveDelSaldoDelPedido } = await import("@/lib/settlement/saldo-del-pedido");
  const { AJUSTE_PESO_ACTOR_PREFIX } = await import("@/lib/caja/devolucion-por-peso");
  const { getCierreDiarioData } = await import("@/lib/cierre-diario-actions");
  const { todayInBusinessTz } = await import("@/lib/datetime");
  const { runInTenantContext } = await import("@/lib/tenant-context");
  const hoy = todayInBusinessTz();
  const actor = `user:${a.duenia.id}`;

  const pollo = await duenio.product.create({
    data: { tenantId: a.id, name: "Pollo", unit: "u", saleUnit: "UNIT", price: 10000, stock: 500, trackStock: true, active: true },
    select: { id: true },
  });
  const tomar = async (qty: number, negocio: NegocioDePrueba = a, productId = pollo.id) => {
    const r = await ejecutarAccion({ negocio }, () =>
      insertOrder(negocio.id, { channel: "COUNTER", fulfillment: "PICKUP", customerName: "Marta", customerPhone: "", address: null, notes: null, scheduledFor: null, paid: false, paymentMethod: null, items: [{ productId, qty }] }),
    );
    return (r as unknown as { valor: { id: string; code: number } }).valor;
  };
  const ajustar = (orderId: string, qty: number) =>
    tenantTransaction(
      (tx) => ajustarPesoInTx(tx, a.id, { orderId, pedidas: [{ productId: pollo.id, qty }], actor, permiteNegativo: () => false, clave: `k-${randomUUID()}`, cerradoHasta: null, hoy, ahora: new Date() }),
      { tenantId: a.id },
    );
  const cobrar = (orderId: string, method: "EFECTIVO" | "MERCADOPAGO" = "EFECTIVO", quien = actor) =>
    tenantTransaction((tx) => cobrarPedidoEnTx(tx, a.id, { orderId, method, actor: quien }), { tenantId: a.id });
  const aviso = (orderId: string, paymentId: string, monto: number, deps?: Deps) =>
    runInTenantContext(a.id, () => cobrarPedidoPorAvisoDePago({ tenantId: a.id, orderId, paymentId, monto }, deps));
  const hoja = async () => {
    const r = await ejecutarAccion({ negocio: a, usuario: a.duenia }, () => getCierreDiarioData(hoy, { conTurnosSinCerrar: true, esperadoALaVista: true }));
    assert.equal(r.tipo, "respuesta", `getCierreDiarioData cortó con ${r.tipo}`);
    const h = (r as unknown as { valor: Awaited<ReturnType<typeof getCierreDiarioData>> }).valor.hechos;
    assert.ok(h, "la hoja del cierre trae los hechos");
    return h;
  };
  const centavos = (n: number) => Math.round(n * 100);
  /** El libro del pedido (con `orderId` o colgado de un cobro suyo) y su neto al centavo. */
  const libro = async (orderId: string) => {
    const filas = await duenio.cashMovement.findMany({
      where: { tenantId: a.id, OR: [{ orderId }, { collection: { is: { orderId } } }] },
      select: { type: true, amount: true, createdBy: true, collectionId: true },
    });
    const neto = filas.reduce((s, f) => s + (f.type === "VENTA" ? 1 : -1) * centavos(Number(f.amount)), 0) / 100;
    return {
      filas,
      neto,
      devoluciones: filas.filter((f) => f.type === "EGRESO" && String(f.createdBy).startsWith(AJUSTE_PESO_ACTOR_PREFIX)).length,
      ventasDeSaldo: filas.filter((f) => f.type === "VENTA" && f.collectionId != null).length,
      ventas: filas.filter((f) => f.type === "VENTA").length,
    };
  };
  /** La caja cuadra: lo neto del libro es lo que el pedido dice que entró (total si está cobrado, lo cobrado si no). */
  const cuadra = async (orderId: string) => {
    const o = await duenio.order.findUniqueOrThrow({ where: { id: orderId }, select: { paid: true, total: true } });
    const l = await libro(orderId);
    const esperado = o.paid ? Number(o.total) : await cobradoDelPedido(duenio, a.id, orderId);
    assert.equal(centavos(l.neto), centavos(esperado), `caja descuadrada: neto ${l.neto} vs ${esperado} (paid=${o.paid}) ${JSON.stringify(l.filas)}`);
    return { ...l, paid: o.paid, total: Number(o.total) };
  };

  // ── D1 · el aviso del cierre cuenta el SALDO ───────────────────────────────
  await t.test("D1: ventas sin cobrar y envíos sin rendir suman el saldo; la devolución por peso no es «pagado de más»", async () => {
    const antes = await hoja();
    // Cobrado por $20.000, pesó más ($30.000): falta $10.000, no $30.000.
    const p = await tomar(2);
    await cobrar(p.id);
    const aj = await ajustar(p.id, 3);
    assert.deepEqual(aj.diferencia, { tipo: "cobrar", monto: 10000 });
    // Sale con el cadete y no se rinde.
    await duenio.order.update({ where: { id: p.id }, data: { fulfillment: "DELIVERY" } });
    await duenio.auditLog.create({
      data: { tenantId: a.id, actor: "user:x", action: "reparto", entity: "Order", entityId: p.id, channel: "admin", changes: { tipo: "salio", reparto: "r1", franja: null, cadete: "Juan" } },
    });
    // Cobrado por $30.000, pesó menos ($10.000): salió la devolución de $20.000 hoy.
    const q = await tomar(3);
    await cobrar(q.id);
    assert.deepEqual((await ajustar(q.id, 1)).diferencia, { tipo: "devolver", monto: 20000 });

    const despues = await hoja();
    assert.equal(despues.ventasSinCobrar.cantidad, antes.ventasSinCobrar.cantidad + 1);
    assert.equal(centavos(despues.ventasSinCobrar.monto - antes.ventasSinCobrar.monto), centavos(10000), "ventas sin cobrar: el saldo, no el total");
    assert.equal(despues.repartoSinRendir.cantidad, antes.repartoSinRendir.cantidad + 1);
    assert.equal(centavos(despues.repartoSinRendir.monto - antes.repartoSinRendir.monto), centavos(10000), "envío sin rendir: el saldo, no el total");
    assert.deepEqual(despues.pagadosDeMas, antes.pagadosDeMas, "la diferencia ya se devolvió: no es un vuelto que salió");
  });

  // ── D2 · el aviso de Mercado Pago cobra por el saldo ───────────────────────
  await t.test("D2: aviso por el saldo cobra; por el total viejo o el nuevo, «monto-distinto»", async () => {
    const p = await tomar(2);
    assert.equal((await aviso(p.id, "PAY-D2-1", 20000)).cobrado, true);
    assert.deepEqual((await ajustar(p.id, 3)).diferencia, { tipo: "cobrar", monto: 10000 });
    const viejo = await aviso(p.id, "PAY-D2-2", 20000);
    assert.equal(viejo.cobrado, false);
    assert.equal(!viejo.cobrado && viejo.motivo, "monto-distinto");
    const nuevo = await aviso(p.id, "PAY-D2-2", 30000);
    assert.equal(!nuevo.cobrado && nuevo.motivo, "monto-distinto");
    const saldo = await aviso(p.id, "PAY-D2-2", 10000);
    assert.deepEqual(saldo, { cobrado: true, code: p.code, total: 10000 });
    const repetido = await aviso(p.id, "PAY-D2-2", 10000);
    assert.equal(!repetido.cobrado && repetido.motivo, "ya-cobrado");
    const l = await cuadra(p.id);
    assert.equal(l.paid, true);
    assert.equal(l.ventas, 2);
    assert.equal(l.ventasDeSaldo, 1);
    assert.equal(l.neto, 30000);
  });

  await t.test("D2: un ajuste entre la lectura del aviso y el cobro no deja una VENTA por lo que MP no cobró", async () => {
    const p = await tomar(1);
    // El pedido se pesa (1 → 2) justo después de que el aviso leyó $10.000.
    const deps: Deps = {
      leerPedido: async (tenantId, orderId) => {
        const o = await duenio.order.findFirst({ where: { tenantId, id: orderId }, select: { id: true, code: true, total: true, paid: true, status: true } });
        if (!o) return null;
        const leido = { code: o.code, total: o.paid ? Number(o.total) : await aCobrarDelPedido(duenio, tenantId, { id: o.id, total: Number(o.total) }), paid: o.paid, status: o.status };
        await ajustar(orderId, 2);
        return leido;
      },
      cerradoHasta: async () => null,
      hoy: () => hoy,
      cobrar: (tenantId, args) => tenantTransaction((tx) => cobrarPedidoEnTx(tx, tenantId, args), { tenantId }),
      auditar: async () => {},
    };
    const r = await aviso(p.id, "PAY-D2-3", 10000, deps);
    assert.equal(!r.cobrado && r.motivo, "monto-distinto", JSON.stringify(r));
    const o = await duenio.order.findUniqueOrThrow({ where: { id: p.id }, select: { paid: true, total: true } });
    assert.equal(o.paid, false, "no se cobró solo");
    assert.equal(Number(o.total), 20000);
    assert.equal((await libro(p.id)).filas.length, 0, "ni un asiento");
  });

  // ── D3 · carreras ──────────────────────────────────────────────────────────
  await t.test("D3(i): dos ajustes a la vez del mismo pedido cobrado (pesó menos): una sola devolución", async () => {
    const p = await tomar(3);
    await cobrar(p.id);
    const rs = await Promise.allSettled([ajustar(p.id, 1), ajustar(p.id, 2)]);
    assert.equal(rs.filter((r) => r.status === "fulfilled").length, 1, JSON.stringify(rs.map((r) => (r.status === "rejected" ? String(r.reason) : "ok"))));
    const l = await cuadra(p.id);
    assert.equal(l.devoluciones, 1);
    assert.equal(l.ventas, 1);
  });

  await t.test("D3(i): dos ajustes a la vez del mismo pedido cobrado (pesó más): un solo «cobrado antes de pesar»", async () => {
    const p = await tomar(1);
    await cobrar(p.id);
    const rs = await Promise.allSettled([ajustar(p.id, 2), ajustar(p.id, 3)]);
    assert.equal(rs.filter((r) => r.status === "fulfilled").length, 1);
    const cobros = await duenio.collection.findMany({ where: { tenantId: a.id, orderId: p.id }, select: { idempotencyKey: true } });
    assert.deepEqual(cobros.map((c) => c.idempotencyKey), [claveCobradoAntesDePesar(p.id)]);
    const l = await cuadra(p.id);
    assert.equal(l.paid, false);
    assert.equal(l.devoluciones, 0);
  });

  await t.test("D3(ii): ajuste (pesó más) + cobro en caja a la vez: lo cobrado más el saldo, ni un peso más", async () => {
    const p = await tomar(1);
    await cobrar(p.id);
    await Promise.allSettled([ajustar(p.id, 2), cobrar(p.id)]);
    // Si el cobro llegó antes que el ajuste, era «ya cobrado»: el saldo se cobra ahora.
    await cobrar(p.id);
    const l = await cuadra(p.id);
    assert.equal(l.paid, true);
    assert.equal(l.ventasDeSaldo, 1);
    assert.equal(l.neto, 20000);
  });

  await t.test("D3(ii): dos cobros del saldo a la vez (caja + aviso MP): una sola VENTA de saldo", async () => {
    const p = await tomar(1);
    await cobrar(p.id);
    await ajustar(p.id, 2);
    const rs = await Promise.allSettled([cobrar(p.id), aviso(p.id, "PAY-D3-1", 10000), cobrar(p.id, "MERCADOPAGO", "user:otra")]);
    assert.ok(rs.every((r) => r.status === "fulfilled"), JSON.stringify(rs.map((r) => (r.status === "rejected" ? String(r.reason) : "ok"))));
    const saldos = await duenio.collection.count({ where: { tenantId: a.id, idempotencyKey: claveDelSaldoDelPedido(p.id) } });
    assert.equal(saldos, 1);
    const l = await cuadra(p.id);
    assert.equal(l.ventasDeSaldo, 1);
    assert.equal(l.neto, 20000);
  });

  await t.test("D3(ii): ajuste de un pedido sin cobrar + aviso de MP a la vez: la VENTA es lo que MP cobró o no hay VENTA", async () => {
    for (let i = 0; i < 4; i++) {
      const p = await tomar(1);
      const [, r] = await Promise.allSettled([ajustar(p.id, 2), aviso(p.id, `PAY-D3-2-${i}`, 10000)]);
      assert.equal(r.status, "fulfilled", r.status === "rejected" ? String(r.reason) : "");
      const res = (r as PromiseFulfilledResult<Awaited<ReturnType<typeof aviso>>>).value;
      const l = await cuadra(p.id);
      const ventaMp = l.filas.filter((f) => f.type === "VENTA" && f.createdBy === `mercadopago:PAY-D3-2-${i}`);
      if (res.cobrado) {
        // El cobro ganó: VENTA de $10.000 y el ajuste vino después (pesó más → falta $10.000).
        assert.deepEqual(ventaMp.map((f) => Number(f.amount)), [10000]);
        assert.equal(l.neto, 10000);
      } else {
        assert.equal(res.motivo, "monto-distinto", JSON.stringify(res));
        assert.equal(ventaMp.length, 0);
        assert.equal(l.filas.length, 0);
      }
    }
  });

  // ── Sin cobros parciales (CH, beauty-spa, y cualquier negocio sin ajuste por peso): el mismo número de siempre.
  await t.test("no-cambio: un negocio sin cobros parciales ve en el cierre la suma de los totales, como antes", async () => {
    const prod = await duenio.product.create({
      data: { tenantId: b.id, name: "Masaje", unit: "u", saleUnit: "UNIT", price: 7000, stock: 50, trackStock: false, active: true },
      select: { id: true },
    });
    await tomar(2, b, prod.id);
    const r = await ejecutarAccion({ negocio: b, usuario: b.duenia }, () => getCierreDiarioData(hoy, { conTurnosSinCerrar: true, esperadoALaVista: true }));
    const h = (r as unknown as { valor: Awaited<ReturnType<typeof getCierreDiarioData>> }).valor.hechos!;
    const desde = new Date(Date.now() - 36 * 3600 * 1000);
    const sinCobrar = await duenio.order.findMany({ where: { tenantId: b.id, paid: false, status: { not: "CANCELLED" }, createdAt: { gte: desde } }, select: { total: true, createdAt: true } });
    const { dateStrInBusinessTz } = await import("@/lib/datetime");
    const deHoy = sinCobrar.filter((o) => dateStrInBusinessTz(o.createdAt) === hoy);
    assert.deepEqual(h.ventasSinCobrar, { cantidad: deHoy.length, monto: deHoy.reduce((s, o) => s + centavos(Number(o.total)), 0) / 100 });
  });
});
