// ============================================================================
// D13 integrado a la fuente única (cobranza-core): un cobro a mano en pesos de un proyecto en USD queda fijado al
// cambio de SU día. Si después cambia el tipo de cambio del negocio, lo que se debe en USD no se mueve (sólo su pase a
// pesos de hoy) y las 5 pantallas siguen coincidiendo (`porCobrarEnLasPantallas`). Con el interruptor
// `PROYECTOS_COBRO_FIJADO` apagado, todo se valúa como antes (el cobro, al cambio de hoy). Archivo aparte: cada archivo
// es su proceso y su base efímera.
// ============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";
import { apuntarLaAppA, baseEfimeraParaElTest, prismaComoDuenio } from "@/test/base-efimera";
import { porCobrarEnLasPantallas } from "@/test/por-cobrar-en-las-pantallas";

const DIA = 86_400_000;

test("D13: cobro en ARS de un proyecto en USD; cambia el tipo de cambio y el «por cobrar» de las 5 pantallas sigue fijado y coincide", async (t) => {
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

  // P3 (USD): $ 100.000 + IVA = $ 121.000, vendido a 1.000 → 121 USD; cuotas 60 + 61 USD.
  const ahora = Date.now();
  const p = await duenio.proyecto.create({ data: { tenantId: a.id, numero: 903, clientId: a.clientes[0], nombre: "Stand 903", servicio: "ARQUITECTURA", etapa: "APROBADO", moneda: "USD" }, select: { id: true } });
  const pres = await duenio.proyectoPresupuesto.create({ data: { tenantId: a.id, proyectoId: p.id, version: 1, estado: "APROBADO", token: `tok-${p.id}`, ivaPct: 21, tcVenta: 1000 } });
  await duenio.proyectoItem.create({ data: { tenantId: a.id, presupuestoId: pres.id, rubro: "General", descripcion: "Stand", cantidad: 1, precio: 100000 } });
  for (const [concepto, monto, dias] of [["Anticipo USD", 60, -5], ["Saldo USD", 61, 20]] as const) {
    await duenio.proyectoCuota.create({ data: { tenantId: a.id, proyectoId: p.id, tipo: "COBRO", concepto, monto, moneda: "USD", venceEl: new Date(ahora + dias * DIA), auto: false } });
  }

  const { registrarCobro } = await import("./acciones");
  const { cobranzasDelNegocio, tiposDeCambio } = await import("./cobranza.server");
  const comoDuenia = { negocio: a, usuario: { id: a.duenia.id } };
  const enSesion = async <R>(fn: () => Promise<R>): Promise<R> => {
    const r = await ejecutarAccion(comoDuenia, fn);
    assert.equal(r.tipo, "respuesta", JSON.stringify(r));
    return (r as { valor: R }).valor;
  };
  const fd = new FormData();
  for (const [k, v] of Object.entries({ proyectoId: p.id, medio: "EFECTIVO", monto: "30000", nota: "en pesos" })) fd.set(k, v);
  // $ 30.000 al dólar de hoy (1.000) = 30 USD, fijados.
  assert.deepEqual(await enSesion(() => registrarCobro(fd)), { ok: true });
  const pago = await duenio.proyectoPago.findFirstOrThrow({ where: { tenantId: a.id, proyectoId: p.id } });
  assert.deepEqual([pago.monto, pago.cuotaId, pago.montoMoneda, pago.tipoCambio], [30000, null, 30, 1000]);

  const clienteDe = new Map([[p.id, a.clientes[0]]]);
  const saldoEnUsd = async () => (await enSesion(async () => (await cobranzasDelNegocio(a.id, await tiposDeCambio(a.id), 0, [p.id])).get(p.id)!)).enMoneda?.saldo;
  const todasDan = async (esperado: number, cuando: string) => {
    const pantallas = await enSesion(() => porCobrarEnLasPantallas(a.id, clienteDe));
    for (const [pantalla, valor] of Object.entries(pantallas.porProyecto.get(p.id)!)) {
      assert.ok(Math.abs(valor - esperado) < 0.005, `${cuando}: ${pantalla} da ${valor} y debía dar ${esperado}: ${JSON.stringify(Object.fromEntries(pantallas.porProyecto))}`);
    }
    assert.equal(pantallas.kpiAdmin, esperado, `${cuando}: el KPI de Administración`);
    assert.equal(pantallas.kpiEventos, esperado);
  };

  // Antes del cambio: se deben 91 USD × 1.000.
  await todasDan(91 * 1000, "con el dólar a 1.000");
  assert.equal(await saldoEnUsd(), 91);

  // Sube el dólar a 1.500: el cobro sigue valiendo 30 USD; se siguen debiendo 91 USD, ahora × 1.500, en las 5 pantallas.
  await duenio.proyectoTipoCambio.update({ where: { tenantId_moneda: { tenantId: a.id, moneda: "USD" } }, data: { porUnidad: 1500 } });
  await todasDan(91 * 1500, "con el dólar a 1.500 y el interruptor prendido");
  assert.equal(await saldoEnUsd(), 91, "lo que se debe en USD no se movió");

  // Interruptor apagado: como antes de D13, el cobro vale $ 30.000 / 1.500 = 20 USD → se deben 101 USD. También coinciden.
  process.env.PROYECTOS_COBRO_FIJADO = "off";
  await todasDan(101 * 1500, "con el interruptor apagado");
  assert.equal(await saldoEnUsd(), 101);
});
