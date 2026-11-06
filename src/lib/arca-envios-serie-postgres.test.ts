// ============================================================================
// Motor de facturación · Lock de numeración por SERIE (punto de venta + tipo), contra Postgres
// real (app_rls + RLS), dos negocios y el cliente SOAP real hablando con el simulador de ARCA.
// ============================================================================
//
//  · 50 facturas de A en la serie PV 1 / Factura B, 20 en PV 2 / Factura B y 20 de B, con 8
//    despachos a la vez: cada serie numerada 1..N sin huecos ni repetidos, igual que ARCA; las dos
//    series de A avanzan en paralelo; B no se ve afectado.
//  · Un envío SIN serie (encolado antes de la serie) con la reserva vigente bloquea a los de su
//    negocio, y no a los del otro.

import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio } from "@/test/base-efimera";
import { SimuladorArca } from "@/plugins/arca/afip/simulador";
import { fechaFiscalDelDia } from "@/lib/libros/fecha-fiscal";

const HOY = fechaFiscalDelDia();
const laBase = baseEfimeraDelArchivo();
const simuladores = new Map<string, SimuladorArca>();
const simDe = (tenantId: string) => {
  if (!simuladores.has(tenantId)) simuladores.set(tenantId, new SimuladorArca());
  return simuladores.get(tenantId)!;
};

/** Pedidos de CAE en vuelo por negocio y serie, para medir el paralelismo real. */
const enVuelo = new Map<string, number>();
const maximo = new Map<string, number>();
function contar(clave: string, delta: number) {
  const n = (enVuelo.get(clave) ?? 0) + delta;
  enVuelo.set(clave, n);
  if (n > (maximo.get(clave) ?? 0)) maximo.set(clave, n);
}

/** El simulador de un negocio, con una demora y la cuenta de pedidos de CAE en vuelo. */
function fetchMedido(tenantId: string): typeof fetch {
  const sim = simDe(tenantId);
  return async (entrada, init) => {
    const cuerpo = String(init?.body ?? "");
    const esCae = cuerpo.includes("FECAESolicitar");
    const pv = /<(?:\w+:)?PtoVta>(\d+)</.exec(cuerpo)?.[1];
    const tipo = /<(?:\w+:)?CbteTipo>(\d+)</.exec(cuerpo)?.[1];
    const claves = esCae ? [`${tenantId}|${pv}:${tipo}`, `${tenantId}|*`] : [];
    claves.forEach((c) => contar(c, 1));
    try {
      await new Promise((r) => setTimeout(r, 10));
      return await sim.fetch(entrada, init);
    } finally {
      claves.forEach((c) => contar(c, -1));
    }
  };
}

async function preparar(t: import("node:test").TestContext) {
  const base = await laBase(t);
  if (!base) return null;
  apuntarLaAppA(base);
  Object.assign(process.env as Record<string, string | undefined>, {
    NODE_ENV: "development",
    DB_CONNECTION_LIMIT: "10",
    DB_CONNECT_TIMEOUT_MS: "3000",
  });
  const duenio = await prismaComoDuenio(base);
  const invoiceCore = await import("@/lib/invoice-core");
  const { processArcaOutbox, procesarEnviosDelNegocio } = await import("@/lib/arca-dispatch");
  const { tomarSiguienteEnvio, CorridaDeEnvios } = await import("@/lib/arca-reserva");
  const { tenantTransaction } = await import("@/lib/rls");
  const { SoapAfipClient, FetchSoapTransport } = await import("@/plugins/arca/afip/soap");

  await duenio.outboxEvent.updateMany({ where: { processedAt: null }, data: { processedAt: new Date() } });

  // El ticket de acceso se comparte por negocio, como en producción (arca-ta-store.ts): dos envíos
  // del negocio en vuelo a la vez usan el mismo TA en vez de loguearse cada uno.
  type Ticket = import("@/plugins/arca/afip/soap").TicketAcceso;
  const tickets = new Map<string, Ticket>();
  const deps = {
    clientePara: async (tenantId: string) =>
      new SoapAfipClient(
        { cuit: 20111111112, homologacion: true },
        {
          transport: new FetchSoapTransport({ fetch: fetchMedido(tenantId), timeoutMs: 5000 }),
          signer: { firmarCms: async () => "CMS-DE-PRUEBA" },
          ticketInicial: tickets.get(tenantId),
          alRenovarTicket: (ta: Ticket) => void tickets.set(tenantId, ta),
        },
      ),
    numeroUsadoPorOtraFactura: invoiceCore.numeroUsadoPorOtraFactura,
  };
  let venta = 0;
  const facturar = (tenantId: string, puntoVenta: number, prefijo: string) =>
    invoiceCore.createInvoice({
      tenantId,
      concepto: 1,
      fecha: HOY,
      emisor: { cuit: 20111111112, condicionIva: "RESPONSABLE_INSCRIPTO", puntoVenta },
      receptor: { docTipo: 99, docNro: 0, condicionIva: "CONSUMIDOR_FINAL" },
      neto: 1000,
      iva: [{ alicuotaId: 5, base: 1000, importe: 210 }],
      total: 1210,
      ivaPorProducto: true,
      vencimientoPago: HOY,
      origin: { type: "MP_PAYMENT" as const, id: `${prefijo}_${++venta}` },
    });
  const enElNegocio =
    (tenantId: string): import("@/lib/arca-reserva").EnTransaccion =>
    (fn) =>
      tenantTransaction((tx) => fn(tx), { tenantId });
  const pendientes = () => duenio.outboxEvent.count({ where: { processedAt: null, type: "InvoiceCreated" } });
  return {
    base, duenio, deps, facturar, enElNegocio, pendientes,
    processArcaOutbox, procesarEnviosDelNegocio, tomarSiguienteEnvio, CorridaDeEnvios,
  };
}

