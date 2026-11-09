// ============================================================================
// Etapa 2 · T2 · Facturar una cuota de cobro de un proyecto con ARCA — contra Postgres real
// (app_rls + RLS, base efímera migrada con 20261110120000_invoice_proyecto_cuota) y el cliente SOAP
// real hablando con el SIMULADOR de ARCA (nunca homologación ni real).
//
//  (a) 20 iteraciones: 5 «Facturar» a la vez (la acción real, con sesión, negocio B) → 1 factura, 1 envío, mismo id.
//  (b) facturar + despachos a la vez, ARCA autoriza y la respuesta se pierde, reintento → 1 CAE.
//  (c) rechazada → «Volver a facturar» (dos a la vez) reabre la MISMA fila → 1 CAE.
//  (e) regenerar las cuotas después de facturar no toca la cuota facturada (ni la anula); quitar y
//      escribir el texto `factura` se niegan.
//  (f) otro negocio no ve ni factura la cuota (RLS + acción).
//  (d) sin la columna (migración sin aplicar) → se niega sin escribir. VA ÚLTIMO: borra la columna.
// ============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio } from "@/test/base-efimera";
import { SimuladorArca } from "@/plugins/arca/afip/simulador";

const laBase = baseEfimeraDelArchivo();
const simuladores = new Map<string, SimuladorArca>();
const simDe = (tenantId: string) => {
  if (!simuladores.has(tenantId)) simuladores.set(tenantId, new SimuladorArca());
  return simuladores.get(tenantId)!;
};
const DIA = 86_400_000;

