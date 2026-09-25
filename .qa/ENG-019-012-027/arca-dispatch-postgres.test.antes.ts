// ============================================================================
// ENG-020 + ENG-021 · El despacho a ARCA contra Postgres real (app_rls + RLS), con el cliente
// SOAP real hablando con el simulador de ARCA (un simulador por negocio).
// ============================================================================
//
//  · ENG-020: ARCA autoriza y la respuesta se pierde → la factura queda pendiente con el número
//    anotado; el reintento consulta, registra ESE número y ARCA termina con un solo CAE.
//  · ENG-021: 600, 10016, 5xx, WSAA caído y timeout dejan el envío PENDIENTE (la factura no se
//    rechaza); un rechazo del comprobante la rechaza, y esa venta se puede volver a facturar
//    sin chocar con los índices únicos (misma fila, un envío nuevo).
//  · Aislamiento: la falla de un negocio no toca al otro; cada uno queda con su CAE.

import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraDelArchivo } from "@/test/base-efimera";
import { SimuladorArca, type FallaSimulada, type MetodoArca } from "@/plugins/arca/afip/simulador";

const laBase = baseEfimeraDelArchivo();
// Un ARCA simulado por negocio para TODO el archivo: la base también dura todo el archivo, y
// ARCA y la base tienen que llevar la misma numeración. Cada test mide lo que cambió él.
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
    DB_CONNECTION_LIMIT: "2",
    DB_CONNECT_TIMEOUT_MS: "3000",
  });
  const { operatorPrisma } = await import("@/lib/operator-db");
  const invoiceCore = await import("@/lib/invoice-core");
  const { processArcaOutbox } = await import("@/lib/arca-dispatch");
  const { SoapAfipClient, FetchSoapTransport } = await import("@/plugins/arca/afip/soap");

  // Todo envío que otro test dejó pendiente se da por procesado: cada test mira sólo lo suyo.
  await operatorPrisma.outboxEvent.updateMany({ where: { processedAt: null }, data: { processedAt: new Date() } });

  const sims = { get: simDe };
  const deps = {
    clientePara: (tenantId: string) =>
      new SoapAfipClient(
        { cuit: 20111111112, homologacion: true },
        {
          transport: new FetchSoapTransport({ fetch: simDe(tenantId).fetch, timeoutMs: 40 }),
          signer: { firmarCms: async () => "CMS-DE-PRUEBA" },
        },
      ),
    numeroUsadoPorOtraFactura: invoiceCore.numeroUsadoPorOtraFactura,
  };
  const despachar = () => processArcaOutbox(20, deps);
  const importes = { 1210: { neto: 1000, iva: 210 }, 2420: { neto: 2000, iva: 420 } } as const;
  const facturar = (tenantId: string, orderId?: string, total: 1210 | 2420 = 1210, reabrirSiRechazada = false) =>
    invoiceCore.createInvoice({
      tenantId,
      concepto: 1,
      fecha: "20260924",
      emisor: { cuit: 20111111112, condicionIva: "RESPONSABLE_INSCRIPTO", puntoVenta: 1 },
      receptor: { docTipo: 99, docNro: 0, condicionIva: "CONSUMIDOR_FINAL" },
      neto: importes[total].neto,
      iva: [{ alicuotaId: 5, base: importes[total].neto, importe: importes[total].iva }],
      total,
      vencimientoPago: "20260924",
      ...(orderId ? { origin: { type: "ORDER" as const, id: orderId } } : {}),
      ...(reabrirSiRechazada ? { reabrirSiRechazada } : {}),
    });
  // Venta cobrada por MP (origen propio, sin pedido): para los tests que necesitan más ventas
  // con origen que los pedidos del arnés.
  const facturarPago = (tenantId: string, mpPaymentId: string, total: 1210 | 2420 = 1210, reabrirSiRechazada = false) =>
    invoiceCore.createInvoice({
      tenantId,
      concepto: 1,
      fecha: "20260924",
      emisor: { cuit: 20111111112, condicionIva: "RESPONSABLE_INSCRIPTO", puntoVenta: 1 },
      receptor: { docTipo: 99, docNro: 0, condicionIva: "CONSUMIDOR_FINAL" },
      neto: importes[total].neto,
      iva: [{ alicuotaId: 5, base: importes[total].neto, importe: importes[total].iva }],
      total,
      vencimientoPago: "20260924",
      origin: { type: "MP_PAYMENT" as const, id: mpPaymentId },
      ...(reabrirSiRechazada ? { reabrirSiRechazada } : {}),
    });
  const factura = (id: string) => operatorPrisma.invoice.findUniqueOrThrow({ where: { id } });
  const envios = (invoiceId: string) =>
    operatorPrisma.outboxEvent
      .findMany({ orderBy: { createdAt: "asc" } })
      .then((es) => es.filter((e) => (e.payload as { invoiceId?: string }).invoiceId === invoiceId));
  return { base, operatorPrisma, invoiceCore, sims, deps, processArcaOutbox, despachar, facturar, facturarPago, factura, envios };
}