/** La numeración de una serie en la base frente a ARCA: 1..n, sin huecos, mismo número por CAE. */
async function numeracion(p: NonNullable<Awaited<ReturnType<typeof preparar>>>, tenantId: string, ids: string[]) {
  const facturas = await p.duenio.invoice.findMany({ where: { id: { in: ids } } });
  const porCae = new Map(simDe(tenantId).comprobantesAutorizados().map((c) => [c.cae, c]));
  return {
    autorizadas: facturas.filter((f) => f.status === "AUTHORIZED").length,
    numeros: facturas.map((f) => f.numero ?? 0).sort((x, y) => x - y),
    igualesAArca: facturas.every(
      (f) => f.cae !== null && porCae.get(f.cae)?.numero === f.numero && porCae.get(f.cae)?.puntoVenta === f.puntoVenta,
    ),
    tipos: [...new Set(facturas.map((f) => f.tipoComprobante))],
  };
}

const unoAN = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

test("Serie · 50 facturas de una serie con 8 despachos a la vez: 1..50 correlativos; la otra serie avanza en paralelo; el otro negocio, intacto", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const [a, b] = [p.base.a.id, p.base.b.id];
  const ids = { a1: [] as string[], a2: [] as string[], b1: [] as string[] };
  for (let i = 0; i < 50; i++) {
    ids.a1.push(await p.facturar(a, 1, "s_a1"));
    if (i < 20) {
      ids.a2.push(await p.facturar(a, 2, "s_a2"));
      ids.b1.push(await p.facturar(b, 1, "s_b1"));
    }
  }
  const series = await p.duenio.outboxEvent.findMany({ where: { processedAt: null, tenantId: a }, select: { payload: true } });
  assert.deepEqual(
    [...new Set(series.map((e) => (e.payload as { serie?: string }).serie))].sort(),
    ["1:6", "2:6"],
    "cada envío lleva su serie (PV:CbteTipo)",
  );

  // El primer login de cada negocio, antes de largar los despachos (después lo reusan todos).
  for (const tenantId of [a, b]) await (await p.deps.clientePara(tenantId)).ultimoAutorizado(1, 6);

  const resumenes: Awaited<ReturnType<typeof p.processArcaOutbox>>[] = [];
  for (let vuelta = 0; vuelta < 60 && (await p.pendientes()) > 0; vuelta++) {
    resumenes.push(
      ...(await Promise.all([
        p.procesarEnviosDelNegocio(a, 100, p.deps),
        p.procesarEnviosDelNegocio(a, 100, p.deps),
        p.procesarEnviosDelNegocio(a, 100, p.deps),
        p.procesarEnviosDelNegocio(a, 100, p.deps),
        p.procesarEnviosDelNegocio(b, 100, p.deps),
        p.processArcaOutbox(100, p.deps),
        p.processArcaOutbox(100, p.deps),
        p.processArcaOutbox(100, p.deps),
      ])),
    );
  }
  assert.equal(await p.pendientes(), 0, "no quedó nada pendiente");
  const suma = (k: "autorizados" | "fallidos" | "descartados" | "rechazados") => resumenes.reduce((s, r) => s + r[k], 0);
  assert.equal(suma("autorizados"), 90, "cada venta autorizada una vez");
  assert.equal(suma("fallidos"), 0, "ningún número pedido dos veces (10016)");
  assert.equal(suma("rechazados"), 0);
  assert.equal(suma("descartados"), 0, "ningún CAE obtenido y descartado");

  for (const [nombre, tenantId, lista] of [["A PV1", a, ids.a1], ["A PV2", a, ids.a2], ["B PV1", b, ids.b1]] as const) {
    const n = await numeracion(p, tenantId, lista);
    assert.equal(n.autorizadas, lista.length, `${nombre}: todas autorizadas`);
    assert.deepEqual(n.numeros, unoAN(lista.length), `${nombre}: 1..${lista.length} sin huecos ni repetidos`);
    assert.ok(n.igualesAArca, `${nombre}: los números son los de ARCA`);
    assert.deepEqual(n.tipos, [6], `${nombre}: Factura B`);
  }
  assert.equal(simDe(a).cantidadDeCae(), 70, "ARCA autorizó 70 en A, ninguno de más");
  assert.equal(simDe(b).cantidadDeCae(), 20, "ARCA autorizó 20 en B, ninguno de más");
  assert.equal(maximo.get(`${a}|1:6`), 1, "un pedido de CAE en vuelo por serie");
  assert.equal(maximo.get(`${a}|2:6`), 1, "un pedido de CAE en vuelo por serie");
  assert.ok((maximo.get(`${a}|*`) ?? 0) >= 2, "las dos series de A estuvieron en vuelo a la vez");
});

