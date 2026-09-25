// ============================================================================
// Auditoría final del circuito fiscal (D1-D4) · contra Postgres real (app_rls + RLS) y el
// cliente SOAP real hablando con el simulador de ARCA (un simulador por negocio).
// ============================================================================
//
// Recorridos que los tests de cada slice no cubrían juntos:
//  · Venta → factura → envío → CAE por el camino real de la venta (`facturarOrden`: lee el
//    pedido con RLS, arma el comprobante con el perfil fiscal del negocio y despacha), y dos
//    ventas facturadas a la vez: cada una con su CAE y su número, ARCA sin CAE de más.
//  · ENG-020/021 (invoice-core.ts, cierre de envíos al volver a facturar): volver a facturar
//    la venta A, rechazada, NO cierra el envío abierto de la factura B del mismo negocio; el
//    despacho termina con A y B autorizadas, un CAE cada una.
//  · Un negocio que intenta volver a facturar la venta de otro: error, y la factura del otro
//    no cambia ni gana envíos.
//  · El comprobante con CAE que salió por el circuito: la app (app_rls) no lo puede editar ni
//    borrar, y volver a facturar la venta devuelve el mismo sin encolar nada.

import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraDelArchivo } from "@/test/base-efimera";
import { SimuladorArca } from "@/plugins/arca/afip/simulador";

const laBase = baseEfimeraDelArchivo();
const simuladores = new Map<string, SimuladorArca>();
const simDe = (tenantId: string) => {
  if (!simuladores.has(tenantId)) simuladores.set(tenantId, new SimuladorArca());
  return simuladores.get(tenantId)!;
};

async function preparar(t: import("node:test").TestContext) {
  const base = await laBase(t);
  if (!base) return null;
  apuntarLaAppA(base);
  Object.assign(process.env as Record<string, string | undefined>, {
    NODE_ENV: "development",
    DB_CONNECTION_LIMIT: "4",
    DB_CONNECT_TIMEOUT_MS: "3000",
  });
  const { operatorPrisma } = await import("@/lib/operator-db");
  const invoiceCore = await import("@/lib/invoice-core");
  const { processArcaOutbox, procesarEnviosDelNegocio } = await import("@/lib/arca-dispatch");
  const { SoapAfipClient, FetchSoapTransport } = await import("@/plugins/arca/afip/soap");

  // Cada test mira sólo lo suyo.
  await operatorPrisma.outboxEvent.updateMany({ where: { processedAt: null }, data: { processedAt: new Date() } });

  const deps = {
    clientePara: (tenantId: string) =>
      new SoapAfipClient(
        { cuit: 20111111112, homologacion: true },
        {
          transport: new FetchSoapTransport({ fetch: simDe(tenantId).fetch, timeoutMs: 200 }),
          signer: { firmarCms: async () => "CMS-DE-PRUEBA" },
        },
      ),
    numeroUsadoPorOtraFactura: invoiceCore.numeroUsadoPorOtraFactura,
  };
  const despachar = () => processArcaOutbox(20, deps);
  const facturarPago = (tenantId: string, mpPaymentId: string, total: 1210 | 2420 = 1210, reabrirSiRechazada = false) =>
    invoiceCore.createInvoice({
      tenantId,
      concepto: 1,
      fecha: "20260924",
      emisor: { cuit: 20111111112, condicionIva: "RESPONSABLE_INSCRIPTO", puntoVenta: 1 },
      receptor: { docTipo: 99, docNro: 0, condicionIva: "CONSUMIDOR_FINAL" },
      neto: total === 1210 ? 1000 : 2000,
      iva: [{ alicuotaId: 5, base: total === 1210 ? 1000 : 2000, importe: total === 1210 ? 210 : 420 }],
      total,
      ivaPorProducto: true,
      vencimientoPago: "20260924",
      origin: { type: "MP_PAYMENT" as const, id: mpPaymentId },
      ...(reabrirSiRechazada ? { reabrirSiRechazada } : {}),
    });
  const factura = (id: string) => operatorPrisma.invoice.findUniqueOrThrow({ where: { id } });
  const envios = (invoiceId: string) =>
    operatorPrisma.outboxEvent
      .findMany({ orderBy: { createdAt: "asc" } })
      .then((es) => es.filter((e) => (e.payload as { invoiceId?: string }).invoiceId === invoiceId));
  return { base, operatorPrisma, invoiceCore, deps, despachar, procesarEnviosDelNegocio, facturarPago, factura, envios };
}

async function centavosEnArca(sim: SimuladorArca, cae: string | null) {
  const { centavosDeImporteArca } = await import("@/plugins/arca/afip/soap");
  const c = sim.comprobantesAutorizados().find((x) => x.cae === cae);
  return c ? centavosDeImporteArca(c.impTotal) : null;
}