async function preparar(t: import("node:test").TestContext) {
  const base = await laBase(t);
  if (!base) return null;
  apuntarLaAppA(base);
  Object.assign(process.env as Record<string, string | undefined>, {
    NODE_ENV: "development",
    DB_CONNECTION_LIMIT: "12",
    DB_CONNECT_TIMEOUT_MS: "5000",
    ARCA_INVOICING_ENABLED: "true",
  });
  delete (process.env as Record<string, string | undefined>).ARCA_MODO; // stub: nunca homologación ni real
  prepararAccionesDeServidor();
  const duenio = await prismaComoDuenio(base);
  const acciones = await import("./acciones-ficha");
  const empresa = await import("./acciones-empresa");
  const srv = await import("./facturar-cuota.server");
  const dispatch = await import("@/lib/arca-dispatch");
  const invoiceCore = await import("@/lib/invoice-core");
  const fiscal = await import("@/lib/fiscal");
  const { SoapAfipClient, FetchSoapTransport } = await import("@/plugins/arca/afip/soap");

  // Lo que otro test dejó pendiente se da por procesado: cada test mira sólo lo suyo.
  await duenio.outboxEvent.updateMany({ where: { processedAt: null }, data: { processedAt: new Date() } });

  // Los dos negocios facturan cuotas: interruptor + ARCA + perfil fiscal de inscripto (homologación).
  for (const n of [base.a, base.b]) {
    const t0 = await duenio.tenant.findUniqueOrThrow({ where: { id: n.id }, select: { modules: true } });
    const modules = [...new Set([...t0.modules, "proyectos", "proyectos-facturacion", "arca"])];
    await duenio.tenant.update({ where: { id: n.id }, data: { modules, arcaCuit: "20111111112", arcaPuntoVenta: 1, arcaHomologacion: true, arcaCondicionIva: "RESPONSABLE_INSCRIPTO" } });
  }

  const simDeps = {
    clientePara: async (tenantId: string) =>
      new SoapAfipClient(
        { cuit: 20111111112, homologacion: true },
        {
          transport: new FetchSoapTransport({ fetch: simDe(tenantId).fetch, timeoutMs: 200 }),
          signer: { firmarCms: async () => "CMS-DE-PRUEBA" },
        },
      ),
    numeroUsadoPorOtraFactura: invoiceCore.numeroUsadoPorOtraFactura,
  };
  const depsConSim = {
    getFiscalProfile: fiscal.getFiscalProfile,
    isInvoicingEnabled: () => true,
    ahora: () => new Date(),
    procesarEnviosDelNegocio: (tenantId: string) => dispatch.procesarEnviosDelNegocio(tenantId, 20, simDeps),
  };
  const pasoLaEspera = () => duenio.outboxEvent.updateMany({ where: { processedAt: null, muertoEn: null }, data: { proximoIntentoEn: null } });

  let numero = (await duenio.proyecto.count()) + 100;
  /** Proyecto de A confirmado, con fechas, presupuesto al 21 % y un ítem de $ 1.000. */
  const proyecto = async (tenantId = base.a.id, clientId = base.a.clientes[0]) => {
    const evento = new Date(Date.now() + 20 * DIA);
    const p = await duenio.proyecto.create({
      data: { tenantId, numero: ++numero, clientId, nombre: `Stand ${numero}`, servicio: "ARQUITECTURA", etapa: "APROBADO", fechaArmado: new Date(evento.getTime() - 2 * DIA), fechaEvento: evento, fechaDesarme: new Date(evento.getTime() + DIA) },
      select: { id: true },
    });
    const pres = await duenio.proyectoPresupuesto.create({ data: { tenantId, proyectoId: p.id, version: 1, token: `tok-${p.id}`, ivaPct: 21 }, select: { id: true } });
    await duenio.proyectoItem.create({ data: { tenantId, presupuestoId: pres.id, rubro: "General", descripcion: "Stand", cantidad: 1, precio: 1000 } });
    return { id: p.id, presupuestoId: pres.id };
  };
  /** Un cobro manual de A por $ 1.210 (IVA incluido). */
  const cuota = async (proyectoId: string, extra: Record<string, unknown> = {}, tenantId = base.a.id) =>
    (await duenio.proyectoCuota.create({ data: { tenantId, proyectoId, tipo: "COBRO", concepto: "Anticipo", monto: 1210, moneda: "ARS", venceEl: new Date(Date.now() + 5 * DIA), auto: false, ...extra }, select: { id: true } })).id;

  const form = (campos: Record<string, string>) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(campos)) fd.set(k, v);
    return fd;
  };
  const comoDuenia = (negocio = base.a) => ({ negocio, usuario: { id: negocio.duenia.id } });
  const accion = async <R>(fn: () => Promise<R>, negocio = base.a): Promise<R> => {
    const r = await ejecutarAccion(comoDuenia(negocio), fn);
    assert.equal(r.tipo, "respuesta", JSON.stringify(r));
    return (r as { valor: R }).valor;
  };
  const facturasDe = (cuotaId: string) => duenio.invoice.findMany({ where: { proyectoCuotaId: cuotaId } });
  const enviosDe = async (invoiceId: string) =>
    (await duenio.outboxEvent.findMany({ where: { type: "InvoiceCreated" }, orderBy: { createdAt: "asc" } })).filter((e) => (e.payload as { invoiceId?: string }).invoiceId === invoiceId);
  const pendientes = () => duenio.outboxEvent.count({ where: { processedAt: null, type: "InvoiceCreated" } });

  return { base, duenio, acciones, empresa, srv, dispatch, simDeps, depsConSim, pasoLaEspera, proyecto, cuota, form, accion, facturasDe, enviosDe, pendientes };
}

