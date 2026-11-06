// ============================================================================
// PR5 · «automático» de devoluciones y contracargos de Mercado Pago, contra Postgres real
// (app_rls + RLS, dos negocios) y el simulador de ARCA:
//  · C3 · tope por cobro: una factura con DOS cobros no deja que la devolución de uno se coma el otro,
//    tampoco con dos devoluciones distintas a la vez;
//  · C2 · la devolución que llega antes que la factura queda pendiente UNA vez y sale sola cuando hay CAE;
//  · C1 · la ingesta aplica devoluciones y contracargo aunque el pago ya esté procesado (contracargo sin NC);
//  · C4 · `medioDePago` viaja en el envío de la factura y de su nota.
// ============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio } from "@/test/base-efimera";
import { SimuladorArca } from "@/plugins/arca/afip/simulador";
import { fechaFiscalDelDia } from "@/lib/libros/fecha-fiscal";

const HOY = fechaFiscalDelDia();
const laBase = baseEfimeraDelArchivo();
const sims = new Map<string, SimuladorArca>();
const simDe = (t: string) => (sims.get(t) ?? sims.set(t, new SimuladorArca()).get(t))!;
let n = 0;
const idUnico = (pre: string) => `${pre}${Date.now()}${n++}`;

async function preparar(t: import("node:test").TestContext) {
  const base = await laBase(t);
  if (!base) return null;
  apuntarLaAppA(base);
  Object.assign(process.env as Record<string, string | undefined>, { NODE_ENV: "development", DB_CONNECTION_LIMIT: "4", DB_CONNECT_TIMEOUT_MS: "3000" });
  const duenio = await prismaComoDuenio(base);
  const invoiceCore = await import("@/lib/invoice-core");
  const dispatch = await import("@/lib/arca-dispatch");
  const cobros = await import("@/lib/facturacion/cobros-facturados");
  const dev = await import("@/lib/facturacion/devoluciones-mp");
  const { SoapAfipClient, FetchSoapTransport } = await import("@/plugins/arca/afip/soap");
  await duenio.outboxEvent.updateMany({ where: { processedAt: null }, data: { processedAt: new Date() } });
  const deps = {
    clientePara: (tenantId: string) =>
      new SoapAfipClient(
        { cuit: 20111111112, homologacion: true },
        { transport: new FetchSoapTransport({ fetch: simDe(tenantId).fetch, timeoutMs: 40 }), signer: { firmarCms: async () => "CMS-DE-PRUEBA" } },
      ),
    numeroUsadoPorOtraFactura: invoiceCore.numeroUsadoPorOtraFactura,
  };
  /** Una Factura C que cubre los `cobros` dados (clave → importe), como la arma bancos-glue. */
  const facturar = (tenantId: string, total: number, claves: string[], originId: string) =>
    cobros.facturarCobros(
      {
        tenantId,
        concepto: 1,
        fecha: HOY,
        emisor: { cuit: 20111111112, condicionIva: "MONOTRIBUTO", puntoVenta: 1 },
        receptor: { docTipo: 99, docNro: 0, condicionIva: "CONSUMIDOR_FINAL" },
        neto: total,
        iva: [{ alicuotaId: 3, base: total, importe: 0 }],
        total,
        medioDePago: "otro",
        origin: { type: "MP_PAYMENT", id: originId },
      },
      claves.map((clave) => ({ clave, importe: total })),
    );
  const notasDe = (facturaId: string) => duenio.invoice.findMany({ where: { comprobanteAsociadoId: facturaId }, orderBy: { total: "asc" } });
  const cae = () => dispatch.procesarEnviosDelNegocio(base.a.id, 20, deps);
  return { base, duenio, dev, cobros, facturar, notasDe, cae };
}