test("circuito · venta → factura → envío → CAE por el camino de la venta, y dos ventas facturadas a la vez: un CAE y un número cada una; el comprobante con CAE no se edita ni se borra desde la app", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const { prepararAccionesDeServidor, ejecutarAccion } = await import("@/test/accion-de-servidor");
  prepararAccionesDeServidor();
  const { facturarOrden } = await import("@/lib/invoice-from-order");
  const { getFiscalProfile } = await import("@/lib/fiscal");
  const { prisma } = await import("@/lib/prisma");
  const a = p.base.a;
  await p.operatorPrisma.tenant.update({ where: { id: a.id }, data: { arcaCuit: "20111111112", arcaPuntoVenta: 1 } });
  const [v1, v2, v3] = a.pedidos;
  await p.operatorPrisma.order.update({ where: { id: v1 }, data: { paid: true, total: 1210 } });
  await p.operatorPrisma.order.update({ where: { id: v2 }, data: { paid: true, total: 1500.5 } });
  await p.operatorPrisma.order.update({ where: { id: v3 }, data: { paid: true, total: 999.99 } });

  const sim = simDe(a.id);
  const antes = sim.comprobantesAutorizados().length;
  const depsVenta = {
    leerOrden: (orderId: string, tenantId: string) =>
      prisma.order
        .findFirst({ where: { id: orderId, tenantId }, select: { total: true } })
        .then((o) => (o ? { total: Number(o.total) } : null)),
    getFiscalProfile,
    createInvoice: p.invoiceCore.createInvoice,
    procesarEnviosDelNegocio: (tenantId: string) => p.procesarEnviosDelNegocio(tenantId, 20, p.deps),
  };
  const facturar = (orderId: string, reabrir = false) =>
    ejecutarAccion({ negocio: a, usuario: a.duenia }, () =>
      facturarOrden(orderId, a.id, depsVenta, reabrir ? { reabrirSiRechazada: true } : {}),
    );

  // Una venta sola, de punta a punta.
  const r1 = await facturar(v1);
  assert.equal(r1.tipo, "respuesta", JSON.stringify(r1));
  const id1 = r1.tipo === "respuesta" ? r1.valor : null;
  assert.ok(id1);
  const f1 = await p.factura(id1);
  assert.equal(f1.status, "AUTHORIZED", f1.rechazoMotivo ?? "");
  assert.ok(f1.cae);
  assert.equal(f1.orderId, v1);
  assert.equal(await centavosEnArca(sim, f1.cae), 121000, "ARCA autorizó el total de la venta");
  assert.equal(sim.comprobantesAutorizados().length, antes + 1);

  // Dos ventas a la vez (dos pestañas): cada una con su CAE y su número; ninguno de más.
  const [r2, r3] = await Promise.all([facturar(v2), facturar(v3)]);
  const id2 = r2.tipo === "respuesta" ? r2.valor : null;
  const id3 = r3.tipo === "respuesta" ? r3.valor : null;
  assert.ok(id2 && id3, JSON.stringify([r2, r3]));
  // La que no llegó a despachar en su tirada (el otro proceso tenía el candado) la termina el cron.
  await p.despachar();
  const [f2, f3] = [await p.factura(id2), await p.factura(id3)];
  assert.equal(f2.status, "AUTHORIZED", f2.rechazoMotivo ?? "");
  assert.equal(f3.status, "AUTHORIZED", f3.rechazoMotivo ?? "");
  assert.notEqual(f2.numero, f3.numero);
  assert.notEqual(f2.cae, f3.cae);
  assert.deepEqual(
    new Set([f1.numero, f2.numero, f3.numero]),
    new Set(sim.comprobantesAutorizados().slice(antes).map((c) => c.numero)),
    "los números de la base son los de ARCA",
  );
  assert.equal(sim.comprobantesAutorizados().length, antes + 3, "tres ventas, tres CAE");
  assert.equal(await centavosEnArca(sim, f2.cae), 150050);
  assert.equal(await centavosEnArca(sim, f3.cae), 99999);

  // Facturar otra vez (incluso pidiendo reabrir) devuelve el mismo comprobante y no encola nada.
  const enviosAntes = (await p.envios(id1)).length;
  const otra = await facturar(v1, true);
  assert.equal(otra.tipo === "respuesta" ? otra.valor : null, id1);
  assert.equal((await p.envios(id1)).length, enviosAntes);
  assert.equal(sim.comprobantesAutorizados().length, antes + 3);

  // La app (app_rls, con el negocio puesto) no puede editar ni borrar el comprobante con CAE.
  const { tenantTransaction } = await import("@/lib/rls");
  await assert.rejects(
    tenantTransaction((tx) => tx.invoice.update({ where: { id: id1 }, data: { total: 1 } }), { tenantId: a.id }),
    /no se puede editar/,
  );
  await assert.rejects(
    tenantTransaction((tx) => tx.invoice.update({ where: { id: id1 }, data: { status: "REJECTED" } }), { tenantId: a.id }),
    /no se puede editar/,
  );
  await assert.rejects(
    tenantTransaction((tx) => tx.invoice.delete({ where: { id: id1 } }), { tenantId: a.id }),
    /no se puede borrar/,
  );
  const intacta = await p.factura(id1);
  assert.equal(intacta.total.toString(), f1.total.toString());
  assert.equal(intacta.cae, f1.cae);
  assert.equal(intacta.status, "AUTHORIZED");
});

