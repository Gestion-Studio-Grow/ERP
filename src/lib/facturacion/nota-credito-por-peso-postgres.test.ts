// NOTA DE CRÉDITO (SIMULADA) POR LA DEVOLUCIÓN POR PESO contra una base de verdad (Postgres del
// arnés o PGlite: `node scripts/qa/p1-pglite.mjs src/lib/facturacion/nota-credito-por-peso-postgres.test.ts`).
//
// Circuito real: alta (`insertOrder`) → cobro (`cobrarPedidoEnTx`) → factura del pedido
// (`createInvoice`, origen ORDER) autorizada por el SIMULADOR (`StubAfipClient`, CAE «STUB…») →
// ajuste por peso (`ajustarPesoInTx`) → nota (`notaDeCreditoPorPeso`) → despacho (simulador).
// Se prueba: NC por la diferencia, doble intento = una NC, sin factura = sin NC, nunca más que el
// saldo, la NC que no sale deja la devolución hecha y queda pendiente, y beauty-spa (el otro
// negocio) intacto. Nunca toca Neon ni ARCA.

import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { apuntarLaAppA, baseEfimeraParaElTest, prismaComoDuenio, type NegocioDePrueba } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";
import { StubAfipClient } from "@/plugins/arca/afip/stub";
import { fechaFiscalDelDia } from "@/lib/libros/fecha-fiscal";