test("ENG-020 · ARCA autoriza y se pierde la respuesta: el reintento registra el número 1 y ARCA tiene un solo CAE", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const simA = p.sims.get(p.base.a.id)!.fallarProximo("FECAESolicitar", "timeout-despues");
  const caeAntes = simA.cantidadDeCae();
  const pedidosAntes = simA.llamados.filter((m) => m === "FECAESolicitar").length;
  const n = caeAntes + 1;
  const id = await p.facturar(p.base.a.id, p.base.a.pedidos[0]);

  const primera = await p.despachar();
  assert.deepEqual(primera, { procesados: 0, autorizados: 0, rechazados: 0, fallidos: 1, descartados: 0 });
  assert.equal((await p.factura(id)).status, "PENDING");
  const [envio] = await p.envios(id);
  assert.equal(envio.processedAt, null);
  assert.equal(envio.attempts, 1);
  assert.match(envio.lastError ?? "", /no respondió/);
  assert.deepEqual((envio.payload as { intentoArca?: unknown }).intentoArca, { puntoVenta: 1, tipo: 6, numero: n });
  assert.equal(simA.cantidadDeCae(), caeAntes + 1, "ARCA ya autorizó el número aunque la respuesta se perdió");

  const segunda = await p.despachar();
  assert.deepEqual(segunda, { procesados: 1, autorizados: 1, rechazados: 0, fallidos: 0, descartados: 0 });
  const f = await p.factura(id);
  assert.equal(f.status, "AUTHORIZED");
  assert.equal(f.numero, n);
  assert.equal(f.cae, simA.comprobantesAutorizados().find((c) => c.numero === n)?.cae);
  assert.equal(simA.cantidadDeCae(), caeAntes + 1, "un solo CAE: no se pidió el siguiente");
  assert.equal(simA.llamados.filter((m) => m === "FECAESolicitar").length, pedidosAntes + 1);
  assert.notEqual((await p.envios(id))[0].processedAt, null);
});

const pasajeros: [string, MetodoArca, FallaSimulada, RegExp][] = [
  ["600 (token inválido)", "FECAESolicitar", { error: 600, mensaje: "ValidacionDeToken: token invalido" }, /600: ValidacionDeToken/],
  ["10016 (número tomado)", "FECAESolicitar", { rechazo: [{ codigo: 10016, mensaje: "no es el proximo a autorizar" }] }, /10016/],
  ["501 (error interno de ARCA)", "FECAESolicitar", { error: 501, mensaje: "Error interno de base de datos" }, /501/],
  ["HTTP 503 de WSFEv1", "FECAESolicitar", "caido", /HTTP 503/],
  ["timeout", "FECAESolicitar", "timeout-antes", /no respondió/],
  ["WSAA caído", "loginCms", "caido", /HTTP 503/],
  ["WSAA sin red", "loginCms", "sin-red", /No se pudo hablar con ARCA/],
];
for (const [nombre, metodo, falla, motivo] of pasajeros) {
  test(`ENG-021 · ${nombre}: el envío queda pendiente, la factura no se rechaza y el reintento la autoriza`, async (t) => {
    const p = await preparar(t);
    if (!p) return;
    const simA = p.sims.get(p.base.a.id)!.fallarProximo(metodo, falla);
    const caeAntes = simA.cantidadDeCae();
    const id = await p.facturar(p.base.a.id);

    const primera = await p.despachar();
    assert.equal(primera.rechazados, 0);
    assert.equal(primera.fallidos, 1);
    const f1 = await p.factura(id);
    assert.equal(f1.status, "PENDING");
    assert.equal(f1.rechazoMotivo, null);
    const [envio] = await p.envios(id);
    assert.equal(envio.processedAt, null, "el envío sigue pendiente");
    assert.match(envio.lastError ?? "", motivo);

    const segunda = await p.despachar();
    assert.equal(segunda.autorizados, 1, `segunda corrida: ${JSON.stringify(segunda)} · ${(await p.envios(id))[0].lastError}`);
    assert.equal((await p.factura(id)).status, "AUTHORIZED");
    assert.equal(simA.cantidadDeCae(), caeAntes + 1);
  });
}

