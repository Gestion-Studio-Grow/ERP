// ============================================================================
// PR3 · Devoluciones y contracargos de Mercado Pago contra Postgres real (app_rls + RLS, dos
// negocios) y el simulador de ARCA:
//  · devolución parcial → NC asociada de la misma letra; el resto → otra NC; nunca más que la factura;
//  · idempotente por mp:refund:<id>: el mismo aviso dos veces (y dos a la vez) deja UNA nota;
//  · factura sin CAE → «esperar_cae»; pago sin factura → «sin_factura»; otro negocio no la ve;
//  · contracargo → un caso (idempotente), sin nota de crédito.
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
  /** La Factura C de un pago de MP, anotada en el libro como `mp:<pago>`. */
  const facturarPago = (tenantId: string, paymentId: string, total: number) =>
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
        origin: { type: "MP_PAYMENT", id: paymentId },
      },
      [{ clave: cobros.claveCobroMP(paymentId), importe: total }],
    );
  const notasDe = (facturaId: string) =>
    duenio.invoice.findMany({ where: { comprobanteAsociadoId: facturaId }, orderBy: { total: "asc" } });
  return { base, duenio, dispatch, deps, dev, facturarPago, notasDe };
}

test("devolución parcial y después el resto: NC C asociadas, idempotentes por mp:refund, nunca más que la factura", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const a = p.base.a.id;
  const pago = `9${Date.now()}`;
  const facturaId = await p.facturarPago(a, pago, 1000);

  // Sin CAE: esperar (no es un error, se vuelve a intentar).
  const temprano = await p.dev.notaDeCreditoPorDevolucion(a, { refundId: "r1", paymentId: pago, importe: 300, fecha: HOY });
  assert.deepEqual(temprano, { estado: "esperar_cae", facturaId });

  await p.dispatch.procesarEnviosDelNegocio(a, 20, p.deps);
  const parcial = await p.dev.notaDeCreditoPorDevolucion(a, { refundId: "r1", paymentId: pago, importe: 300, fecha: HOY });
  assert.equal(parcial.estado, "nota_emitida");
  // El mismo aviso otra vez: la misma nota, sin otra.
  const repetido = await p.dev.notaDeCreditoPorDevolucion(a, { refundId: "r1", paymentId: pago, importe: 300, fecha: HOY });
  assert.equal(repetido.estado, "nota_emitida");
  if (parcial.estado === "nota_emitida" && repetido.estado === "nota_emitida") {
    assert.equal(repetido.invoiceId, parcial.invoiceId);
    assert.equal(repetido.yaExistia, true);
  }

  // Una devolución que supera el saldo: rechazada con el saldo en criollo.
  const demas = await p.dev.notaDeCreditoPorDevolucion(a, { refundId: "r2", paymentId: pago, importe: 800, fecha: HOY });
  assert.equal(demas.estado, "rechazada");
  if (demas.estado === "rechazada") assert.match(demas.motivo, /queda \$700,00 por anular/);

  // El resto, pedido dos veces a la vez con el mismo id: UNA nota.
  const [u, v] = await Promise.all([
    p.dev.notaDeCreditoPorDevolucion(a, { refundId: "r3", paymentId: pago, importe: 700, fecha: HOY }),
    p.dev.notaDeCreditoPorDevolucion(a, { refundId: "r3", paymentId: pago, importe: 700, fecha: HOY }),
  ]);
  assert.equal(u.estado, "nota_emitida");
  assert.equal(v.estado, "nota_emitida");
  if (u.estado === "nota_emitida" && v.estado === "nota_emitida") assert.equal(u.invoiceId, v.invoiceId);

  const r = await p.dispatch.procesarEnviosDelNegocio(a, 20, p.deps);
  assert.equal(r.autorizados, 2);
  const notas = await p.notasDe(facturaId);
  assert.deepEqual(
    notas.map((n) => [Number(n.total), n.tipoComprobante, n.status]),
    [[300, 13, "AUTHORIZED"], [700, 13, "AUTHORIZED"]],
    "NC C (13): misma letra que la Factura C",
  );
  const libro = await p.duenio.cobroFacturado.findMany({ where: { tenantId: a, clave: { startsWith: "mp:refund:" } }, orderBy: { clave: "asc" } });
  assert.deepEqual(libro.map((f) => [f.clave, Number(f.importe)]), [["mp:refund:r1", 300], ["mp:refund:r3", 700]]);

  // Entera: otra devolución ya no tiene saldo.
  const sinSaldo = await p.dev.notaDeCreditoPorDevolucion(a, { refundId: "r4", paymentId: pago, importe: 1, fecha: HOY });
  assert.equal(sinSaldo.estado, "rechazada");
});

test("aislamiento y bordes: otro negocio no acredita la factura ajena; pago sin factura; datos inválidos", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const a = p.base.a.id;
  const b = p.base.b.id;
  const pago = `8${Date.now()}`;
  await p.facturarPago(a, pago, 500);
  await p.dispatch.procesarEnviosDelNegocio(a, 20, p.deps);

  assert.deepEqual(await p.dev.notaDeCreditoPorDevolucion(b, { refundId: "x1", paymentId: pago, importe: 100, fecha: HOY }), { estado: "sin_factura" });
  assert.deepEqual(await p.dev.notaDeCreditoPorDevolucion(a, { refundId: "x2", paymentId: "999999", importe: 100, fecha: HOY }), { estado: "sin_factura" });
  assert.equal((await p.dev.notaDeCreditoPorDevolucion(a, { refundId: "x3", paymentId: pago, importe: 0, fecha: HOY })).estado, "rechazada");
  assert.equal((await p.dev.notaDeCreditoPorDevolucion(a, { refundId: "a b", paymentId: pago, importe: 10, fecha: HOY })).estado, "rechazada");
  assert.equal(await p.duenio.cobroFacturado.count({ where: { tenantId: b } }), 0, "el negocio B no anotó nada");
});

test("contracargo: abre UN caso (aun con dos avisos a la vez), sin nota de crédito; cada negocio ve el suyo", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const a = p.base.a.id;
  const b = p.base.b.id;
  const pago = `7${Date.now()}`;
  const facturaId = await p.facturarPago(a, pago, 2000);
  await p.dispatch.procesarEnviosDelNegocio(a, 20, p.deps);

  const [u, v] = await Promise.all([
    p.dev.abrirCasoDeContracargo(a, { paymentId: pago, importe: 2000 }),
    p.dev.abrirCasoDeContracargo(a, { paymentId: pago, importe: 2000 }),
  ]);
  assert.equal(u.estado, "caso_abierto");
  assert.equal(v.estado, "caso_abierto");
  if (u.estado === "caso_abierto" && v.estado === "caso_abierto") {
    assert.equal(u.casoId, v.casoId);
    assert.equal([u.yaExistia, v.yaExistia].filter(Boolean).length, 1);
    assert.equal(u.facturaId, facturaId);
  }
  assert.equal((await p.notasDe(facturaId)).length, 0, "un contracargo no emite nota de crédito");
  const casos = await p.duenio.auditLog.findMany({ where: { entity: p.dev.ENTIDAD_CASO_CONTRACARGO, entityId: `mp:${pago}` } });
  assert.equal(casos.length, 1);
  assert.equal(casos[0].tenantId, a);

  // El negocio B, con el mismo número de pago, abre el suyo sin ver la factura de A.
  const enB = await p.dev.abrirCasoDeContracargo(b, { paymentId: pago, importe: 2000 });
  assert.equal(enB.estado, "caso_abierto");
  if (enB.estado === "caso_abierto") assert.equal(enB.facturaId, null);
});
