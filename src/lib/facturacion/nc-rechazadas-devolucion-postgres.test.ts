// ============================================================================
// #T7 · certificación C1: una nota de crédito de una DEVOLUCIÓN de Mercado Pago que ARCA rechazó.
// La reemisión del dueño y el reenvío del aviso de MP pasan por la MISMA clave `mp:refund:<id>`:
// en cualquier orden, UNA devolución deja UNA nota viva. Y si el dueño la dio por resuelta a mano,
// el reenvío de MP no la vuelve a acreditar. Postgres real (app_rls + RLS) y simulador de ARCA.
// Rojo verificado antes del arreglo (2 notas vivas en los dos órdenes).
// ============================================================================
import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio } from "@/test/base-efimera";
import { SimuladorArca } from "@/plugins/arca/afip/simulador";
import { fechaFiscalDelDia } from "@/lib/libros/fecha-fiscal";

const HOY = fechaFiscalDelDia();
const laBase = baseEfimeraDelArchivo();
const sim = new SimuladorArca();
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
  const nc = await import("@/lib/facturacion/nc-rechazadas.server");
  const { tenantTransaction } = await import("@/lib/rls");
  const { SoapAfipClient, FetchSoapTransport } = await import("@/plugins/arca/afip/soap");
  await duenio.outboxEvent.updateMany({ where: { processedAt: null }, data: { processedAt: new Date() } });
  const deps = {
    clientePara: () => new SoapAfipClient({ cuit: 20111111112, homologacion: true }, { transport: new FetchSoapTransport({ fetch: sim.fetch, timeoutMs: 200 }), signer: { firmarCms: async () => "CMS-DE-PRUEBA" } }),
    numeroUsadoPorOtraFactura: invoiceCore.numeroUsadoPorOtraFactura,
  };
  const enviar = () => dispatch.procesarEnviosDelNegocio(base.a.id, 20, deps);
  const facturar = (tenantId: string, total: number, claves: string[], originId: string) =>
    cobros.facturarCobros({ tenantId, concepto: 1, fecha: HOY, emisor: { cuit: 20111111112, condicionIva: "MONOTRIBUTO", puntoVenta: 1 }, receptor: { docTipo: 99, docNro: 0, condicionIva: "CONSUMIDOR_FINAL" }, neto: total, iva: [{ alicuotaId: 3, base: total, importe: 0 }], total, medioDePago: "otro", origin: { type: "MP_PAYMENT", id: originId } }, claves.map((clave) => ({ clave, importe: total })));
  return { base, duenio, dev, cobros, nc, tenantTransaction, enviar, facturar };
}

for (const orden of ["reemite-y-despues-MP-reenvia", "MP-reenvia-y-despues-reemite"] as const) {
  test(`devolución MP con NC rechazada: ${orden} → ¿cuántas NC vivas por UNA devolución de 300?`, async (t) => {
    const p = await preparar(t);
    if (!p) return;
    const a = p.base.a.id;
    const pago = idUnico("51");
    const facturaId = await p.facturar(a, 1000, [p.cobros.claveCobroMP(pago), `banco:${idUnico("h")}`], pago);
    await p.duenio.cobroFacturado.updateMany({ where: { tenantId: a, clave: p.cobros.claveCobroMP(pago) }, data: { importe: 400 } });
    await p.enviar();
    const refund = { refundId: idUnico("r"), paymentId: pago, importe: 300, fecha: HOY };
    const r1 = await p.dev.notaDeCreditoPorDevolucion(a, refund);
    assert.equal(r1.estado, "nota_emitida");
    sim.fallarProximo("FECAESolicitar", { rechazo: [{ codigo: 10015, mensaje: "DocNro invalido" }] });
    await p.enviar();
    const lista = await p.tenantTransaction((tx) => p.nc.notasDeCreditoRechazadasSinReemitir(tx, a), { tenantId: a });
    assert.equal(lista.length, 1, "la rechazada aparece al dueño");
    const reemitir = () => p.tenantTransaction((tx) => p.nc.reemitirNotaDeCreditoInTx(tx, { tenantId: a, notaId: lista[0].notaId, actor: "user:x", fecha: HOY }), { tenantId: a });
    const reenvio = () => p.dev.notaDeCreditoPorDevolucion(a, refund);
    const out = orden === "reemite-y-despues-MP-reenvia" ? [await reemitir(), await reenvio()] : [await reenvio(), await reemitir()];
    // El primero emite; el segundo ve la nota viva (MP: yaExistia) o la marca (dueño: ya se volvió a emitir).
    assert.deepEqual(
      out.map((o) => ("estado" in o ? `${o.estado}:${o.estado === "nota_emitida" && o.yaExistia}` : o.ok)),
      orden === "reemite-y-despues-MP-reenvia" ? [true, "nota_emitida:true"] : ["nota_emitida:false", false],
    );
    const vivas = await p.duenio.invoice.findMany({ where: { comprobanteAsociadoId: facturaId, status: { in: ["PENDING", "AUTHORIZED"] } }, select: { total: true } });

    assert.equal(vivas.length, 1, `UNA devolución de 300 debería dejar UNA nota viva; hay ${vivas.length}`);
  });
}

test("devolución MP con NC rechazada que el dueño dio por resuelta: el reenvío de MP no la vuelve a acreditar", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const a = p.base.a.id;
  const pago = idUnico("52");
  const facturaId = await p.facturar(a, 1000, [p.cobros.claveCobroMP(pago)], pago);
  await p.enviar();
  const refund = { refundId: idUnico("r"), paymentId: pago, importe: 300, fecha: HOY };
  assert.equal((await p.dev.notaDeCreditoPorDevolucion(a, refund)).estado, "nota_emitida");
  sim.fallarProximo("FECAESolicitar", { rechazo: [{ codigo: 10015, mensaje: "DocNro invalido" }] });
  await p.enviar();
  const [nota] = await p.tenantTransaction((tx) => p.nc.notasDeCreditoRechazadasSinReemitir(tx, a), { tenantId: a });
  const ok = await p.tenantTransaction((tx) => p.nc.darPorResueltoElRechazoInTx(tx, { tenantId: a, notaId: nota.notaId, actor: "user:x", nota: "la hice en ARCA" }), { tenantId: a });
  assert.deepEqual(ok, { ok: true });
  const r = await p.dev.notaDeCreditoPorDevolucion(a, refund);
  assert.equal(r.estado, "rechazada");
  const vivas = await p.duenio.invoice.count({ where: { comprobanteAsociadoId: facturaId, status: { in: ["PENDING", "AUTHORIZED"] } } });
  assert.equal(vivas, 0, "lo resolvió a mano: el sistema no emite otra");
});