test("(a) 20 de 20: cinco «Facturar» a la vez de la misma cuota → 1 factura, 1 envío, el mismo id", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  // En el negocio B: la acción despacha con el stub del Core (ARCA_MODO sin setear), que numera su
  // propia serie; los tests con el simulador usan la serie de A (dos «ARCA» sobre la misma serie chocan).
  const b = p.base.b;
  const malas: unknown[] = [];
  for (let i = 0; i < 20; i++) {
    const pr = await p.proyecto(b.id, b.clientes[0]);
    const id = await p.cuota(pr.id, { concepto: `Anticipo ${i}` }, b.id);
    const rs = await Promise.all(Array.from({ length: 5 }, () => p.accion(() => p.acciones.facturarCuota(p.form({ id, proyectoId: pr.id })), b)));
    const facturas = await p.facturasDe(id);
    const envios = facturas.length === 1 ? await p.enviosDe(facturas[0].id) : [];
    const ids = new Set(rs.map((r) => (r.ok ? (r as { invoiceId?: string }).invoiceId : `error:${(r as { error: string }).error}`)));
    const cambios = await p.duenio.proyectoCambio.count({ where: { entidadId: id, campo: { startsWith: "Factura pedida" } } });
    const ok = facturas.length === 1 && envios.length === 1 && ids.size === 1 && ids.has(facturas[0].id) && cambios === 1 &&
      facturas[0].total.toNumber() === 1210 && facturas[0].concepto === 2;
    if (!ok) malas.push({ i, facturas: facturas.length, envios: envios.length, ids: [...ids], cambios });
  }
  assert.deepEqual(malas, []);
});

test("(b) facturar y despachar a la vez, ARCA autoriza y la respuesta se pierde, reintento → 1 CAE, el número de ARCA", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const a = p.base.a.id;
  const pr = await p.proyecto();
  const id = await p.cuota(pr.id);
  const sim = simDe(a).fallarProximo("FECAESolicitar", "timeout-despues");
  const caeAntes = sim.cantidadDeCae();
  const facturar = () => p.srv.facturarCuotaDelProyecto({ tenantId: a, proyectoId: pr.id, cuotaId: id, autor: "test" }, p.depsConSim);
  const [r1, r2] = await Promise.all([
    facturar(),
    facturar(),
    p.dispatch.processArcaOutbox(20, p.simDeps),
    p.dispatch.procesarEnviosDelNegocio(a, 20, p.simDeps),
  ]);
  assert.ok(r1.ok && r2.ok, JSON.stringify([r1, r2]));
  assert.equal(r1.invoiceId, r2.invoiceId);
  for (let k = 0; k < 6 && (await p.pendientes()) > 0; k++) {
    await p.pasoLaEspera();
    await p.dispatch.procesarEnviosDelNegocio(a, 20, p.simDeps);
  }
  // Un tercer pedido (doble clic tardío) no pide otro número.
  const r3 = await facturar();
  assert.ok(r3.ok && r3.invoiceId === r1.invoiceId && r3.yaEstaba);
  const facturas = await p.facturasDe(id);
  assert.equal(facturas.length, 1);
  assert.equal(facturas[0].status, "AUTHORIZED");
  assert.equal(sim.cantidadDeCae() - caeAntes, 1, "un solo CAE en ARCA");
  const enArca = sim.comprobantesAutorizados().find((c) => c.cae === facturas[0].cae);
  assert.equal(enArca?.numero, facturas[0].numero, "el número de la base es el que ARCA tiene");
  assert.equal(enArca?.concepto, "2", "servicios");
  assert.equal((await p.enviosDe(facturas[0].id)).length, 1, "un envío");
});

