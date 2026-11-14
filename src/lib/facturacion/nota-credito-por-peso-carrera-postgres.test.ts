// CARRERA: doble envío de la devolución por peso de una venta con factura SIMULADA, contra Postgres.
// El mismo formulario enviado dos veces a la vez (misma clave) y dos pestañas con pesos distintos
// (claves distintas), cada uno seguido de su nota de crédito, como hace `updateOrderItems`.
// Se exige: UN egreso, UNA anotación pendiente, UNA nota de crédito y NC == egreso al centavo.
// Nunca toca Neon ni ARCA (simulador).

import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { apuntarLaAppA, baseEfimeraParaElTest, prismaComoDuenio } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";
import { StubAfipClient } from "@/plugins/arca/afip/stub";
import { fechaFiscalDelDia } from "@/lib/libros/fecha-fiscal";

test("carrera: doble envío de la devolución por peso con factura simulada = una devolución y una NC", async (t) => {
  const base = await baseEfimeraParaElTest(t);
  if (!base) return;
  prepararAccionesDeServidor();
  apuntarLaAppA(base);
  const duenio = await prismaComoDuenio(base);
  const { a } = base;

  const { tenantTransaction } = await import("@/lib/rls");
  const { insertOrder, cobrarPedidoEnTx } = await import("@/lib/order-core");
  const { createInvoice, numeroUsadoPorOtraFactura } = await import("@/lib/invoice-core");
  const dispatch = await import("@/lib/arca-dispatch");
  const { ajustarPesoInTx } = await import("@/lib/ajuste-peso-cobrado");
  const nc = await import("./nota-credito-por-peso");
  const { todayInBusinessTz } = await import("@/lib/datetime");
  const hoy = todayInBusinessTz();
  const HOY = fechaFiscalDelDia();

  const stub = new StubAfipClient({ cuit: 20111111112, homologacion: true });
  const despachar = (tenantId: string) =>
    dispatch.procesarEnviosDelNegocio(tenantId, 20, { clientePara: () => stub, numeroUsadoPorOtraFactura });
  const deps = { enModoPrueba: async () => true, procesarEnviosDelNegocio: despachar };

  const vacio = await duenio.product.create({
    data: { tenantId: a.id, name: "Vacío", unit: "kg", saleUnit: "WEIGHT", pricePerKg: 10000, price: 10000, stock: 50, trackStock: true, active: true },
    select: { id: true },
  });
  /** Pedido de `qty` kg, cobrado en efectivo y con su Factura C autorizada por el simulador. */
  const ventaFacturada = async (qty: number, total: number) => {
    const r = await ejecutarAccion({ negocio: a }, () =>
      insertOrder(a.id, {
        channel: "COUNTER", fulfillment: "PICKUP", customerName: "Marta", customerPhone: "", address: null, notes: null,
        scheduledFor: null, paid: false, paymentMethod: null, items: [{ productId: vacio.id, qty }],
      }),
    );
    assert.equal(r.tipo, "respuesta");
    const pedido = (r as { valor: Awaited<ReturnType<typeof insertOrder>> }).valor;
    await tenantTransaction((tx) => cobrarPedidoEnTx(tx, a.id, { orderId: pedido.id, method: "EFECTIVO", actor: `user:${a.duenia.id}` }), { tenantId: a.id });
    const facturaId = await createInvoice({
      tenantId: a.id, concepto: 1, fecha: HOY,
      emisor: { cuit: 20111111112, condicionIva: "MONOTRIBUTO", puntoVenta: 1 },
      receptor: { docTipo: 99, docNro: 0, condicionIva: "CONSUMIDOR_FINAL" },
      neto: total, iva: [{ alicuotaId: 3, base: total, importe: 0 }], total, vencimientoPago: HOY,
      origin: { type: "ORDER", id: pedido.id },
    });
    await despachar(a.id);
    assert.match((await duenio.invoice.findUniqueOrThrow({ where: { id: facturaId } })).cae ?? "", /^STUB/);
    return { orderId: pedido.id, facturaId };
  };
  /** Un envío del formulario «Pesar y ajustar»: el ajuste en su tx y después la NC en la suya. */
  const enviar = async (orderId: string, qty: number, clave: string) => {
    const out = await tenantTransaction(
      (tx) =>
        ajustarPesoInTx(tx, a.id, {
          orderId, pedidas: [{ productId: vacio.id, qty }], actor: `user:${a.duenia.id}`, permiteNegativo: () => false,
          clave, cerradoHasta: null, hoy, ahora: new Date(), arcaSimulado: true,
        }),
      { tenantId: a.id },
    );
    if (out.notaDeCredito?.estado === "pendiente") await nc.notaDeCreditoPorPeso(a.id, out.notaDeCredito.clave, deps);
    return out;
  };
  const foto = async (orderId: string, facturaId: string) => {
    await despachar(a.id);
    const egresos = await duenio.cashMovement.findMany({ where: { tenantId: a.id, orderId, type: "EGRESO" }, select: { amount: true } });
    const notas = await duenio.invoice.findMany({ where: { tenantId: a.id, comprobanteAsociadoId: facturaId }, select: { total: true, status: true } });
    const pendientes = await duenio.auditLog.count({ where: { tenantId: a.id, entity: "NotaCreditoPorPeso", action: "nc_peso_pendiente" } });
    return { egresos: egresos.map((e) => Number(e.amount)), notas: notas.map((n) => [Number(n.total), n.status]), pendientes };
  };

  await t.test("mismo formulario enviado dos veces a la vez (misma clave): una devolución, una NC", async () => {
    const { orderId, facturaId } = await ventaFacturada(1.24, 12400);
    const antes = await duenio.auditLog.count({ where: { tenantId: a.id, entity: "NotaCreditoPorPeso", action: "nc_peso_pendiente" } });
    const clave = `clic-${randomUUID()}`;
    const rs = await Promise.allSettled([enviar(orderId, 1.1, clave), enviar(orderId, 1.1, clave)]);
    assert.ok(rs.some((r) => r.status === "fulfilled"), "al menos un envío se completa");
    const f = await foto(orderId, facturaId);
    assert.deepEqual(f.egresos, [1400], "un solo egreso, por la diferencia");
    assert.deepEqual(f.notas, [[1400, "AUTHORIZED"]], "una sola NC, igual al egreso");
    assert.equal(f.pendientes - antes, 1, "una sola anotación pendiente");
  });

  await t.test("dos pestañas con pesos distintos (claves distintas): gana una, una NC igual a su egreso", async () => {
    const { orderId, facturaId } = await ventaFacturada(1.5, 15000);
    const antes = await duenio.auditLog.count({ where: { tenantId: a.id, entity: "NotaCreditoPorPeso", action: "nc_peso_pendiente" } });
    const rs = await Promise.allSettled([enviar(orderId, 1.2, `tab1-${randomUUID()}`), enviar(orderId, 1.0, `tab2-${randomUUID()}`)]);
    assert.equal(rs.filter((r) => r.status === "fulfilled").length, 1, "una pestaña gana y la otra se rechaza");
    const f = await foto(orderId, facturaId);
    assert.equal(f.egresos.length, 1, "un solo egreso");
    assert.ok(f.egresos[0] === 3000 || f.egresos[0] === 5000, `egreso por una de las dos diferencias (${f.egresos[0]})`);
    assert.deepEqual(f.notas, [[f.egresos[0], "AUTHORIZED"]], "una sola NC, igual al egreso");
    assert.equal(f.pendientes - antes, 1, "una sola anotación pendiente");
    const factura = await duenio.invoice.findUniqueOrThrow({ where: { id: facturaId }, select: { total: true } });
    assert.ok(Number(factura.total) - f.egresos[0] > 0, "la factura no queda anulada de más");
  });
});
