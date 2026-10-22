// ============================================================================
// MOTOR DE FACTURACIÓN contra Postgres real (app_rls + RLS) y el cliente SOAP real hablando con el
// simulador de ARCA. Lo que el motor promete, de punta a punta:
//
//  · Caída a mitad de lote: ARCA se cae después de autorizar dos; los que fallan esperan su
//    próximo intento (espera creciente), el interruptor se abre y el resto se POSPONE sin contar
//    un intento; cuando ARCA vuelve, todo queda autorizado con un CAE cada uno.
//  · «En duda»: ARCA autoriza y la respuesta se pierde; el reintento consulta y adopta ESE número.
//  · Rechazo: la factura queda rechazada con el motivo y no se reintenta.
//  · Duplicado: dos pedidos del mismo abono (regla, mes) a la vez dan UNA factura y UN CAE.
//  · Tope: al máximo de intentos el envío se detiene; «Reintentar» le da un intento más.
//  · Configuración: sin dato fiscal el envío se detiene de entrada.
//  · Nota de crédito: parcial y total, con saldo controlado aun con dos pedidos a la vez.
//  · ReglaFacturacion: la migración nueva aplica con RLS, CHECK y la llave a la cartera.
// ============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio } from "@/test/base-efimera";
import { SimuladorArca } from "@/plugins/arca/afip/simulador";
import { InterruptorArca } from "@/plugins/arca/afip/interruptor";
import { fechaFiscalDelDia } from "@/lib/libros/fecha-fiscal";

const HOY = fechaFiscalDelDia();
const laBase = baseEfimeraDelArchivo();

// Un ARCA simulado por negocio para todo el archivo (la base también dura todo el archivo: ARCA y
// la base llevan la misma numeración). Cada test mide lo que cambió él.
const simuladores = new Map<string, SimuladorArca>();
const simDe = (tenantId: string) => {
  if (!simuladores.has(tenantId)) simuladores.set(tenantId, new SimuladorArca());
  return simuladores.get(tenantId)!;
};

async function preparar(t: import("node:test").TestContext, interruptor: InterruptorArca | null = null) {
  const base = await laBase(t);
  if (!base) return null;
  apuntarLaAppA(base);
  Object.assign(process.env as Record<string, string | undefined>, {
    NODE_ENV: "development",
    DB_CONNECTION_LIMIT: "4",
    DB_CONNECT_TIMEOUT_MS: "3000",
  });
  const duenio = await prismaComoDuenio(base);
  const invoiceCore = await import("@/lib/invoice-core");
  const dispatch = await import("@/lib/arca-dispatch");
  const { SoapAfipClient, FetchSoapTransport } = await import("@/plugins/arca/afip/soap");

  // Lo que otro test dejó pendiente se da por procesado: cada test mira sólo lo suyo.
  await duenio.outboxEvent.updateMany({ where: { processedAt: null }, data: { processedAt: new Date() } });

  const deps = {
    clientePara: (tenantId: string) =>
      new SoapAfipClient(
        { cuit: 20111111112, homologacion: true },
        {
          transport: new FetchSoapTransport({ fetch: simDe(tenantId).fetch, timeoutMs: 40, interruptor }),
          signer: { firmarCms: async () => "CMS-DE-PRUEBA" },
        },
      ),
    numeroUsadoPorOtraFactura: invoiceCore.numeroUsadoPorOtraFactura,
  };
  /** La corrida siguiente «cuando ya pasó la espera» (sin tocar los detenidos). */
  const pasoLaEspera = () =>
    duenio.outboxEvent.updateMany({ where: { processedAt: null, muertoEn: null }, data: { proximoIntentoEn: null } });

  /** Factura C de un monotributista a consumidor final (productos). */
  const facturaC = (tenantId: string, total: number, extra: Partial<import("@/lib/invoice-core").CreateInvoiceInput> = {}) =>
    invoiceCore.createInvoice({
      tenantId,
      concepto: 1,
      fecha: HOY,
      emisor: { cuit: 20111111112, condicionIva: "MONOTRIBUTO", puntoVenta: 1 },
      receptor: { docTipo: 99, docNro: 0, condicionIva: "CONSUMIDOR_FINAL" },
      neto: total,
      // Convención del Core para la C: una fila al 0 % (alícuota 3) con la base = el total.
      iva: [{ alicuotaId: 3, base: total, importe: 0 }],
      total,
      ...extra,
    });
  const factura = (id: string) => duenio.invoice.findUniqueOrThrow({ where: { id } });
  const envioDe = async (invoiceId: string) => {
    const es = await duenio.outboxEvent.findMany({ orderBy: { createdAt: "asc" } });
    return es.filter((e) => (e.payload as { invoiceId?: string }).invoiceId === invoiceId);
  };
  return { base, duenio, invoiceCore, dispatch, deps, pasoLaEspera, facturaC, factura, envioDe };
}