test("NC simulada por la devolución por peso: por la diferencia, una sola, sin factura no hay, tope de saldo, pendiente", async (t) => {
  const base = await baseEfimeraParaElTest(t);
  if (!base) return;
  prepararAccionesDeServidor();
  apuntarLaAppA(base);
  const duenio = await prismaComoDuenio(base);
  const { a, b } = base;
  await duenio.tenant.update({ where: { id: b.id }, data: { slug: "beauty-spa" } });

  const { tenantTransaction } = await import("@/lib/rls");
  const { insertOrder, cobrarPedidoEnTx } = await import("@/lib/order-core");
  const { createInvoice, crearNotaDeCredito, numeroUsadoPorOtraFactura } = await import("@/lib/invoice-core");
  const dispatch = await import("@/lib/arca-dispatch");
  const { ajustarPesoInTx, AjusteCobradoRechazado, mensajeDelAjuste } = await import("@/lib/ajuste-peso-cobrado");
  const nc = await import("./nota-credito-por-peso");
  const { todayInBusinessTz } = await import("@/lib/datetime");
  const hoy = todayInBusinessTz();
  const HOY = fechaFiscalDelDia();

  // Un simulador por negocio (recuerda su numeración entre despachos, como ARCA).
  const stubs = new Map<string, StubAfipClient>();
  const despDeps = {
    clientePara: (tenantId: string) =>
      stubs.get(tenantId) ?? stubs.set(tenantId, new StubAfipClient({ cuit: 20111111112, homologacion: true })).get(tenantId)!,
    numeroUsadoPorOtraFactura,
  };
  const despachar = (tenantId: string) => dispatch.procesarEnviosDelNegocio(tenantId, 20, despDeps);
  const deps = { enModoPrueba: async () => true, procesarEnviosDelNegocio: despachar };

  const producto = (n: NegocioDePrueba) =>
    duenio.product.create({
      data: { tenantId: n.id, name: "Vacío", unit: "kg", saleUnit: "WEIGHT", pricePerKg: 10000, price: 10000, stock: 50, trackStock: true, active: true },
      select: { id: true },
    });
  const vacioA = await producto(a);
  const vacioB = await producto(b);
  const tomar = async (n: NegocioDePrueba, productId: string, qty: number) => {
    const r = await ejecutarAccion({ negocio: n }, () =>
      insertOrder(n.id, {
        channel: "COUNTER", fulfillment: "PICKUP", customerName: "Marta", customerPhone: "", address: null, notes: null,
        scheduledFor: null, paid: false, paymentMethod: null, items: [{ productId, qty }],
      }),
    );
    assert.equal(r.tipo, "respuesta");
    return (r as { valor: Awaited<ReturnType<typeof insertOrder>> }).valor;
  };
  const cobrar = (n: NegocioDePrueba, orderId: string) =>
    tenantTransaction((tx) => cobrarPedidoEnTx(tx, n.id, { orderId, method: "EFECTIVO", actor: `user:${n.duenia.id}` }), { tenantId: n.id });
  /** La Factura C del pedido, autorizada por el simulador. */
  const facturar = async (n: NegocioDePrueba, orderId: string, total: number) => {
    const id = await createInvoice({
      tenantId: n.id, concepto: 1, fecha: HOY,
      emisor: { cuit: 20111111112, condicionIva: "MONOTRIBUTO", puntoVenta: 1 },
      receptor: { docTipo: 99, docNro: 0, condicionIva: "CONSUMIDOR_FINAL" },
      neto: total, iva: [{ alicuotaId: 3, base: total, importe: 0 }], total, vencimientoPago: HOY,
      origin: { type: "ORDER", id: orderId },
    });
    await despachar(n.id);
    const f = await duenio.invoice.findUniqueOrThrow({ where: { id }, select: { status: true, cae: true } });
    assert.equal(f.status, "AUTHORIZED");
    assert.match(f.cae ?? "", /^STUB/, "la factura la autorizó el simulador");
    return id;
  };
  const ajustar = (orderId: string, qty: number, clave: string, arcaSimulado = true) =>
    tenantTransaction(
      (tx) =>
        ajustarPesoInTx(tx, a.id, {
          orderId, pedidas: [{ productId: vacioA.id, qty }], actor: `user:${a.duenia.id}`, permiteNegativo: () => false,
          clave, cerradoHasta: null, hoy, ahora: new Date(), arcaSimulado,
        }),
      { tenantId: a.id },
    );
  const notasDe = (facturaId: string) =>
    duenio.invoice.findMany({ where: { comprobanteAsociadoId: facturaId }, select: { id: true, total: true, status: true, cae: true } });

  // beauty-spa: su propia venta facturada (simulada). Lo que haga Magra no la toca.
  const pb = await tomar(b, vacioB.id, 1);
  await cobrar(b, pb.id);
  await facturar(b, pb.id, 10000);
  const fotoB = async () => ({
    facturas: await duenio.invoice.count({ where: { tenantId: b.id } }),
    caja: await duenio.cashMovement.count({ where: { tenantId: b.id } }),
    rastro: await duenio.auditLog.count({ where: { tenantId: b.id, entity: "NotaCreditoPorPeso" } }),
  });
  const antesB = await fotoB();

  // ── 1. Facturado y pesó MENOS: $ 12.400 → $ 11.000. Devolución $ 1.400 y NC simulada por $ 1.400. ──
  const p1 = await tomar(a, vacioA.id, 1.24);
  await cobrar(a, p1.id);
  const f1 = await facturar(a, p1.id, 12400);
  const clave = `clic-${randomUUID()}`;
  const r1 = await ajustar(p1.id, 1.1, clave);
  assert.deepEqual(r1.diferencia, { tipo: "devolver", monto: 1400 });
  assert.equal(r1.notaDeCredito?.estado, "pendiente");
  const pendiente = r1.notaDeCredito as { estado: "pendiente"; clave: string; importe: number };
  assert.equal(pendiente.importe, 1400);

  // Doble intento a la vez: UNA nota.
  const [n1, n2] = await Promise.all([nc.notaDeCreditoPorPeso(a.id, pendiente.clave, deps), nc.notaDeCreditoPorPeso(a.id, pendiente.clave, deps)]);
  assert.equal(n1?.estado, "emitida");
  assert.equal(n2?.estado, "emitida");
  if (n1?.estado === "emitida" && n2?.estado === "emitida") assert.equal(n1.invoiceId, n2.invoiceId);
  await despachar(a.id);
  let notas = await notasDe(f1);
  assert.equal(notas.length, 1);
  assert.equal(Number(notas[0].total), 1400, "la NC es por la diferencia devuelta");
  assert.equal(notas[0].status, "AUTHORIZED");
  assert.match(notas[0].cae ?? "", /^STUB/, "la NC queda marcada simulada (CAE del simulador)");
  assert.equal(Number((await duenio.cashMovement.findFirstOrThrow({ where: { tenantId: a.id, orderId: p1.id, type: "EGRESO" } })).amount), 1400);

  // El mismo clic otra vez (y el reintento automático): la misma nota, ninguna nueva.
  const r1b = await ajustar(p1.id, 1.1, clave);
  assert.equal(r1b.repetido, true);
  const n3 = await nc.notaDeCreditoPorPeso(a.id, pendiente.clave, deps);
  assert.equal(n3?.estado === "emitida" && n3.yaExistia, true);
  assert.equal((await nc.reintentarNotasPorPesoPendientes(a.id, { deps })).probadas, 0);
  notas = await notasDe(f1);
  assert.equal(notas.length, 1);
  assert.match(mensajeDelAjuste({ ...r1, notaDeCredito: n3 }), /nota de crédito por \$\s?1\.400,00 \(de prueba/);

  // ── 2. Sin factura: devuelve la plata y dice explícito que no hay nota. ──
  const p2 = await tomar(a, vacioA.id, 1);
  await cobrar(a, p2.id);
  const r2 = await ajustar(p2.id, 0.8, `sin-${randomUUID()}`);
  assert.deepEqual(r2.notaDeCredito, { estado: "sin-factura" });
  assert.match(mensajeDelAjuste(r2), /no tenía factura: no hace falta nota de crédito/);

  // ── 3. Fuera de modo prueba, la venta facturada se rechaza como siempre (ninguna NC real). ──
  const p3 = await tomar(a, vacioA.id, 1);
  await cobrar(a, p3.id);
  const f3 = await facturar(a, p3.id, 10000);
  await assert.rejects(ajustar(p3.id, 0.8, `real-${randomUUID()}`, false), (e: unknown) => e instanceof AjusteCobradoRechazado && e.motivo === "facturada");
  // Pesó MÁS con factura: una factura emitida no se agranda; nada escrito.
  await assert.rejects(ajustar(p3.id, 1.2, `mas-${randomUUID()}`), (e: unknown) => e instanceof AjusteCobradoRechazado && e.motivo === "facturada-peso-mas");
  assert.equal(await duenio.cashMovement.count({ where: { tenantId: a.id, orderId: p3.id, type: "EGRESO" } }), 0);
  assert.equal(Number((await duenio.order.findUniqueOrThrow({ where: { id: p3.id }, select: { total: true } })).total), 10000);
  assert.equal((await notasDe(f3)).length, 0);

  // ── 4. Tope de saldo + la NC que no sale queda pendiente (la devolución no se revierte). ──
  const p4 = await tomar(a, vacioA.id, 1.24);
  await cobrar(a, p4.id);
  const f4 = await facturar(a, p4.id, 12400);
  const manual = await crearNotaDeCredito({ tenantId: a.id, facturaId: f4, importe: 12000, motivo: "anulación parcial", fecha: HOY });
  assert.equal(manual.ok, true);
  const r4 = await ajustar(p4.id, 1.1, `tope-${randomUUID()}`);
  const p4nota = r4.notaDeCredito as { estado: "pendiente"; clave: string };
  // El negocio no está en modo prueba al emitir: no sale, y la devolución ya está en la caja.
  assert.equal(await nc.notaDeCreditoPorPeso(a.id, p4nota.clave, { ...deps, enModoPrueba: async () => false }), null);
  assert.equal(await duenio.cashMovement.count({ where: { tenantId: a.id, orderId: p4.id, type: "EGRESO" } }), 1);
  assert.equal((await notasDe(f4)).length, 1, "sólo la manual");
  // El reintento la emite, recortada a lo que quedaba por anular ($ 400, no $ 1.400).
  const re = await nc.reintentarNotasPorPesoPendientes(a.id, { deps });
  assert.deepEqual(re, { probadas: 1, emitidas: 1, rechazadas: 0, errores: 0 });
  const totales = (await notasDe(f4)).map((n) => Number(n.total)).sort((x, y) => x - y);
  assert.deepEqual(totales, [400, 12000]);

  // ── 5. beauty-spa intacto. ──
  assert.deepEqual(await fotoB(), antesB);
});
