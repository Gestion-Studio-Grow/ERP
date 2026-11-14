// ============================================================================
// #T7 · Nota de crédito RECHAZADA por ARCA, contra Postgres real (app_rls + RLS) y el cliente SOAP
// hablando con el simulador de ARCA:
//
//  · La rechazada aparece en la lista del dueño (con el motivo de ARCA) mientras la factura tenga saldo.
//  · Dos «Volver a emitir» a la vez → UNA sola nota nueva (candado + marca en la misma transacción).
//    Para que la carrera sea determinista, cada transacción espera a la otra después de mirar la marca.
//  · La nota nueva sale a ARCA y se autoriza; la rechazada y la factura (con CAE) quedan intactas.
//  · «Ya la hice en ARCA» la saca de la lista sin crear comprobantes; otro negocio no la ve ni la toca.
//
// Sin Postgres local se saltea diciendo por qué (en CI falla), como los demás `*-postgres.test.ts`.
// ============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio } from "@/test/base-efimera";
import { SimuladorArca } from "@/plugins/arca/afip/simulador";
import { fechaFiscalDelDia } from "@/lib/libros/fecha-fiscal";

const HOY = fechaFiscalDelDia();
const laBase = baseEfimeraDelArchivo();
const sim = new SimuladorArca();

async function preparar(t: import("node:test").TestContext) {
  const base = await laBase(t);
  if (!base) return null;
  apuntarLaAppA(base);
  Object.assign(process.env as Record<string, string | undefined>, { NODE_ENV: "development", DB_CONNECTION_LIMIT: "4", DB_CONNECT_TIMEOUT_MS: "3000" });
  const duenio = await prismaComoDuenio(base);
  const invoiceCore = await import("@/lib/invoice-core");
  const dispatch = await import("@/lib/arca-dispatch");
  const nc = await import("./nc-rechazadas.server");
  const { tenantTransaction } = await import("@/lib/rls");
  const { prisma } = await import("@/lib/prisma");
  const { SoapAfipClient, FetchSoapTransport } = await import("@/plugins/arca/afip/soap");
  const deps = {
    clientePara: () =>
      new SoapAfipClient(
        { cuit: 20111111112, homologacion: true },
        { transport: new FetchSoapTransport({ fetch: sim.fetch, timeoutMs: 200, interruptor: null }), signer: { firmarCms: async () => "CMS-DE-PRUEBA" } },
      ),
    numeroUsadoPorOtraFactura: invoiceCore.numeroUsadoPorOtraFactura,
  };
  const enviar = (tenantId: string) => dispatch.procesarEnviosDelNegocio(tenantId, 20, deps);

  /** Factura C autorizada + una nota de crédito por `importe` que ARCA rechaza. */
  const facturaConNotaRechazada = async (tenantId: string, total: number, importe: number) => {
    const facturaId = await invoiceCore.createInvoice({
      tenantId,
      concepto: 1,
      fecha: HOY,
      emisor: { cuit: 20111111112, condicionIva: "MONOTRIBUTO", puntoVenta: 1 },
      receptor: { docTipo: 99, docNro: 0, condicionIva: "CONSUMIDOR_FINAL" },
      neto: total,
      iva: [{ alicuotaId: 3, base: total, importe: 0 }],
      total,
    });
    await enviar(tenantId);
    const nota = await invoiceCore.crearNotaDeCredito({ tenantId, facturaId, importe, motivo: "Anulación del cobro: error", fecha: HOY });
    assert.ok(nota.ok, JSON.stringify(nota));
    sim.fallarProximo("FECAESolicitar", { rechazo: [{ codigo: 10015, mensaje: "DocNro invalido" }] });
    const r = await enviar(tenantId);
    assert.equal(r.rechazados, 1);
    return { facturaId, notaId: nota.invoiceId };
  };

  const lista = (tenantId: string) => tenantTransaction((tx) => nc.notasDeCreditoRechazadasSinReemitir(tx, tenantId), { tenantId });
  return { base, duenio, nc, tenantTransaction, prisma, enviar, facturaConNotaRechazada, lista };
}

