// ============================================================================
// D13 sin la migración aplicada (20261114120000_proyecto_pago_cuota): el código tolera que falten las tres columnas de
// `ProyectoPago`. Contra una base migrada a la que se le BORRAN las columnas (como en Neon antes del Gate 2), y con el
// interruptor prendido: el cobro a mano y «Marcar cobrado» entran igual, sin escribirlas; la ficha, Finanzas, Seguimiento
// y las 5 pantallas leen sin romper, y valúan como antes de D13 (el cobro a mano, al cambio de hoy).
// ============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";
import { apuntarLaAppA, baseEfimeraParaElTest, prismaComoDuenio } from "@/test/base-efimera";
import { porCobrarEnLasPantallas } from "@/test/por-cobrar-en-las-pantallas";

const DIA = 86_400_000;

test("D13 sin migrar: cobrar, marcar y leer las pantallas no rompe y valúa como antes", async (t) => {
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

  // La base «atrás del schema»: sin las tres columnas (el índice se va con `cuotaId`).
  await duenio.$executeRawUnsafe(`ALTER TABLE "ProyectoPago" DROP COLUMN "cuotaId", DROP COLUMN "montoMoneda", DROP COLUMN "tipoCambio"`);
  const { hayColumnasCobroFijado } = await import("./cobranza.server");
  assert.equal(await hayColumnasCobroFijado(), false);

  const t0 = await duenio.tenant.findUniqueOrThrow({ where: { id: a.id }, select: { modules: true } });
  await duenio.tenant.update({ where: { id: a.id }, data: { modules: [...new Set([...t0.modules, "proyectos"])] } });
  await duenio.proyectoTipoCambio.create({ data: { tenantId: a.id, moneda: "USD", porUnidad: 1000 } });
  const ahora = Date.now();
  const p = await duenio.proyecto.create({ data: { tenantId: a.id, numero: 904, clientId: a.clientes[0], nombre: "Stand 904", servicio: "ARQUITECTURA", etapa: "APROBADO", moneda: "USD" }, select: { id: true } });
  const pres = await duenio.proyectoPresupuesto.create({ data: { tenantId: a.id, proyectoId: p.id, version: 1, estado: "APROBADO", token: `tok-${p.id}`, ivaPct: 21, tcVenta: 1000 } });
  await duenio.proyectoItem.create({ data: { tenantId: a.id, presupuestoId: pres.id, rubro: "General", descripcion: "Stand", cantidad: 1, precio: 100000 } });
  const cuotas: string[] = [];
  for (const [concepto, monto, dias] of [["Anticipo USD", 60, -5], ["Saldo USD", 61, 20]] as const) {
    cuotas.push((await duenio.proyectoCuota.create({ data: { tenantId: a.id, proyectoId: p.id, tipo: "COBRO", concepto, monto, moneda: "USD", venceEl: new Date(ahora + dias * DIA), auto: false }, select: { id: true } })).id);
  }

  const { registrarCobro } = await import("./acciones");
  const { marcarCuota } = await import("./acciones-ficha");
  const { fichaProyecto } = await import("./datos.server");
  const { exigirVer } = await import("./gestion.server");
  const { cabeceraFicha, datosSeguimiento, vistaDe } = await import("./ficha.server");
  const comoDuenia = { negocio: a, usuario: { id: a.duenia.id } };
  const enSesion = async <R>(fn: () => Promise<R>): Promise<R> => {
    const r = await ejecutarAccion(comoDuenia, fn);
    assert.equal(r.tipo, "respuesta", JSON.stringify(r));
    return (r as { valor: R }).valor;
  };
  const form = (campos: Record<string, string>) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(campos)) fd.set(k, v);
    return fd;
  };

  // $ 30.000 a mano (30 USD a 1.000) y «Marcar cobrado» de la cuota vieja (le faltan 30 USD).
  assert.deepEqual(await enSesion(() => registrarCobro(form({ proyectoId: p.id, medio: "EFECTIVO", monto: "30000" }))), { ok: true });
  const marcada = await enSesion(() => marcarCuota(form({ id: cuotas[0], medio: "TRANSFERENCIA" })));
  assert.equal(marcada.ok, true, JSON.stringify(marcada));
  const montos = await duenio.$queryRawUnsafe<{ monto: number }[]>(`SELECT monto FROM "ProyectoPago" WHERE "proyectoId" = $1 ORDER BY "createdAt"`, p.id);
  assert.deepEqual(montos.map((m) => m.monto), [30000, 30000]);

  // Las lecturas de cobros enteros (ficha, Finanzas, Seguimiento) no piden las columnas que faltan.
  const ficha = await enSesion(() => fichaProyecto(p.id));
  assert.equal(ficha?.proyecto.pagos.length, 2);
  const seguimiento = await enSesion(async () => {
    const actor = await exigirVer("pipeline");
    const cab = await cabeceraFicha(actor, p.id);
    assert.ok(cab);
    return datosSeguimiento(actor, cab, vistaDe(actor));
  });
  assert.ok(seguimiento);

  // Sube el dólar a 1.500: sin columnas no hay nada fijado; se valúa como antes (y las 5 pantallas coinciden). El cobro a
  // mano vale $ 30.000 / 1.500 = 20 USD; la cuota marcada, sus 30 USD (enlace «Asiento»): se deben 71 USD × 1.500.
  await duenio.proyectoTipoCambio.update({ where: { tenantId_moneda: { tenantId: a.id, moneda: "USD" } }, data: { porUnidad: 1500 } });
  const pantallas = await enSesion(() => porCobrarEnLasPantallas(a.id, new Map([[p.id, a.clientes[0]]])));
  for (const [pantalla, valor] of Object.entries(pantallas.porProyecto.get(p.id)!)) {
    assert.ok(Math.abs(valor - 71 * 1500) < 0.005, `${pantalla} da ${valor} y debía dar ${71 * 1500}`);
  }
  assert.equal(pantallas.kpiAdmin, 71 * 1500);
});
