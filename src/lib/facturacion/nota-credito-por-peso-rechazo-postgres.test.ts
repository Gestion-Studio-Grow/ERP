// NOTA DE CRÉDITO POR PESO RECHAZADA EN EL DESPACHO: se vuelve a emitir, una sola vez por rechazo.
// Antes, una nota que el despacho rechazaba quedaba «emitida» para siempre: el reintento no la
// veía (`nc_peso_emitida` cerraba la clave) y la lista de Facturación tampoco, así que lo devuelto
// en la caja quedaba sin nota. Se exige, contra Postgres y con el simulador (nunca Neon ni ARCA):
//   · tras el rechazo, el reintento emite UNA nota nueva por el mismo importe;
//   · dos reintentos a la vez (cron + «Pesar y ajustar») no emiten dos;
//   · un reintento repetido después no emite otra;
//   · al tope de intentos se cierra y aparece en la lista para que la resuelva un humano.

import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { apuntarLaAppA, baseEfimeraParaElTest, prismaComoDuenio } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";
import { StubAfipClient } from "@/plugins/arca/afip/stub";
import { fechaFiscalDelDia } from "@/lib/libros/fecha-fiscal";

test("nota por peso rechazada en el despacho: se reintenta, sin duplicar y con tope", async (t) => {
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
  const { MAX_INTENTOS_NC_PESO } = await import("./nota-credito-por-peso-core");
  const { todayInBusinessTz } = await import("@/lib/datetime");
  const hoy = todayInBusinessTz();
  const HOY = fechaFiscalDelDia();

  const stub = new StubAfipClient({ cuit: 20111111112, homologacion: true });
  const despachar = (tenantId: string) =>
    dispatch.procesarEnviosDelNegocio(tenantId, 20, { clientePara: () => stub, numeroUsadoPorOtraFactura });
  // El despacho de la nota se hace a mano en cada caso: así la nota queda PENDING y el test decide
  // si ARCA (el simulador) la autoriza o la rechaza.
  const sinDespacho = { enModoPrueba: async () => true, procesarEnviosDelNegocio: async () => undefined };

  const vacio = await duenio.product.create({
    data: { tenantId: a.id, name: "Vacío", unit: "kg", saleUnit: "WEIGHT", pricePerKg: 10000, price: 10000, stock: 80, trackStock: true, active: true },
    select: { id: true },
  });

  /** Pedido de `qty` kg cobrado en efectivo, con su Factura C autorizada por el simulador. */
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

  /** «Pesar y ajustar» a `qty` kg: el egreso en su tx y la nota en la suya, sin despacharla. */
  const ajustar = async (orderId: string, qty: number) => {
    const clave = `rech-${randomUUID()}`;
    const out = await tenantTransaction(
      (tx) =>
        ajustarPesoInTx(tx, a.id, {
          orderId, pedidas: [{ productId: vacio.id, qty }], actor: `user:${a.duenia.id}`, permiteNegativo: () => false,
          clave, cerradoHasta: null, hoy, ahora: new Date(), arcaSimulado: true,
        }),
      { tenantId: a.id },
    );
    assert.equal(out.notaDeCredito?.estado, "pendiente");
    const claveDeLaNota = (out.notaDeCredito as { clave: string }).clave;
    const r = await nc.notaDeCreditoPorPeso(a.id, claveDeLaNota, sinDespacho);
    assert.equal(r?.estado, "emitida");
    return claveDeLaNota;
  };

  /** Lo que haría el despacho al recibir un rechazo de ARCA: la nota PENDING pasa a REJECTED. */
  const rechazarPendientes = async (facturaId: string) => {
    const n = await duenio.invoice.updateMany({
      where: { tenantId: a.id, comprobanteAsociadoId: facturaId, status: "PENDING" },
      data: { status: "REJECTED", rechazoMotivo: "10016: rechazo de prueba" },
    });
    return n.count;
  };

  const notas = async (facturaId: string) =>
    (await duenio.invoice.findMany({
      where: { tenantId: a.id, comprobanteAsociadoId: facturaId },
      orderBy: { createdAt: "asc" },
      select: { total: true, status: true },
    })).map((n) => [Number(n.total), n.status] as const);
  const vivas = (ns: readonly (readonly [number, string])[]) => ns.filter(([, s]) => s !== "REJECTED");
  const egreso = async (orderId: string) =>
    (await duenio.cashMovement.findMany({ where: { tenantId: a.id, orderId, type: "EGRESO" }, select: { amount: true } })).map((e) => Number(e.amount));

  await t.test("el despacho rechaza la nota: el reintento emite una nueva por lo devuelto", async () => {
    const { orderId, facturaId } = await ventaFacturada(1.24, 12400);
    await ajustar(orderId, 1.1);
    assert.equal(await rechazarPendientes(facturaId), 1, "la nota quedó rechazada");

    const r = await nc.reintentarNotasPorPesoPendientes(a.id, { deps: sinDespacho });
    assert.equal(r.emitidas, 1, `el reintento ve la nota rechazada y emite otra (${JSON.stringify(r)})`);
    await despachar(a.id);
    assert.deepEqual(await egreso(orderId), [1400]);
    assert.deepEqual(vivas(await notas(facturaId)), [[1400, "AUTHORIZED"]], "una sola nota viva, igual al egreso");

    const otra = await nc.reintentarNotasPorPesoPendientes(a.id, { deps: sinDespacho });
    assert.equal(otra.emitidas, 0, "con la nota nueva autorizada no se emite otra");
    assert.equal((await notas(facturaId)).length, 2, "la rechazada y la nueva, nada más");
  });

  await t.test("doble envío: cron y «Pesar y ajustar» reintentan a la vez la misma rechazada = una nota nueva", async () => {
    const { orderId, facturaId } = await ventaFacturada(1.5, 15000);
    const clave = await ajustar(orderId, 1.2);
    assert.equal(await rechazarPendientes(facturaId), 1);

    const rs = await Promise.allSettled([
      nc.reintentarNotasPorPesoPendientes(a.id, { deps: sinDespacho }),
      nc.reintentarNotasPorPesoPendientes(a.id, { deps: sinDespacho }),
      nc.notaDeCreditoPorPeso(a.id, clave, sinDespacho),
      nc.notaDeCreditoPorPeso(a.id, clave, sinDespacho),
    ]);
    assert.ok(rs.every((x) => x.status === "fulfilled"), "ningún intento revienta");
    await despachar(a.id);
    assert.deepEqual(await egreso(orderId), [3000]);
    assert.deepEqual(vivas(await notas(facturaId)), [[3000, "AUTHORIZED"]], "una sola nota nueva");
    const intentos = await duenio.auditLog.count({ where: { tenantId: a.id, entity: "NotaCreditoPorPeso", entityId: clave, action: "nc_peso_intento" } });
    assert.equal(intentos, 1, "el rechazo se cuenta una sola vez");
  });

  await t.test("al tope de rechazos se cierra, no emite más y queda en la lista para un humano", async () => {
    const { orderId, facturaId } = await ventaFacturada(1.3, 13000);
    const clave = await ajustar(orderId, 1.0);
    for (let vuelta = 0; vuelta < MAX_INTENTOS_NC_PESO + 2; vuelta++) {
      await rechazarPendientes(facturaId);
      await nc.reintentarNotasPorPesoPendientes(a.id, { deps: sinDespacho });
    }
    await rechazarPendientes(facturaId);
    const ns = await notas(facturaId);
    assert.equal(vivas(ns).length, 0, "ninguna viva: todas rechazadas");
    assert.equal(ns.length, MAX_INTENTOS_NC_PESO, `una nota por intento, nunca más que el tope (${ns.length})`);
    const cerradas = await duenio.auditLog.count({ where: { tenantId: a.id, entity: "NotaCreditoPorPeso", entityId: clave, action: "nc_peso_cerrada" } });
    assert.equal(cerradas, 1, "se cerró una vez");
    const lista = await nc.notasPorPesoCerradasSinEmitir(a.id);
    const fila = lista.find((f) => f.clave === clave);
    assert.ok(fila, "aparece en la lista de Facturación para resolverla a mano");
    assert.equal(fila.importe, 3000);
    const despues = await nc.reintentarNotasPorPesoPendientes(a.id, { deps: sinDespacho });
    assert.equal(despues.emitidas, 0, "cerrada: el reintento no la toca");
    assert.equal((await notas(facturaId)).length, MAX_INTENTOS_NC_PESO);
  });
});