test("ENG-021 · un rechazo del comprobante rechaza la factura; la venta se vuelve a facturar en la misma fila y termina autorizada", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const simA = p.sims.get(p.base.a.id)!.fallarProximo("FECAESolicitar", {
    rechazo: [{ codigo: 10015, mensaje: "El campo ImpTotal no cierra con el detalle." }],
  });
  const caeAntes = simA.cantidadDeCae();
  const pedido = p.base.a.pedidos[1];
  const id = await p.facturar(p.base.a.id, pedido);
  assert.equal((await p.despachar()).rechazados, 1);
  const rechazada = await p.factura(id);
  assert.equal(rechazada.status, "REJECTED");
  assert.match(rechazada.rechazoMotivo ?? "", /10015/);

  // Un flujo automático (webhook que llega de nuevo, turno completado otra vez) NO la reabre:
  // devuelve la misma factura rechazada y no encola nada. Reabrir es de quien corrigió el dato.
  assert.equal(await p.facturar(p.base.a.id, pedido, 2420), id);
  assert.equal((await p.factura(id)).status, "REJECTED");
  assert.equal((await p.envios(id)).length, 1, "sin pedido explícito no se encola otro envío");

  // Dos pedidos de volver a facturar a la vez: misma factura, UN solo envío nuevo.
  const [x, y] = await Promise.all([
    p.facturar(p.base.a.id, pedido, 2420, true),
    p.facturar(p.base.a.id, pedido, 2420, true),
  ]);
  assert.equal(x, id);
  assert.equal(y, id);
  const reabierta = await p.factura(id);
  assert.equal(reabierta.status, "PENDING");
  assert.equal(reabierta.rechazoMotivo, null);
  assert.equal(reabierta.total.toString(), "2420");
  const envios = await p.envios(id);
  assert.equal(envios.length, 2, "el envío rechazado queda como historia y hay uno nuevo");
  assert.equal(envios.filter((e) => e.processedAt === null).length, 1);

  assert.equal((await p.despachar()).autorizados, 1);
  const autorizada = await p.factura(id);
  assert.equal(autorizada.status, "AUTHORIZED");
  assert.equal(autorizada.numero, caeAntes + 1);
  assert.equal(await p.operatorPrisma.invoice.count({ where: { tenantId: p.base.a.id, orderId: pedido } }), 1);
  assert.equal(simA.cantidadDeCae(), caeAntes + 1);

  // Ya autorizada: volver a facturar devuelve la misma y no encola nada.
  assert.equal(await p.facturar(p.base.a.id, pedido, 2420, true), id);
  assert.equal((await p.envios(id)).length, 2);
});

test("ENG-021 · una venta que quedó rechazada por un error pasajero (600, antes de este arreglo) se vuelve a facturar", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const pedido = p.base.a.pedidos[2];
  const id = await p.facturar(p.base.a.id, pedido);
  // Lo que hacía el código anterior con un 600: factura rechazada y envío cerrado.
  const [envio] = await p.envios(id);
  assert.equal(await p.invoiceCore.markInvoiceRejected(id, p.base.a.id, "600: ValidacionDeToken: token invalido", envio.id), true);
  assert.notEqual((await p.envios(id))[0].processedAt, null, "el rechazo cierra el envío en la misma transacción");
  assert.equal((await p.factura(id)).status, "REJECTED");

  assert.equal(await p.facturar(p.base.a.id, pedido, 1210, true), id);
  assert.equal((await p.despachar()).autorizados, 1);
  assert.equal((await p.factura(id)).status, "AUTHORIZED");
});