test("caída a mitad de lote: dos autorizados, tres esperan, el interruptor corta y pospone; al volver ARCA, un CAE cada uno", async (t) => {
  let ahora = Date.now();
  const interruptor = new InterruptorArca({ ahora: () => ahora });
  const p = await preparar(t, interruptor);
  if (!p) return;
  const a = p.base.a.id;
  const sim = simDe(a);
  const caeAntes = sim.cantidadDeCae();
  const ids: string[] = [];
  for (let k = 0; k < 6; k++) ids.push(await p.facturaC(a, 100 + k));
  // Los dos primeros salen; después WSFEv1 se cae (HTTP 503) tres veces seguidas.
  const r1 = await p.dispatch.procesarEnviosDelNegocio(a, 20, p.deps);
  // (Las caídas se programan después del primer pedido para no adivinar cuántas llamadas hace cada envío.)
  assert.equal(r1.autorizados, 6, "sin caídas programadas, el lote entero sale");
  assert.equal(sim.cantidadDeCae(), caeAntes + 6);

  // Segundo lote: el simulador tira abajo FECompUltimoAutorizado (lo primero que pide cada envío).
  const lote2: string[] = [];
  for (let k = 0; k < 6; k++) lote2.push(await p.facturaC(a, 200 + k));
  const primeros = await p.dispatch.procesarEnviosDelNegocio(a, 2, p.deps);
  assert.equal(primeros.autorizados, 2);
  for (let k = 0; k < 3; k++) sim.fallarProximo("FECompUltimoAutorizado", "caido");
  const llamadosAntes = sim.llamados.length;
  const r2 = await p.dispatch.procesarEnviosDelNegocio(a, 20, p.deps);
  assert.equal(r2.fallidos, 3, "tres envíos se encontraron con ARCA caído");
  assert.equal(r2.pospuestos, 1, "el cuarto ni salió: interruptor abierto");
  assert.equal(r2.arcaNoDisponible, true, "y la corrida se cortó ahí");
  assert.equal(r2.detenidos, undefined);
  assert.equal(interruptor.estado("wswhomo.afip.gov.ar"), "abierto");
  assert.equal(
    sim.llamados.slice(llamadosAntes).filter((m) => m !== "loginCms").length,
    3,
    "a WSFEv1 le llegaron sólo los tres pedidos que se cayeron: con el interruptor abierto no se le insiste",
  );

  const [fallado] = await p.envioDe(lote2[2]);
  assert.equal(fallado.attempts, 1);
  assert.ok(fallado.proximoIntentoEn && fallado.proximoIntentoEn > new Date(), "espera su próximo intento");
  assert.match(fallado.lastError ?? "", /HTTP 503/);
  const [pospuesto] = await p.envioDe(lote2[5]);
  assert.equal(pospuesto.attempts, 0, "posponer por ARCA caído no cuenta como intento");
  assert.equal(pospuesto.processedAt, null);
  for (const id of lote2.slice(2)) assert.equal((await p.factura(id)).status, "PENDING", "ninguna se rechaza");

  // Una corrida del cron SIN que pase la espera no toma nada de lo que espera.
  const sinEspera = await p.dispatch.procesarEnviosDelNegocio(a, 20, p.deps);
  assert.equal(sinEspera.procesados + sinEspera.fallidos, 0);

  // ARCA vuelve; pasa el enfriamiento y la espera de cada envío.
  ahora += 3 * 60_000;
  await p.duenio.outboxEvent.updateMany({ where: { processedAt: null }, data: { proximoIntentoEn: null } });
  const r3 = await p.dispatch.procesarEnviosDelNegocio(a, 20, p.deps);
  assert.equal(r3.autorizados, 4);
  assert.equal(interruptor.estado("wswhomo.afip.gov.ar"), "cerrado");
  for (const id of lote2) {
    const f = await p.factura(id);
    assert.equal(f.status, "AUTHORIZED");
    assert.ok(f.cae?.startsWith("SIM"));
  }
  assert.equal(sim.cantidadDeCae(), caeAntes + 12, "un CAE por comprobante, ninguno de más");
});