test("Serie · un envío SIN serie con la reserva vigente bloquea a los de su negocio (comodín), no a los del otro", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const [a, b] = [p.base.a.id, p.base.b.id];
  const viejo = await p.facturar(a, 1, "viejo");
  await p.facturar(a, 2, "otra_serie");
  await p.facturar(b, 1, "otro_negocio");
  // El envío "viejo" queda como encolado antes del deploy (sin serie) y en vuelo (reserva vigente).
  await p.duenio.$executeRaw`
    UPDATE "OutboxEvent"
    SET "payload" = jsonb_set("payload" - 'serie', '{reserva}',
          jsonb_build_object('token', 'otro-despacho', 'hasta', now() + interval '300 seconds'))
    WHERE "processedAt" IS NULL AND "payload"->>'invoiceId' = ${viejo}`;

  const deA = await p.tomarSiguienteEnvio(p.enElNegocio(a), new p.CorridaDeEnvios(), a);
  assert.equal(deA, null, "el envío sin serie en vuelo bloquea a la serie PV 2 de su negocio");
  const deB = await p.tomarSiguienteEnvio(p.enElNegocio(b), new p.CorridaDeEnvios(), b);
  assert.ok(deB, "el otro negocio no se ve afectado");
  assert.equal(deB.tenantId, b);

  // Con serie, en cambio, la reserva vigente de PV 1 no frena a PV 2.
  await p.duenio.$executeRaw`
    UPDATE "OutboxEvent" SET "payload" = "payload" || '{"serie":"1:6"}'::jsonb
    WHERE "processedAt" IS NULL AND "payload"->>'invoiceId' = ${viejo}`;
  const otraSerie = await p.tomarSiguienteEnvio(p.enElNegocio(a), new p.CorridaDeEnvios(), a);
  assert.ok(otraSerie, "con serie, PV 2 se toma aunque PV 1 esté en vuelo");
  assert.equal((otraSerie.payload as { serie?: string }).serie, "2:6");
  // Y un segundo de la serie en vuelo, no.
  await p.facturar(a, 1, "misma_serie");
  assert.equal(await p.tomarSiguienteEnvio(p.enElNegocio(a), new p.CorridaDeEnvios(), a), null, "la misma serie espera");
  await p.duenio.outboxEvent.updateMany({ where: { processedAt: null }, data: { processedAt: new Date() } });
});