test("aislamiento · la falla de ARCA en el negocio A no toca al B: cada uno queda con lo suyo", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const simA = p.sims.get(p.base.a.id)!.fallarProximo("FECAESolicitar", "timeout-despues");
  const simB = p.sims.get(p.base.b.id)!;
  const [antesA, antesB] = [simA.cantidadDeCae(), simB.cantidadDeCae()];
  const deA = await p.facturar(p.base.a.id);
  const deB = await p.facturar(p.base.b.id, p.base.b.pedidos[0]);

  const primera = await p.despachar();
  assert.equal(primera.autorizados, 1);
  assert.equal(primera.fallidos, 1);
  const fb = await p.factura(deB);
  assert.equal(fb.status, "AUTHORIZED");
  assert.equal(fb.tenantId, p.base.b.id);
  assert.equal(fb.cae, simB.comprobantesAutorizados().find((c) => c.numero === fb.numero)?.cae);
  assert.equal((await p.factura(deA)).status, "PENDING");
  // El número anotado quedó en el envío de A (escrito con RLS del negocio A), no en el de B.
  const [envioA] = await p.envios(deA);
  const [envioB] = await p.envios(deB);
  assert.equal(envioA.tenantId, p.base.a.id);
  assert.equal(envioB.tenantId, p.base.b.id);
  assert.ok((envioA.payload as { intentoArca?: unknown }).intentoArca);

  await p.despachar();
  assert.equal((await p.factura(deA)).status, "AUTHORIZED");
  assert.equal(simA.cantidadDeCae(), antesA + 1);
  assert.equal(simB.cantidadDeCae(), antesB + 1);
});

test("ENG-020 · dos ventas iguales a consumidor final: la que perdió el pedido no adopta el CAE de la otra; cada una con su número", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const simA = p.sims.get(p.base.a.id)!;
  const caeAntes = simA.cantidadDeCae();
  const n = caeAntes + 1;
  // Mismo día, 99/0, $1210: en una estética con precios fijos es lo más común.
  const idA = await p.facturar(p.base.a.id);
  const idB = await p.facturar(p.base.a.id);
  simA.fallarProximo("FECAESolicitar", "timeout-antes"); // el pedido de A no llega; A ya anotó n

  const primera = await p.despachar();
  assert.deepEqual(primera, { procesados: 1, autorizados: 1, rechazados: 0, fallidos: 1, descartados: 0 });
  assert.equal((await p.factura(idB)).numero, n, "B pidió y registró el número n");

  const segunda = await p.despachar();
  assert.deepEqual(segunda, { procesados: 1, autorizados: 1, rechazados: 0, fallidos: 0, descartados: 0 }, (await p.envios(idA))[0].lastError ?? "");
  const [a, b] = [await p.factura(idA), await p.factura(idB)];
  assert.equal(a.status, "AUTHORIZED");
  assert.equal(a.numero, n + 1, "A no adopta el n de B: pide el siguiente");
  assert.notEqual(a.cae, b.cae);
  assert.equal(simA.cantidadDeCae(), caeAntes + 2, "dos ventas, dos CAE");
  assert.notEqual((await p.envios(idA))[0].processedAt, null);
});

test("ENG-020/021 · la consulta del número anotado falla con un código desconocido: la factura sigue pendiente (no se rechaza) y un solo CAE", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const simB = p.sims.get(p.base.b.id)!;
  const caeAntes = simB.cantidadDeCae();
  const id = await p.facturar(p.base.b.id, p.base.b.pedidos[1]);
  simB.fallarProximo("FECAESolicitar", "timeout-despues");
  assert.equal((await p.despachar()).fallidos, 1);
  assert.equal(simB.cantidadDeCae(), caeAntes + 1, "ARCA ya autorizó aunque la respuesta se perdió");

  simB.fallarProximo("FECompConsultar", { error: 1000, mensaje: "Error en consulta" });
  const segunda = await p.despachar();
  assert.deepEqual(segunda, { procesados: 0, autorizados: 0, rechazados: 0, fallidos: 1, descartados: 0 });
  const f = await p.factura(id);
  assert.equal(f.status, "PENDING", "una falla de la consulta no es un rechazo del comprobante");
  assert.equal(f.rechazoMotivo, null);
  const [envio] = await p.envios(id);
  assert.equal(envio.processedAt, null);
  assert.match(envio.lastError ?? "", /1000/);

  assert.equal((await p.despachar()).autorizados, 1);
  const autorizada = await p.factura(id);
  assert.equal(autorizada.status, "AUTHORIZED");
  assert.equal(autorizada.numero, caeAntes + 1);
  assert.equal(simB.cantidadDeCae(), caeAntes + 1, "una venta, un CAE");
});

// ── Vuelta 3 de revisión: un envío viejo nunca escribe sobre la factura reabierta ─────────