test("«en duda»: ARCA autoriza y la respuesta se pierde; el reintento adopta ese número (un solo CAE)", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const a = p.base.a.id;
  const sim = simDe(a).fallarProximo("FECAESolicitar", "timeout-despues");
  const caeAntes = sim.cantidadDeCae();
  const id = await p.facturaC(a, 321);
  const r1 = await p.dispatch.procesarEnviosDelNegocio(a, 20, p.deps);
  assert.equal(r1.fallidos, 1);
  assert.equal(sim.cantidadDeCae(), caeAntes + 1, "ARCA ya lo autorizó");
  const [envio] = await p.envioDe(id);
  const intento = (envio.payload as { intentoArca?: { numero: number } }).intentoArca;
  assert.ok(intento, "el número quedó anotado ANTES de pedirlo");
  await p.pasoLaEspera();
  const r2 = await p.dispatch.procesarEnviosDelNegocio(a, 20, p.deps);
  assert.equal(r2.autorizados, 1);
  const f = await p.factura(id);
  assert.equal(f.numero, intento!.numero, "adoptó el comprobante que ARCA ya tenía");
  assert.equal(sim.cantidadDeCae(), caeAntes + 1, "no se pidió otro CAE");
});

test("rechazo: la factura queda rechazada con el motivo, el envío cerrado y no se reintenta", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const a = p.base.a.id;
  const sim = simDe(a).fallarProximo("FECAESolicitar", { rechazo: [{ codigo: 10015, mensaje: "DocNro invalido" }] });
  const caeAntes = sim.cantidadDeCae();
  const id = await p.facturaC(a, 77);
  const r = await p.dispatch.procesarEnviosDelNegocio(a, 20, p.deps);
  assert.equal(r.rechazados, 1);
  const f = await p.factura(id);
  assert.equal(f.status, "REJECTED");
  assert.match(f.rechazoMotivo ?? "", /10015/);
  const [envio] = await p.envioDe(id);
  assert.notEqual(envio.processedAt, null);
  await p.pasoLaEspera();
  const r2 = await p.dispatch.procesarEnviosDelNegocio(a, 20, p.deps);
  assert.equal(r2.procesados + r2.fallidos, 0, "un rechazo no se vuelve a mandar solo");
  assert.equal(sim.cantidadDeCae(), caeAntes);
});

test("duplicado: el mismo abono (regla, mes) pedido dos veces a la vez da UNA factura y UN CAE; otro mes, otra", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const a = p.base.a.id;
  const sim = simDe(a);
  const caeAntes = sim.cantidadDeCae();
  const clave = p.invoiceCore.claveDeAbono("regla1", "2026-10");
  const pedir = () =>
    p.facturaC(a, 15000, { origin: { type: "ABONO", id: clave }, descripcion: "Honorarios de octubre" });
  const [x, y] = await Promise.all([pedir(), pedir()]);
  assert.equal(x, y, "la base (índice único tenantId+abonoClave) deja una sola");
  assert.equal(await pedir(), x, "y un tercer pedido devuelve la misma");
  assert.equal((await p.envioDe(x)).length, 1, "un solo envío a ARCA");
  const f = await p.factura(x);
  assert.equal(f.abonoClave, clave);
  assert.equal(f.descripcion, "Honorarios de octubre");
  const noviembre = await p.facturaC(a, 15000, { origin: { type: "ABONO", id: p.invoiceCore.claveDeAbono("regla1", "2026-11") } });
  assert.notEqual(noviembre, x);
  await p.dispatch.procesarEnviosDelNegocio(a, 20, p.deps);
  assert.equal(sim.cantidadDeCae(), caeAntes + 2);
  assert.throws(() => p.invoiceCore.claveDeAbono("regla 1", "2026-13"), /inválida/);
  // Aislamiento: la misma clave en OTRO negocio es otra factura (el índice es por negocio).
  const enB = await p.facturaC(p.base.b.id, 15000, { origin: { type: "ABONO", id: clave } });
  assert.notEqual(enB, x);
});