test("C3 · tope por cobro: la devolución de un pago no pasa lo que ese pago facturó, aunque a la factura le quede saldo", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const a = p.base.a.id;
  const pago = idUnico("51");
  // El libro anota cada clave con lo que aporta; acá el pago de MP aporta 400 de una factura de 1000.
  const facturaId = await p.facturar(a, 1000, [p.cobros.claveCobroMP(pago), `banco:${idUnico("h")}`], pago);
  await p.duenio.cobroFacturado.updateMany({ where: { tenantId: a, clave: p.cobros.claveCobroMP(pago) }, data: { importe: 400 } });
  await p.cae();

  const demas = await p.dev.notaDeCreditoPorDevolucion(a, { refundId: idUnico("r"), paymentId: pago, importe: 500 });
  assert.equal(demas.estado, "rechazada", "500 > 400 del pago, aunque la factura tenga 1000 de saldo");
  if (demas.estado === "rechazada") assert.match(demas.motivo, /facturado \$400,00, ya acreditado \$0,00/);
  // Deja rastro: la plata salió de MP sin nota y alguien tiene que verlo.
  const rastro = await p.duenio.auditLog.count({
    where: { tenantId: a, entity: p.dev.ENTIDAD_DEVOLUCION_MP, action: p.dev.ACCION_RECHAZADA, changes: { path: ["paymentId"], equals: pago } },
  });
  assert.equal(rastro, 1);

  // Dos devoluciones DISTINTAS a la vez, 300 + 300 sobre 400: sale una sola.
  const [u, v] = await Promise.all([
    p.dev.notaDeCreditoPorDevolucion(a, { refundId: idUnico("r"), paymentId: pago, importe: 300 }),
    p.dev.notaDeCreditoPorDevolucion(a, { refundId: idUnico("r"), paymentId: pago, importe: 300 }),
  ]);
  assert.deepEqual([u.estado, v.estado].sort(), ["nota_emitida", "rechazada"]);
  // Lo que queda (100) entra justo; un centavo más, no.
  assert.equal((await p.dev.notaDeCreditoPorDevolucion(a, { refundId: idUnico("r"), paymentId: pago, importe: 100.01 })).estado, "rechazada");
  assert.equal((await p.dev.notaDeCreditoPorDevolucion(a, { refundId: idUnico("r"), paymentId: pago, importe: 100 })).estado, "nota_emitida");
  const notas = await p.notasDe(facturaId);
  assert.deepEqual(notas.map((x) => Number(x.total)), [100, 300]);

  // Una nota RECHAZADA por ARCA no cuenta en el tope: libera lo suyo.
  await p.duenio.invoice.update({ where: { id: notas[0].id }, data: { status: "REJECTED" } });
  assert.equal((await p.dev.notaDeCreditoPorDevolucion(a, { refundId: idUnico("r"), paymentId: pago, importe: 100 })).estado, "nota_emitida");
});