test("ENG-020/021 · volver a facturar la venta A rechazada no cierra el envío abierto de la factura B del mismo negocio: A y B terminan autorizadas, un CAE cada una", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const a = p.base.a.id;
  const sim = simDe(a);
  sim.fallarProximo("FECAESolicitar", { rechazo: [{ codigo: 10015, mensaje: "El campo ImpTotal no cierra con el detalle." }] });
  const idA = await p.facturarPago(a, "mp_aud_A");
  assert.equal((await p.despachar()).rechazados, 1);
  assert.equal((await p.factura(idA)).status, "REJECTED");

  const idB = await p.facturarPago(a, "mp_aud_B");
  const [envioB] = await p.envios(idB);
  assert.equal(envioB.processedAt, null);

  const antes = sim.comprobantesAutorizados().length;
  assert.equal(await p.facturarPago(a, "mp_aud_A", 2420, true), idA);

  const envioBDespues = (await p.envios(idB))[0];
  assert.equal(envioBDespues.processedAt, null, "el envío de B sigue abierto");
  assert.equal(envioBDespues.lastError, null);
  assert.equal((await p.envios(idA)).filter((e) => e.processedAt === null).length, 1, "A tiene un solo envío vivo");

  const r = await p.despachar();
  assert.equal(r.autorizados, 2, JSON.stringify(r));
  const [fA, fB] = [await p.factura(idA), await p.factura(idB)];
  assert.equal(fA.status, "AUTHORIZED");
  assert.equal(fB.status, "AUTHORIZED");
  assert.notEqual(fA.cae, fB.cae);
  assert.equal(sim.comprobantesAutorizados().length, antes + 2, "dos facturas, dos CAE");
  assert.equal(await centavosEnArca(sim, fA.cae), 242000);
  assert.equal(await centavosEnArca(sim, fB.cae), 121000);
});

test("aislamiento · el negocio A no puede volver a facturar la venta rechazada del negocio B: error, y la factura de B no cambia ni gana envíos", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const { a, b } = p.base;
  const simB = simDe(b.id);
  simB.fallarProximo("FECAESolicitar", { rechazo: [{ codigo: 10015, mensaje: "El campo ImpTotal no cierra con el detalle." }] });
  const pedidoB = b.pedidos[0];
  const idB = await p.invoiceCore.createInvoice({
    tenantId: b.id,
    concepto: 1,
    fecha: "20260924",
    emisor: { cuit: 20111111112, condicionIva: "RESPONSABLE_INSCRIPTO", puntoVenta: 1 },
    receptor: { docTipo: 99, docNro: 0, condicionIva: "CONSUMIDOR_FINAL" },
    neto: 1000,
    iva: [{ alicuotaId: 5, base: 1000, importe: 210 }],
    total: 1210,
    ivaPorProducto: true,
    vencimientoPago: "20260924",
    origin: { type: "ORDER", id: pedidoB },
  });
  assert.equal((await p.despachar()).rechazados, 1);
  const enviosAntes = (await p.envios(idB)).length;

  await assert.rejects(
    p.invoiceCore.createInvoice({
      tenantId: a.id,
      concepto: 1,
      fecha: "20260924",
      emisor: { cuit: 20111111112, condicionIva: "RESPONSABLE_INSCRIPTO", puntoVenta: 1 },
      receptor: { docTipo: 99, docNro: 0, condicionIva: "CONSUMIDOR_FINAL" },
      neto: 2000,
      iva: [{ alicuotaId: 5, base: 2000, importe: 420 }],
      total: 2420,
      ivaPorProducto: true,
      vencimientoPago: "20260924",
      origin: { type: "ORDER", id: pedidoB },
      reabrirSiRechazada: true,
    }),
  );
  const fB = await p.factura(idB);
  assert.equal(fB.status, "REJECTED");
  assert.equal(fB.total.toString(), "1210");
  assert.equal((await p.envios(idB)).length, enviosAntes);
  assert.equal(await p.operatorPrisma.invoice.count({ where: { orderId: pedidoB } }), 1, "A no se creó una factura con la venta de B");
  // Y el despacho de A no toca nada de B.
  await p.procesarEnviosDelNegocio(a.id, 20, p.deps);
  assert.equal((await p.factura(idB)).status, "REJECTED");
});