test("tope de intentos: al máximo el envío se detiene; el cron no lo toma; «Reintentar» le da un intento más", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const a = p.base.a.id;
  const sim = simDe(a);
  const politica = { esperaInicialSeg: 60, factor: 2, esperaTopeSeg: 3600, maxIntentos: 2 };
  const id = await p.facturaC(a, 55);
  sim.fallarProximo("FECAESolicitar", { error: 501, mensaje: "Error interno" });
  sim.fallarProximo("FECAESolicitar", { error: 501, mensaje: "Error interno" });
  await p.dispatch.procesarEnviosDelNegocio(a, 20, p.deps, { politica });
  await p.pasoLaEspera();
  const r2 = await p.dispatch.procesarEnviosDelNegocio(a, 20, p.deps, { politica });
  assert.equal(r2.detenidos, 1);
  const [envio] = await p.envioDe(id);
  assert.notEqual(envio.muertoEn, null, "detenido");
  assert.equal((await p.factura(id)).status, "PENDING", "la factura no se rechaza: no se sabe si ARCA la autorizaría");
  const r3 = await p.dispatch.procesarEnviosDelNegocio(a, 20, p.deps, { politica, ignorarEspera: true });
  assert.equal(r3.procesados + r3.fallidos, 0, "un detenido no se toma ni con «Autorizar ahora» sin reactivar");
  const r4 = await p.dispatch.procesarEnviosDelNegocio(a, 20, p.deps, { politica, ignorarEspera: true, reactivarDetenidos: true });
  assert.equal(r4.autorizados, 1);
  assert.equal((await p.factura(id)).status, "AUTHORIZED");
});

test("configuración: sin dato fiscal el envío se DETIENE de entrada (no gasta intentos contra ARCA)", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const a = p.base.a.id;
  const { ConfiguracionFiscalError } = await import("@/lib/arca-reintentos");
  const id = await p.facturaC(a, 66);
  const sinCuit = {
    ...p.deps,
    clientePara: () => {
      throw new ConfiguracionFiscalError("El negocio no tiene CUIT cargado.");
    },
  };
  const r = await p.dispatch.procesarEnviosDelNegocio(a, 20, sinCuit);
  assert.equal(r.detenidos, 1);
  const [envio] = await p.envioDe(id);
  assert.notEqual(envio.muertoEn, null);
  assert.match(envio.lastError ?? "", /CUIT/);
  // Cargado el dato, «Reintentar» lo manda.
  const r2 = await p.dispatch.procesarEnviosDelNegocio(a, 20, p.deps, { ignorarEspera: true, reactivarDetenidos: true });
  assert.equal(r2.autorizados, 1);
});

test("nota de crédito: parcial, después el resto, nunca más que la factura (ni con dos pedidos a la vez)", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const a = p.base.a.id;
  const sim = simDe(a);
  const facturaId = await p.facturaC(a, 1000);

  // Sin CAE todavía: no se anula.
  const antes = await p.invoiceCore.crearNotaDeCredito({ tenantId: a, facturaId, importe: 100, motivo: "error", fecha: HOY });
  assert.equal(antes.ok, false);
  if (!antes.ok) assert.match(antes.error, /todavía no la autorizó ARCA/);

  await p.dispatch.procesarEnviosDelNegocio(a, 20, p.deps);
  const fac = await p.factura(facturaId);
  assert.equal(fac.status, "AUTHORIZED");

  const sinMotivo = await p.invoiceCore.crearNotaDeCredito({ tenantId: a, facturaId, motivo: "  ", fecha: HOY });
  assert.equal(sinMotivo.ok, false);

  const parcial = await p.invoiceCore.crearNotaDeCredito({ tenantId: a, facturaId, importe: 400, motivo: "Servicio no prestado", fecha: HOY });
  assert.ok(parcial.ok, JSON.stringify(parcial));
  const demas = await p.invoiceCore.crearNotaDeCredito({ tenantId: a, facturaId, importe: 700, motivo: "x", fecha: HOY });
  assert.equal(demas.ok, false);
  if (!demas.ok) assert.match(demas.error, /queda \$600,00 por anular/);

  // Dos pedidos del resto a la vez: la fila de la factura se toma FOR UPDATE, sale uno solo.
  const [u, v] = await Promise.all([
    p.invoiceCore.crearNotaDeCredito({ tenantId: a, facturaId, motivo: "anulación total", fecha: HOY }),
    p.invoiceCore.crearNotaDeCredito({ tenantId: a, facturaId, motivo: "anulación total", fecha: HOY }),
  ]);
  assert.equal([u, v].filter((r) => r.ok).length, 1, "una sola nota por el saldo");
  const perdedora = [u, v].find((r) => !r.ok);
  if (perdedora && !perdedora.ok) assert.match(perdedora.error, /ya está anulada entera/);

  const caeAntes = sim.cantidadDeCae();
  const r = await p.dispatch.procesarEnviosDelNegocio(a, 20, p.deps);
  assert.equal(r.autorizados, 2);
  assert.equal(sim.cantidadDeCae(), caeAntes + 2);
  const notas = await p.duenio.invoice.findMany({ where: { comprobanteAsociadoId: facturaId }, orderBy: { total: "asc" } });
  assert.deepEqual(notas.map((n) => [Number(n.total), n.status, n.tipoComprobante]), [
    [400, "AUTHORIZED", 13],
    [600, "AUTHORIZED", 13],
  ]);
  assert.match(notas[0].descripcion ?? "", /Anula parte de la factura 1-\d+: Servicio no prestado/);
  const ncEnArca = sim.comprobantesAutorizados().filter((c) => c.tipo === 13);
  assert.ok(ncEnArca.length >= 2, "ARCA tiene las notas de crédito (tipo 13, letra C)");

  // Una nota no se anula con otra nota, y en otro negocio la factura no existe.
  const sobreNota = await p.invoiceCore.crearNotaDeCredito({ tenantId: a, facturaId: notas[0].id, motivo: "x", fecha: HOY });
  assert.equal(sobreNota.ok, false);
  const otroNegocio = await p.invoiceCore.crearNotaDeCredito({ tenantId: p.base.b.id, facturaId, motivo: "x", fecha: HOY });
  assert.equal(otroNegocio.ok, false);
  if (!otroNegocio.ok) assert.match(otroNegocio.error, /No encontramos esa factura/);
});