test("C2 · devolución antes de la factura: pendiente una vez, sale sola con el CAE; otro negocio no la ve", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const a = p.base.a.id;
  const b = p.base.b.id;
  const pago = idUnico("52");
  const refundId = idUnico("r");
  const d = { refundId, paymentId: pago, importe: 250 };

  // Llega dos veces (MP reintenta) antes de que exista la factura.
  assert.deepEqual(await p.dev.notaDeCreditoPorDevolucion(a, d), { estado: "sin_factura" });
  assert.deepEqual(await p.dev.notaDeCreditoPorDevolucion(a, d), { estado: "sin_factura" });
  const pendientes = () => p.duenio.auditLog.count({ where: { entity: p.dev.ENTIDAD_DEVOLUCION_MP, entityId: `mp:refund:${refundId}`, action: "devolucion_pendiente" } });
  assert.equal(await pendientes(), 1, "una sola anotación");

  // El negocio B no reintenta lo de A.
  assert.equal((await p.dev.reintentarDevolucionesPendientes(b)).probadas, 0);

  // Se factura el pago (bruto): sin CAE todavía, sigue pendiente (no duplica la anotación).
  const facturaId = await p.facturar(a, 1000, [p.cobros.claveCobroMP(pago)], pago);
  const r1 = await p.dev.reintentarDevolucionesPendientes(a);
  assert.equal(r1.siguenPendientes >= 1, true);
  assert.equal(await pendientes(), 1);

  // Llega el CAE: la corrida siguiente emite la NC; la otra ya no la prueba.
  await p.cae();
  const r2 = await p.dev.reintentarDevolucionesPendientes(a);
  assert.equal(r2.emitidas >= 1, true);
  const notas = await p.notasDe(facturaId);
  assert.deepEqual(notas.map((x) => Number(x.total)), [250]);
  const r3 = await p.dev.reintentarDevolucionesPendientes(a);
  assert.equal(
    (await p.duenio.auditLog.count({ where: { entity: p.dev.ENTIDAD_DEVOLUCION_MP, entityId: `mp:refund:${refundId}`, action: "devolucion_acreditada" } })),
    1,
  );
  assert.equal(r3.emitidas, 0, "ya emitida: no se vuelve a probar");

  // C4 · la nota viaja con el medio de la factura.
  const envio = await p.duenio.outboxEvent.findFirst({ where: { type: "InvoiceCreated", payload: { path: ["invoiceId"], equals: notas[0].id } } });
  assert.equal((envio?.payload as { medioDePago?: string } | null)?.medioDePago, "otro");
});

test("C2 · una pendiente que termina rechazada se cierra y no se reintenta", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const a = p.base.a.id;
  const pago = idUnico("53");
  const refundId = idUnico("r");
  assert.equal((await p.dev.notaDeCreditoPorDevolucion(a, { refundId, paymentId: pago, importe: 900 })).estado, "sin_factura");
  await p.facturar(a, 500, [p.cobros.claveCobroMP(pago)], pago);
  await p.cae();
  const r = await p.dev.reintentarDevolucionesPendientes(a);
  assert.equal(r.rechazadas >= 1, true, "900 > 500 facturados");
  const cerradas = await p.duenio.auditLog.count({ where: { entity: p.dev.ENTIDAD_DEVOLUCION_MP, entityId: `mp:refund:${refundId}`, action: "devolucion_pendiente_cerrada" } });
  assert.equal(cerradas, 1);
  const otra = await p.dev.reintentarDevolucionesPendientes(a);
  assert.equal(otra.rechazadas, 0, "cerrada: no se prueba más");
});

test("C1 · contracargo por la ingesta: un caso, sin nota de crédito", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const a = p.base.a.id;
  const pago = idUnico("54");
  const facturaId = await p.facturar(a, 800, [p.cobros.claveCobroMP(pago)], pago);
  await p.cae();
  const r = await p.dev.aplicarMovimientosPosterioresMP(a, [{ tipo: "contracargo", paymentId: pago, importe: 800 }]);
  assert.deepEqual(r, { notas: 0, pendientes: 0, rechazadas: 0, casos: 1, errores: 0 });
  assert.equal((await p.notasDe(facturaId)).length, 0);
});

test("C3 · factura de un solo cobro: una NC manual previa cuenta en el tope", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const a = p.base.a.id;
  const pago = idUnico("55");
  const facturaId = await p.facturar(a, 1000, [p.cobros.claveCobroMP(pago)], pago);
  await p.cae();
  const { crearNotaDeCredito } = await import("@/lib/invoice-core");
  const manual = await crearNotaDeCredito({ tenantId: a, facturaId, importe: 600, motivo: "devolución a mano", fecha: HOY });
  assert.equal(manual.ok, true);
  const r = await p.dev.notaDeCreditoPorDevolucion(a, { refundId: idUnico("r"), paymentId: pago, importe: 500 });
  assert.equal(r.estado, "rechazada");
  if (r.estado === "rechazada") assert.match(r.motivo, /ya acreditado \$600,00/);
  assert.equal((await p.dev.notaDeCreditoPorDevolucion(a, { refundId: idUnico("r"), paymentId: pago, importe: 400 })).estado, "nota_emitida");
});
