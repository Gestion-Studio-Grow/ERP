// ============================================================================
// D13, certificación adversarial (NO CUMPLE → arreglo): un cobro fijado se leía en la moneda que el proyecto tiene HOY.
// Proyecto en ARS, cobro de $30.000 (fijado: 30000 en ARS); se cambiaba la moneda a USD y, con el interruptor prendido,
// el cobro valía 30000 USD (porCobrar 0). Ahora:
//   1) el cobro graba la moneda en la que quedó fijado (`ProyectoPago.moneda`);
//   2) `guardarDatos` no deja cambiar la moneda con cobros vivos (también los cargados a mano, sin cuota);
//   3) si igual cambia (carrera, dato viejo), el fijado de otra moneda NO se usa: se valúa al cambio de hoy;
//   4) una fila de antes de la columna (`moneda` NULL) también se valúa al cambio de hoy.
// Archivo aparte: cada archivo es su proceso y su base efímera.
// ============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";
import { apuntarLaAppA, baseEfimeraParaElTest, prismaComoDuenio } from "@/test/base-efimera";

test("D13: cobro fijado en ARS y proyecto pasado a USD: no se lee como USD; el candado frena el cambio de moneda", async (t) => {
  const base = await baseEfimeraParaElTest(t);
  if (!base) return;
  apuntarLaAppA(base);
  Object.assign(process.env as Record<string, string | undefined>, { DB_CONNECTION_LIMIT: "8", DB_CONNECT_TIMEOUT_MS: "5000" });
  const previo = process.env.PROYECTOS_COBRO_FIJADO;
  t.after(() => {
    if (previo === undefined) delete process.env.PROYECTOS_COBRO_FIJADO;
    else process.env.PROYECTOS_COBRO_FIJADO = previo;
  });
  process.env.PROYECTOS_COBRO_FIJADO = "on";
  prepararAccionesDeServidor();
  const duenio = await prismaComoDuenio(base);
  const { a } = base;
  const t0 = await duenio.tenant.findUniqueOrThrow({ where: { id: a.id }, select: { modules: true } });
  await duenio.tenant.update({ where: { id: a.id }, data: { modules: [...new Set([...t0.modules, "proyectos"])] } });
  await duenio.proyectoTipoCambio.create({ data: { tenantId: a.id, moneda: "USD", porUnidad: 1000 } });

  const { registrarCobro } = await import("@/lib/proyectos/acciones");
  const { guardarDatos } = await import("@/lib/proyectos/acciones-ficha");
  const { cobranzasDelNegocio, tiposDeCambio } = await import("@/lib/proyectos/cobranza.server");
  const enSesion = async <R>(fn: () => Promise<R>): Promise<R> => {
    const r = await ejecutarAccion({ negocio: a, usuario: { id: a.duenia.id } }, fn);
    assert.equal(r.tipo, "respuesta", JSON.stringify(r));
    return (r as { valor: R }).valor;
  };
  const form = (campos: Record<string, string>) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(campos)) fd.set(k, v);
    return fd;
  };
  // Presupuesto aprobado de $100.000 + IVA 21 % vendido a 1000: 121 USD.
  const proyecto = async (numero: number, moneda: string) => {
    const p = await duenio.proyecto.create({ data: { tenantId: a.id, numero, clientId: a.clientes[0], nombre: `Stand ${numero}`, servicio: "ARQUITECTURA", etapa: "APROBADO", moneda }, select: { id: true } });
    const pres = await duenio.proyectoPresupuesto.create({ data: { tenantId: a.id, proyectoId: p.id, version: 1, estado: "APROBADO", token: `tok-${p.id}`, ivaPct: 21, tcVenta: 1000 } });
    await duenio.proyectoItem.create({ data: { tenantId: a.id, presupuestoId: pres.id, rubro: "General", descripcion: "Stand", cantidad: 1, precio: 100000 } });
    return p.id;
  };
  const cobranza = (id: string) => enSesion(async () => (await cobranzasDelNegocio(a.id, await tiposDeCambio(a.id), 0, [id])).get(id)!);

  // 1) Proyecto en ARS: el cobro a mano graba su moneda.
  const p1 = await proyecto(904, "ARS");
  assert.deepEqual(await enSesion(() => registrarCobro(form({ proyectoId: p1, medio: "EFECTIVO", monto: "30000", nota: "anticipo" }))), { ok: true });
  const pago = await duenio.proyectoPago.findFirstOrThrow({ where: { tenantId: a.id, proyectoId: p1 } });
  assert.deepEqual([pago.monto, pago.cuotaId, pago.montoMoneda, pago.tipoCambio, pago.moneda], [30000, null, 30000, 1, "ARS"]);

  // 2) Candado: con un cobro vivo (aunque sea a mano, sin cuota) no se cambia la moneda.
  const r = await enSesion(() => guardarDatos(form({ id: p1, nombre: "Stand 904", moneda: "USD" })));
  assert.equal(r.ok, false);
  assert.match((r as { error: string }).error, /no se puede cambiar: el proyecto ya tiene cobros registrados en ARS/);
  assert.equal((await duenio.proyecto.findUniqueOrThrow({ where: { id: p1 }, select: { moneda: true } })).moneda, "ARS");

  // 3) Si la moneda cambia igual (carrera o dato viejo): el fijado en ARS no vale como USD; se valúa al cambio de hoy.
  await duenio.proyecto.update({ where: { id: p1 }, data: { moneda: "USD" } });
  const c1 = await cobranza(p1);
  assert.deepEqual([c1.enMoneda?.moneda, c1.enMoneda?.total, c1.enMoneda?.cobrado, c1.enMoneda?.saldo], ["USD", 121, 30, 91]);
  assert.equal(c1.porCobrar, 91000);

  // 4) Cambia el tipo de cambio a 1500. Dos proyectos en USD con el mismo cobro de $30.000 fijado a 1000 (30 USD):
  //    con `moneda` = USD queda fijado; con `moneda` NULL (fila de antes de la columna) se valúa al de hoy (20 USD).
  await duenio.proyectoTipoCambio.update({ where: { tenantId_moneda: { tenantId: a.id, moneda: "USD" } }, data: { porUnidad: 1500 } });
  const fijo = await proyecto(905, "USD");
  const viejo = await proyecto(906, "USD");
  for (const [proyectoId, moneda] of [[fijo, "USD"], [viejo, null]] as const) {
    await duenio.proyectoPago.create({ data: { tenantId: a.id, proyectoId, medio: "EFECTIVO", monto: 30000, cobradoPor: "test", montoMoneda: 30, tipoCambio: 1000, moneda } });
  }
  const cf = await cobranza(fijo);
  const cv = await cobranza(viejo);
  assert.deepEqual([cf.enMoneda?.cobrado, cf.enMoneda?.saldo], [30, 91]);
  assert.deepEqual([cv.enMoneda?.cobrado, cv.enMoneda?.saldo], [20, 101]);
  // El de p1 (fijado en ARS) también al de hoy: $30.000 / 1500 = 20 USD.
  assert.deepEqual([(await cobranza(p1)).enMoneda?.cobrado], [20]);

  // 5) Anulado el cobro, la moneda se puede cambiar (los anulados no cuentan).
  await duenio.proyectoPago.updateMany({ where: { tenantId: a.id, proyectoId: viejo }, data: { anuladoEl: new Date(), anuladoPor: "test" } });
  const ok = await enSesion(() => guardarDatos(form({ id: viejo, nombre: "Stand 906", moneda: "EUR" })));
  assert.notEqual((ok as { error?: string }).error?.includes("cobros registrados") ?? false, true, JSON.stringify(ok));
});