/** Una transacción real del negocio cuyo `auditLog.findFirst` espera a la otra antes de seguir. */
function transaccionConCita(tenantTransaction: typeof import("@/lib/rls").tenantTransaction) {
  let llegaron = 0;
  let soltar: () => void = () => {};
  const cita = new Promise<void>((r) => (soltar = r));
  const esperarALaOtra = async () => {
    llegaron += 1;
    if (llegaron >= 2) soltar();
    await Promise.race([cita, new Promise((r) => setTimeout(r, 1500))]);
  };
  return <T,>(fn: (tx: import("@/lib/invoice-core").InvoiceTx) => Promise<T>, tenantId: string) =>
    tenantTransaction(
      (tx) =>
        fn(
          new Proxy(tx, {
            get(obj, k) {
              if (k !== "auditLog") return Reflect.get(obj, k);
              const al = Reflect.get(obj, k) as { findFirst: (a: unknown) => Promise<unknown> };
              return new Proxy(al, {
                get(o2, k2) {
                  if (k2 !== "findFirst") return Reflect.get(o2, k2);
                  return async (a: unknown) => {
                    const r = await o2.findFirst(a);
                    await esperarALaOtra();
                    return r;
                  };
                },
              });
            },
          }) as import("@/lib/invoice-core").InvoiceTx,
        ),
      { tenantId },
    );
}

test("la rechazada aparece con el motivo de ARCA; dos «Volver a emitir» a la vez → UNA nota nueva, autorizada, sin tocar lo autorizado", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const a = p.base.a.id;
  const { facturaId, notaId } = await p.facturaConNotaRechazada(a, 1000, 400);

  const antes = await p.lista(a);
  assert.deepEqual(
    antes.map((n) => [n.notaId, n.importe, n.saldoDeLaFactura]),
    [[notaId, 400, 1000]],
  );
  assert.match(antes[0].motivoArca, /10015/);
  const facturaAntes = await p.duenio.invoice.findUniqueOrThrow({ where: { id: facturaId } });

  const enCarrera = transaccionConCita(p.tenantTransaction);
  const pedido = { tenantId: a, notaId, actor: "user:qa", fecha: HOY };
  const [u, v] = await Promise.all([
    enCarrera((tx) => p.nc.reemitirNotaDeCreditoInTx(tx, pedido), a),
    enCarrera((tx) => p.nc.reemitirNotaDeCreditoInTx(tx, pedido), a),
  ]);
  assert.equal([u, v].filter((r) => r.ok).length, 1, `una sola reemisión: ${JSON.stringify([u, v])}`);
  const perdedora = [u, v].find((r) => !r.ok);
  if (perdedora && !perdedora.ok) assert.match(perdedora.error, /ya se volvió a emitir/);

  const notas = await p.duenio.invoice.findMany({ where: { comprobanteAsociadoId: facturaId }, orderBy: { createdAt: "asc" } });
  assert.deepEqual(notas.map((n) => [Number(n.total), n.status]), [
    [400, "REJECTED"],
    [400, "PENDING"],
  ]);
  assert.equal(await p.duenio.auditLog.count({ where: { tenantId: a, entity: "Invoice", entityId: notaId, action: "nota_credito.reemitida" } }), 1);
  assert.deepEqual(await p.lista(a), [], "el aviso se va");

  // La nueva sale a ARCA y se autoriza; la rechazada y la factura quedan como estaban.
  const r = await p.enviar(a);
  assert.equal(r.autorizados, 1);
  const [rechazada, nueva] = await p.duenio.invoice.findMany({ where: { comprobanteAsociadoId: facturaId }, orderBy: { createdAt: "asc" } });
  assert.equal(nueva.status, "AUTHORIZED");
  assert.notEqual(nueva.cae, null);
  assert.equal(rechazada.status, "REJECTED");
  assert.equal(rechazada.cae, null);
  const facturaDespues = await p.duenio.invoice.findUniqueOrThrow({ where: { id: facturaId } });
  assert.deepEqual(
    [facturaDespues.status, facturaDespues.cae, facturaDespues.numero, String(facturaDespues.total)],
    [facturaAntes.status, facturaAntes.cae, facturaAntes.numero, String(facturaAntes.total)],
  );

  // Pedirla otra vez, ya sin carrera: no duplica.
  const otraVez = await p.tenantTransaction((tx) => p.nc.reemitirNotaDeCreditoInTx(tx, pedido), { tenantId: a });
  assert.equal(otraVez.ok, false);
  if (!otraVez.ok) assert.match(otraVez.error, /ya se volvió a emitir/);
});