/** Un cliente de ARCA que se frena antes de un método (por defecto, pedir el CAE) hasta que el test lo suelta. */
function clienteQueSeFrena(
  real: import("@/plugins/arca").AfipClient,
  antesDe: "solicitarCae" | "ultimoAutorizado" = "solicitarCae",
) {
  let avisarQueLlego!: () => void;
  let soltar!: () => void;
  const llego = new Promise<void>((r) => (avisarQueLlego = r));
  const puerta = new Promise<void>((r) => (soltar = r));
  const cliente: import("@/plugins/arca").AfipClient = {
    ultimoAutorizado: async (pv, tipo) => {
      if (antesDe === "ultimoAutorizado") {
        avisarQueLlego();
        await puerta;
      }
      return real.ultimoAutorizado(pv, tipo);
    },
    consultarComprobante: (pv, tipo, numero) => real.consultarComprobante(pv, tipo, numero),
    solicitarCae: async (comp) => {
      if (antesDe === "solicitarCae") {
        avisarQueLlego();
        await puerta;
      }
      return real.solicitarCae(comp);
    },
  };
  return { cliente, llego, soltar };
}

/** El comprobante que ARCA tiene con el CAE de la factura, a centavos. */
async function totalEnArcaDe(sim: SimuladorArca, cae: string | null) {
  const { centavosDeImporteArca } = await import("@/plugins/arca/afip/soap");
  const c = sim.comprobantesAutorizados().find((x) => x.cae === cae);
  return c ? centavosDeImporteArca(c.impTotal) : null;
}

test("ENG-021 · volver a facturar con un envío viejo sin cerrar (corte entre el rechazo y el cierre): un solo envío vivo, un CAE, y el CAE es el de los importes nuevos", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const simA = p.sims.get(p.base.a.id)!;
  simA.fallarProximo("FECAESolicitar", { rechazo: [{ codigo: 10048, mensaje: "El importe no cierra." }] });
  const id = await p.facturarPago(p.base.a.id, "mp_v3_reabrir");
  assert.equal((await p.despachar()).rechazados, 1);
  assert.equal((await p.factura(id)).status, "REJECTED");
  // Lo que dejaba el código anterior si la función se cortaba entre el rechazo y el cierre.
  const [viejo] = await p.envios(id);
  await p.operatorPrisma.outboxEvent.update({ where: { id: viejo.id }, data: { processedAt: null } });

  const caeAntes = simA.cantidadDeCae();
  assert.equal(await p.facturarPago(p.base.a.id, "mp_v3_reabrir", 2420, true), id);
  const vivos = (await p.envios(id)).filter((e) => e.processedAt === null);
  assert.equal(vivos.length, 1, "la reapertura cierra el envío viejo: queda uno solo vivo");

  await p.despachar();
  assert.equal(simA.cantidadDeCae(), caeAntes + 1, "una venta, un CAE");
  const f = await p.factura(id);
  assert.equal(f.status, "AUTHORIZED");
  assert.equal(f.total.toString(), "2420");
  assert.equal(await totalEnArcaDe(simA, f.cae), 242000, "el CAE registrado es el que ARCA dio por 2420");
});

test("ENG-021 · un despacho viejo que obtiene el CAE DESPUÉS de que la venta se volvió a facturar no lo registra en la factura reabierta", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const simA = p.sims.get(p.base.a.id)!;
  const caeAntes = simA.cantidadDeCae();
  const id = await p.facturarPago(p.base.a.id, "mp_v3_registro_viejo");
  // Los dos despachos usan la misma sesión de WSAA (el simulador, como ARCA, invalida el token
  // anterior en cada login): lo que se mide es la base, no el token.
  const sesion = p.deps.clientePara(p.base.a.id);
  const frenado = clienteQueSeFrena(sesion);
  const x = p.processArcaOutbox(20, { ...p.deps, clientePara: () => frenado.cliente });
  await frenado.llego; // X anotó el número y está por pedir el CAE con los importes de 1210

  // Otro despacho procesa el mismo envío, ARCA lo rechaza, y la persona vuelve a facturar.
  simA.fallarProximo("FECAESolicitar", { rechazo: [{ codigo: 10048, mensaje: "El importe no cierra." }] });
  assert.equal((await p.processArcaOutbox(20, { ...p.deps, clientePara: () => sesion })).rechazados, 1);
  assert.equal(await p.facturarPago(p.base.a.id, "mp_v3_registro_viejo", 2420, true), id);

  frenado.soltar();
  const resumenX = await x;
  const tras = await p.factura(id);
  assert.equal(tras.status, "PENDING", "la factura reabierta no toma el CAE del envío viejo");
  assert.equal(tras.cae, null);
  assert.equal(resumenX.autorizados, 0);
  assert.equal(resumenX.descartados, 1, "el CAE del envío viejo queda a la vista, no se cuenta como autorizado");

  await p.despachar();
  const f = await p.factura(id);
  assert.equal(f.status, "AUTHORIZED");
  assert.equal(await totalEnArcaDe(simA, f.cae), 242000);
  // El CAE del envío viejo es el de dos despachos simultáneos del MISMO envío (ENG-019).
  assert.equal(simA.cantidadDeCae(), caeAntes + 2);
});