test("(c) rechazada por ARCA → «Volver a facturar» (dos a la vez) reabre la MISMA factura → 1 CAE", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const a = p.base.a.id;
  const pr = await p.proyecto();
  const id = await p.cuota(pr.id);
  const sim = simDe(a).fallarProximo("FECAESolicitar", { rechazo: [{ codigo: 10015, mensaje: "DocNro invalido" }] });
  const caeAntes = sim.cantidadDeCae();
  const facturar = () => p.srv.facturarCuotaDelProyecto({ tenantId: a, proyectoId: pr.id, cuotaId: id, autor: "test" }, p.depsConSim);
  const r0 = await facturar();
  assert.ok(r0.ok);
  let [f] = await p.facturasDe(id);
  assert.equal(f.status, "REJECTED");
  assert.equal(sim.cantidadDeCae(), caeAntes);

  const [r1, r2] = await Promise.all([facturar(), facturar()]);
  assert.ok(r1.ok && r2.ok);
  assert.equal(r1.invoiceId, r0.invoiceId, "la misma fila");
  assert.equal(r2.invoiceId, r0.invoiceId);
  for (let k = 0; k < 6 && (await p.pendientes()) > 0; k++) {
    await p.pasoLaEspera();
    await p.dispatch.procesarEnviosDelNegocio(a, 20, p.simDeps);
  }
  const facturas = await p.facturasDe(id);
  assert.equal(facturas.length, 1);
  [f] = facturas;
  assert.equal(f.status, "AUTHORIZED");
  assert.equal(sim.cantidadDeCae() - caeAntes, 1, "un solo CAE");
  const envios = await p.enviosDe(f.id);
  assert.equal(envios.length, 2, "el del rechazo y UNO del reintento");
  assert.equal(envios.filter((e) => e.processedAt === null).length, 0);
  assert.equal(await p.duenio.proyectoCambio.count({ where: { entidadId: id, campo: { startsWith: "Factura reenviada" } } }), 1, "una sola reapertura");
});

test("(e) regenerar después de facturar no toca la cuota facturada; quitar y escribir el texto `factura` se niegan", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const a = p.base.a.id;
  const pr = await p.proyecto();
  // Las cuotas automáticas: anticipo y saldo del cliente.
  assert.deepEqual(await p.accion(() => p.acciones.recalcularCuotas(p.form({ proyectoId: pr.id }))), { ok: true });
  const auto = await p.duenio.proyectoCuota.findMany({ where: { proyectoId: pr.id, auto: true, tipo: "COBRO", anuladoEl: null }, orderBy: { clave: "asc" } });
  const anticipo = auto.find((c) => c.clave?.endsWith(":anticipo"));
  assert.ok(anticipo && !anticipo.prevista, JSON.stringify(auto));
  const r = await p.srv.facturarCuotaDelProyecto({ tenantId: a, proyectoId: pr.id, cuotaId: anticipo.id, autor: "test" }, p.depsConSim);
  assert.ok(r.ok, JSON.stringify(r));

  // La ficha cambia: el precio sube y el anticipo baja a 0 % (el plan ya no trae anticipo).
  await p.duenio.proyectoItem.updateMany({ where: { presupuestoId: pr.presupuestoId }, data: { precio: 3000 } });
  await p.duenio.proyecto.update({ where: { id: pr.id }, data: { anticipoClientePct: 0 } });
  assert.deepEqual(await p.accion(() => p.acciones.recalcularCuotas(p.form({ proyectoId: pr.id }))), { ok: true });
  const despues = await p.duenio.proyectoCuota.findUniqueOrThrow({ where: { id: anticipo.id } });
  assert.equal(despues.monto, anticipo.monto, "el monto facturado no se mueve");
  assert.equal(despues.anuladoEl, null, "la cuota facturada no se anula");
  const vivas = await p.duenio.proyectoCuota.findMany({ where: { proyectoId: pr.id, tipo: "COBRO", anuladoEl: null } });
  const total = vivas.reduce((s, c) => s + c.monto, 0);
  assert.equal(Math.round(total * 100), Math.round(3000 * 1.21 * 100), "el resto del plan se ajusta a lo facturado");

  // Un cobro manual facturado no se quita; el texto `factura` no se escribe encima.
  const manual = await p.cuota(pr.id, { concepto: "Extra" });
  assert.ok((await p.srv.facturarCuotaDelProyecto({ tenantId: a, proyectoId: pr.id, cuotaId: manual, autor: "test" }, p.depsConSim)).ok);
  const q = await p.accion(() => p.acciones.quitarMovimiento(p.form({ id: manual, proyectoId: pr.id })));
  assert.equal(q.ok, false);
  assert.equal((await p.duenio.proyectoCuota.findUniqueOrThrow({ where: { id: manual } })).anuladoEl, null);
  const g = await p.accion(() => p.empresa.guardarDatoCuota(p.form({ id: manual, campo: "factura", valor: "FC B 0001-00000099" })));
  assert.equal(g.ok, false);
  assert.equal((await p.duenio.proyectoCuota.findUniqueOrThrow({ where: { id: manual } })).factura, null);

  // Y al revés: una cuota con el texto ya cargado (facturada fuera del sistema) no se factura.
  const afuera = await p.cuota(pr.id, { concepto: "Facturada afuera", factura: "FC A 0003-00000012" });
  const r2 = await p.accion(() => p.acciones.facturarCuota(p.form({ id: afuera, proyectoId: pr.id })));
  assert.equal(r2.ok, false);
  assert.match((r2 as { error: string }).error, /fuera del sistema/);
  assert.equal((await p.facturasDe(afuera)).length, 0);
});