test("factura ya anulada entera por otra nota: no aparece y no se reemite; «ya la hice en ARCA» la saca sin crear comprobantes", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const a = p.base.a.id;
  const cubierta = await p.facturaConNotaRechazada(a, 500, 500);
  const otra = await p.tenantTransaction(
    async (tx) => (await import("@/lib/invoice-core")).crearNotaDeCreditoInTx(tx, { tenantId: a, facturaId: cubierta.facturaId, motivo: "a mano", fecha: HOY }),
    { tenantId: a },
  );
  assert.ok(otra.ok);
  assert.ok(!(await p.lista(a)).some((n) => n.notaId === cubierta.notaId), "con la factura cubierta no hay aviso");
  const r = await p.tenantTransaction((tx) => p.nc.reemitirNotaDeCreditoInTx(tx, { tenantId: a, notaId: cubierta.notaId, actor: "user:qa", fecha: HOY }), { tenantId: a });
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /anulada entera/);
  await p.enviar(a); // la «a mano» se autoriza y no deja nada colgado para el test siguiente

  const resuelta = await p.facturaConNotaRechazada(a, 300, 300);
  assert.ok((await p.lista(a)).some((n) => n.notaId === resuelta.notaId));
  const cuantasAntes = await p.duenio.invoice.count({ where: { tenantId: a } });
  const ok = await p.tenantTransaction((tx) => p.nc.darPorResueltoElRechazoInTx(tx, { tenantId: a, notaId: resuelta.notaId, actor: "user:qa", nota: "la hice en ARCA" }), { tenantId: a });
  assert.deepEqual(ok, { ok: true });
  assert.equal(await p.duenio.invoice.count({ where: { tenantId: a } }), cuantasAntes, "no crea comprobantes");
  assert.ok(!(await p.lista(a)).some((n) => n.notaId === resuelta.notaId));
  const reemitir = await p.tenantTransaction((tx) => p.nc.reemitirNotaDeCreditoInTx(tx, { tenantId: a, notaId: resuelta.notaId, actor: "user:qa", fecha: HOY }), { tenantId: a });
  assert.equal(reemitir.ok, false);
  if (!reemitir.ok) assert.match(reemitir.error, /ya se dio por resuelta/);
});

test("otro negocio no ve ni reemite la nota rechazada (RLS)", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const a = p.base.a.id;
  const b = p.base.b.id;
  const { notaId } = await p.facturaConNotaRechazada(a, 200, 200);
  assert.deepEqual(await p.lista(b), []);
  const r = await p.tenantTransaction((tx) => p.nc.reemitirNotaDeCreditoInTx(tx, { tenantId: b, notaId, actor: "user:qa", fecha: HOY }), { tenantId: b });
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /No encontramos/);
  // Aunque el código se equivoque y pida el negocio A desde una transacción de B, RLS no deja ver la nota.
  const cruzado = await p.tenantTransaction((tx) => p.nc.reemitirNotaDeCreditoInTx(tx, { tenantId: a, notaId, actor: "user:qa", fecha: HOY }), { tenantId: b });
  assert.equal(cruzado.ok, false);
  assert.equal(await p.duenio.auditLog.count({ where: { entityId: notaId, action: "nota_credito.reemitida" } }), 0);
});