test("ENG-021 · un despacho viejo que recibe un rechazo DESPUÉS de que la venta se volvió a facturar no rechaza la factura reabierta", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const simA = p.sims.get(p.base.a.id)!;
  const id = await p.facturarPago(p.base.a.id, "mp_v3_rechazo_viejo");
  const sesion = p.deps.clientePara(p.base.a.id);
  const frenado = clienteQueSeFrena(sesion);
  const x = p.processArcaOutbox(20, { ...p.deps, clientePara: () => frenado.cliente });
  await frenado.llego;

  simA.fallarProximo("FECAESolicitar", { rechazo: [{ codigo: 10048, mensaje: "El importe no cierra." }] });
  assert.equal((await p.processArcaOutbox(20, { ...p.deps, clientePara: () => sesion })).rechazados, 1);
  assert.equal(await p.facturarPago(p.base.a.id, "mp_v3_rechazo_viejo", 2420, true), id);

  simA.fallarProximo("FECAESolicitar", { rechazo: [{ codigo: 10048, mensaje: "Motivo viejo." }] });
  frenado.soltar();
  const resumenX = await x;
  const tras = await p.factura(id);
  assert.equal(tras.status, "PENDING", "el rechazo del envío viejo no toca la factura reabierta");
  assert.equal(tras.rechazoMotivo, null);
  assert.equal(resumenX.rechazados, 0);
  assert.equal(resumenX.descartados, 1);
  assert.equal((await p.envios(id)).filter((e) => e.processedAt === null).length, 1);

  await p.despachar();
  const f = await p.factura(id);
  assert.equal(f.status, "AUTHORIZED");
  assert.equal(await totalEnArcaDe(simA, f.cae), 242000);
});

test("ENG-021 · un envío que quedó abierto para una factura ya rechazada se cierra sin volver a pedirle nada a ARCA", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const simA = p.sims.get(p.base.a.id)!;
  simA.fallarProximo("FECAESolicitar", { rechazo: [{ codigo: 10048, mensaje: "El importe no cierra." }] });
  const id = await p.facturarPago(p.base.a.id, "mp_v3_abierto");
  assert.equal((await p.despachar()).rechazados, 1);
  const [envio] = await p.envios(id);
  await p.operatorPrisma.outboxEvent.update({ where: { id: envio.id }, data: { processedAt: null } });

  const [llamadosAntes, caeAntes] = [simA.llamados.length, simA.cantidadDeCae()];
  const r = await p.despachar();
  assert.equal(simA.llamados.length, llamadosAntes, "no se llamó a ARCA");
  assert.equal(simA.cantidadDeCae(), caeAntes);
  assert.equal(r.descartados, 1);
  assert.equal(r.autorizados, 0);
  assert.notEqual((await p.envios(id))[0].processedAt, null);
  assert.equal((await p.factura(id)).status, "REJECTED");
});

test("ENG-019 (parcial) · un despacho que llega tarde a un envío que otro ya autorizó y cerró no le pide otro CAE a ARCA", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const simA = p.sims.get(p.base.a.id)!;
  const caeAntes = simA.cantidadDeCae();
  const id = await p.facturarPago(p.base.a.id, "mp_v3_tarde");
  const sesion = p.deps.clientePara(p.base.a.id);
  const frenado = clienteQueSeFrena(sesion, "ultimoAutorizado");
  const x = p.processArcaOutbox(20, { ...p.deps, clientePara: () => frenado.cliente });
  await frenado.llego; // X tomó el envío y todavía no anotó número

  const y = await p.processArcaOutbox(20, { ...p.deps, clientePara: () => sesion });
  assert.equal(y.autorizados, 1);
  frenado.soltar();
  const resumenX = await x;
  assert.equal(simA.cantidadDeCae(), caeAntes + 1, "una venta, un CAE");
  assert.equal(resumenX.descartados, 1);
  assert.equal(resumenX.autorizados, 0);
  const f = await p.factura(id);
  assert.equal(f.status, "AUTHORIZED");
  assert.equal(f.numero, caeAntes + 1);
});