test("(f) otro negocio no ve ni factura la cuota de A (RLS y acción)", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const { a, b } = p.base;
  const pr = await p.proyecto();
  const id = await p.cuota(pr.id);
  const deA = await p.srv.facturarCuotaDelProyecto({ tenantId: a.id, proyectoId: pr.id, cuotaId: id, autor: "test" }, p.depsConSim);
  assert.ok(deA.ok);

  // B por la acción, con el proyecto y la cuota de A.
  const r = await p.accion(() => p.acciones.facturarCuota(p.form({ id, proyectoId: pr.id })), b);
  assert.equal(r.ok, false);
  // B directo al núcleo con su negocio y los ids de A: RLS no le deja ver la cuota.
  const r2 = await p.srv.facturarCuotaDelProyecto({ tenantId: b.id, proyectoId: pr.id, cuotaId: id, autor: "test" }, p.depsConSim);
  assert.deepEqual(r2, { ok: false, error: "Esa cuota no existe." });
  // B no ve la factura de A.
  assert.equal((await p.srv.facturasDeCuotas(b.id, [id])).size, 0);
  assert.equal((await p.srv.facturasDeCuotas(a.id, [id])).size, 1);
  assert.equal(await p.duenio.invoice.count({ where: { tenantId: b.id, proyectoCuotaId: id } }), 0);
  assert.equal((await p.facturasDe(id)).length, 1);
});

test("(d) sin la columna (migración sin aplicar): se niega sin escribir, regenerar y quitar siguen andando", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const pr = await p.proyecto();
  const id = await p.cuota(pr.id);
  // Sólo en ESTA base efímera: como Neon antes de aplicar 20261110120000.
  await p.duenio.$executeRawUnsafe(`ALTER TABLE "Invoice" DROP COLUMN "proyectoCuotaId"`);
  p.srv.olvidarColumnaCuotaParaTests();
  assert.equal(await p.srv.hayColumnaCuotaEnInvoice(), false);
  const facturasAntes = (await p.duenio.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*)::bigint AS n FROM "Invoice"`))[0].n;
  const enviosAntes = await p.duenio.outboxEvent.count();
  const r = await p.accion(() => p.acciones.facturarCuota(p.form({ id, proyectoId: pr.id })));
  assert.equal(r.ok, false);
  assert.match((r as { error: string }).error, /espera su migración/);
  assert.equal((await p.duenio.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*)::bigint AS n FROM "Invoice"`))[0].n, facturasAntes);
  assert.equal(await p.duenio.outboxEvent.count(), enviosAntes);
  assert.equal(await p.duenio.proyectoCambio.count({ where: { entidadId: id } }), 0);
  // Lo de siempre no se rompe: recalcular y quitar un movimiento.
  assert.deepEqual(await p.accion(() => p.acciones.recalcularCuotas(p.form({ proyectoId: pr.id }))), { ok: true });
  assert.deepEqual(await p.accion(() => p.acciones.quitarMovimiento(p.form({ id, proyectoId: pr.id }))), { ok: true });
});
