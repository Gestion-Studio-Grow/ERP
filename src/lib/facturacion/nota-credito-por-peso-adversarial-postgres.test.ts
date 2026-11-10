// Ataques de la certificación a la NC simulada por peso (hallazgo 1: el cron ve las pendientes nuevas).
//   node scripts/qa/p1-pglite.mjs <este archivo>
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { apuntarLaAppA, baseEfimeraParaElTest, prismaComoDuenio, type NegocioDePrueba } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";
import { StubAfipClient } from "@/plugins/arca/afip/stub";
import { fechaFiscalDelDia } from "@/lib/libros/fecha-fiscal";

test("adversarial NC por peso", async (t) => {
  const base = await baseEfimeraParaElTest(t);
  if (!base) return;
  prepararAccionesDeServidor();
  apuntarLaAppA(base);
  const duenio = await prismaComoDuenio(base);
  const { a, b } = base;

  const { tenantTransaction } = await import("@/lib/rls");
  const { insertOrder, cobrarPedidoEnTx } = await import("@/lib/order-core");
  const { createInvoice, crearNotaDeCredito, numeroUsadoPorOtraFactura } = await import("@/lib/invoice-core");
  const dispatch = await import("@/lib/arca-dispatch");
  const { ajustarPesoInTx } = await import("@/lib/ajuste-peso-cobrado");
  const nc = await import("@/lib/facturacion/nota-credito-por-peso");
  const { todayInBusinessTz } = await import("@/lib/datetime");
  const hoy = todayInBusinessTz();
  const HOY = fechaFiscalDelDia();

  const stubs = new Map<string, StubAfipClient>();
  const despDeps = {
    clientePara: (tenantId: string) =>
      stubs.get(tenantId) ?? stubs.set(tenantId, new StubAfipClient({ cuit: 20111111112, homologacion: true })).get(tenantId)!,
    numeroUsadoPorOtraFactura,
  };
  const despachar = (tenantId: string) => dispatch.procesarEnviosDelNegocio(tenantId, 50, despDeps);
  const deps = { enModoPrueba: async () => true, procesarEnviosDelNegocio: despachar };
  const fuera = { ...deps, enModoPrueba: async () => false };

  const producto = (n: NegocioDePrueba, precio: number) =>
    duenio.product.create({
      data: { tenantId: n.id, name: "Vacío", unit: "kg", saleUnit: "WEIGHT", pricePerKg: precio, price: precio, stock: 500, trackStock: true, active: true },
      select: { id: true },
    });
  const tomar = async (n: NegocioDePrueba, productId: string, qty: number) => {
    const r = await ejecutarAccion({ negocio: n }, () =>
      insertOrder(n.id, {
        channel: "COUNTER", fulfillment: "PICKUP", customerName: "Marta", customerPhone: "", address: null, notes: null,
        scheduledFor: null, paid: false, paymentMethod: null, items: [{ productId, qty }],
      }),
    );
    assert.equal(r.tipo, "respuesta");
    return (r as { valor: { id: string } }).valor;
  };
  const cobrar = (n: NegocioDePrueba, orderId: string) =>
    tenantTransaction((tx) => cobrarPedidoEnTx(tx, n.id, { orderId, method: "EFECTIVO", actor: `user:${n.duenia.id}` }), { tenantId: n.id });
  const facturar = async (n: NegocioDePrueba, orderId: string) => {
    const total = Number((await duenio.order.findUniqueOrThrow({ where: { id: orderId }, select: { total: true } })).total);
    const id = await createInvoice({
      tenantId: n.id, concepto: 1, fecha: HOY,
      emisor: { cuit: 20111111112, condicionIva: "MONOTRIBUTO", puntoVenta: 1 },
      receptor: { docTipo: 99, docNro: 0, condicionIva: "CONSUMIDOR_FINAL" },
      neto: total, iva: [{ alicuotaId: 3, base: total, importe: 0 }], total, vencimientoPago: HOY,
      origin: { type: "ORDER", id: orderId },
    });
    await despachar(n.id);
    return { id, total };
  };
  const ajustar = (n: NegocioDePrueba, productId: string, orderId: string, qty: number) =>
    tenantTransaction(
      (tx) =>
        ajustarPesoInTx(tx, n.id, {
          orderId, pedidas: [{ productId, qty }], actor: `user:${n.duenia.id}`, permiteNegativo: () => false,
          clave: `c-${randomUUID()}`, cerradoHasta: null, hoy, ahora: new Date(), arcaSimulado: true,
        }),
      { tenantId: n.id },
    );
  const notasDe = (facturaId: string) =>
    duenio.invoice.findMany({ where: { comprobanteAsociadoId: facturaId }, select: { total: true, status: true, cae: true } });

  const vA = await producto(a, 7777.77);

  await t.test("decimales: NC == EGRESO al centavo", async () => {
    const p = await tomar(a, vA.id, 1.333);
    await cobrar(a, p.id);
    const f = await facturar(a, p.id);
    const r = await ajustar(a, vA.id, p.id, 1.111);
    assert.equal(r.diferencia?.tipo, "devolver");
    const k = (r.notaDeCredito as { clave: string }).clave;
    const n = await nc.notaDeCreditoPorPeso(a.id, k, deps);
    assert.equal(n?.estado, "emitida");
    const eg = Number((await duenio.cashMovement.findFirstOrThrow({ where: { tenantId: a.id, orderId: p.id, type: "EGRESO" } })).amount);
    const notas = await notasDe(f.id);
    assert.equal(notas.length, 1);
    assert.equal(Math.round(Number(notas[0].total) * 100), Math.round(eg * 100), `NC ${notas[0].total} vs EGRESO ${eg}`);
  });

  await t.test("factura ya anulada entera: el ajuste se rechaza y la caja no devuelve nada", async () => {
    const p = await tomar(a, vA.id, 1);
    await cobrar(a, p.id);
    const f = await facturar(a, p.id);
    const m = await crearNotaDeCredito({ tenantId: a.id, facturaId: f.id, motivo: "anula todo", fecha: HOY });
    assert.equal(m.ok, true);
    await assert.rejects(() => ajustar(a, vA.id, p.id, 0.5), /anulada entera/);
    const egresos = await duenio.cashMovement.count({ where: { tenantId: a.id, orderId: p.id, type: "EGRESO" } });
    assert.equal(egresos, 0);
  });

  await t.test("aislamiento: clave de A pedida desde B = null; pendiente forjada en B con factura de A = rechazada", async () => {
    const p = await tomar(a, vA.id, 1);
    await cobrar(a, p.id);
    const f = await facturar(a, p.id);
    const r = await ajustar(a, vA.id, p.id, 0.9);
    const k = (r.notaDeCredito as { clave: string }).clave;
    assert.equal(await nc.notaDeCreditoPorPeso(b.id, k, deps), null);
    const forj = `ajuste-peso:nc:x:${randomUUID()}`;
    await duenio.auditLog.create({ data: { tenantId: b.id, actor: "x", action: "nc_peso_pendiente", entity: "NotaCreditoPorPeso", entityId: forj, channel: "admin", changes: { orderId: p.id, egresoId: "e", facturaId: f.id, importe: 100, code: 1 } } });
    const nb = await nc.notaDeCreditoPorPeso(b.id, forj, deps);
    assert.equal(nb?.estado, "rechazada");
    assert.equal((await notasDe(f.id)).length, 0, "B no emitió NC sobre la factura de A");
    await nc.notaDeCreditoPorPeso(a.id, k, deps);
  });

  await t.test("cron: ventana take:1000 asc deja ciega a la pendiente nueva", async () => {
    const viejo = new Date(Date.now() - 86400000);
    await duenio.auditLog.createMany({
      data: Array.from({ length: 1000 }, (_, i) => ({ tenantId: a.id, actor: "system", action: i % 2 ? "nc_peso_emitida" : "nc_peso_pendiente", entity: "NotaCreditoPorPeso", entityId: `viejo-${Math.floor(i / 2)}`, channel: "admin", changes: { notaId: "x" }, createdAt: viejo })),
    });
    const p = await tomar(a, vA.id, 1);
    await cobrar(a, p.id);
    const f = await facturar(a, p.id);
    const r = await ajustar(a, vA.id, p.id, 0.8);
    const k = (r.notaDeCredito as { clave: string }).clave;
    assert.equal(await nc.notaDeCreditoPorPeso(a.id, k, fuera), null, "el clic no la emite (fuera de modo prueba en ese instante)");
    const re = await nc.reintentarNotasPorPesoPendientes(a.id, { deps });
    console.log("# ventana-1000: reintento", JSON.stringify(re), "notas", (await notasDe(f.id)).length);
    assert.equal(re.probadas, 1, "el cron debería ver la pendiente nueva");
  });
});