test("ReglaFacturacion (migración nueva): RLS por estudio, llave a la cartera y CHECK de los datos", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const [a, b] = [p.base.a.id, p.base.b.id];
  await p.duenio.carteraCliente.upsert({
    where: { tenantId_clienteTenantId: { tenantId: a, clienteTenantId: b } },
    create: { tenantId: a, clienteTenantId: b, alias: "Negocio B" },
    update: {},
  });
  const regla = {
    clienteTenantId: b,
    receptorNombre: "Fulano",
    receptorDocTipo: 99,
    receptorCondicionIva: "CONSUMIDOR_FINAL",
    descripcion: "Honorarios",
    importe: 15000,
    concepto: 2,
    desde: "2026-10",
  };
  const { tenantTransaction } = await import("@/lib/rls");
  const creada = await tenantTransaction((tx) => tx.reglaFacturacion.create({ data: { tenantId: a, ...regla } }), { tenantId: a });
  assert.equal(await tenantTransaction((tx) => tx.reglaFacturacion.count(), { tenantId: a }), 1);
  assert.equal(await tenantTransaction((tx) => tx.reglaFacturacion.count(), { tenantId: b }), 0, "el cliente no ve las reglas del estudio por RLS");
  // B no puede escribir una regla a nombre de A (WITH CHECK).
  await assert.rejects(tenantTransaction((tx) => tx.reglaFacturacion.create({ data: { tenantId: a, ...regla } }), { tenantId: b }));
  // Un negocio que no está en la cartera: la llave foránea lo frena.
  await assert.rejects(p.duenio.reglaFacturacion.create({ data: { tenantId: b, ...regla, clienteTenantId: a } }));
  // CHECK: importe positivo, mes con forma, hasta ≥ desde, estado conocido.
  await assert.rejects(p.duenio.reglaFacturacion.create({ data: { tenantId: a, ...regla, importe: 0 } }));
  await assert.rejects(p.duenio.reglaFacturacion.create({ data: { tenantId: a, ...regla, desde: "2026-13" } }));
  await assert.rejects(p.duenio.reglaFacturacion.create({ data: { tenantId: a, ...regla, hasta: "2026-09" } }));
  await assert.rejects(p.duenio.reglaFacturacion.create({ data: { tenantId: a, ...regla, estado: "borrada" } }));
  await p.duenio.reglaFacturacion.update({ where: { id: creada.id }, data: { estado: "baja" } });
  // El conteo de pendientes por negocio (pedido 6) es por negocio y con RLS.
  const pendA = await p.dispatch.contarPendientesDelNegocio(a);
  const enDuenio = await p.duenio.invoice.count({ where: { tenantId: a, status: "PENDING" } });
  assert.equal(pendA, enDuenio);
});
