// ============================================================================
// QA MIA (10/11, BLOQUEANTE): el «por cobrar» de un proyecto daba 5 números distintos según la pantalla. Este test
// arma el escenario del QA contra Postgres real (base efímera migrada, app_rls + RLS, sesión de la dueña) y llama a
// los LOADERS REALES de cada pantalla. Todas tienen que dar EL MISMO número, el de la fuente única (cobranza-core):
//
//   1. Estado financiero (pestaña Resumen)        → `datosResumen(...).finanzas.aCobrar`
//   2. Caja «Cobros» (pestaña Finanzas)            → `datosFinanzas(...).saldo` (y su resumen `aCobrar`)
//   3. Ficha del cliente                          → Σ `proyectosDelCliente(clientId).porCobrar` (y la lista Clientes)
//   4. Números (Rentabilidad «Por cobrar»)         → `reporteProyectos()[i].porCobrar` (+ Dirección: mismo cobrado)
//   5. Administración «A cobrar»                   → `recuadrosDeCuotas(...)`: KPI = Σ renglones (cuotas + sin calendario)
//
// Escenario:
//   · P1 en pesos: aprobado $ 1.210 (1.000 + IVA 21 %), cuotas 605 + 605. La primera MARCADA PAGA SIN COBRO (se la
//     marcó a mano en la base: no hay `ProyectoPago`) y un cobro manual parcial de $ 300. Debe: 1.210 − 300 = 910.
//     (Las pantallas viejas daban 605 si sumaban la cuota marcada, o 305 si sumaban las dos cosas.)
//   · P2 en USD: vendido a 1.000 $/USD (121 USD), dólar de hoy 1.200. Un cobro manual EN PESOS de $ 36.000 (30 USD
//     de hoy) y «Marcar cobrado» de la cuota vieja de 60 USD (cobra lo que le falta: 30 USD). Debe: 61 USD × 1.200.
// ============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";
import { apuntarLaAppA, baseEfimeraParaElTest, prismaComoDuenio } from "@/test/base-efimera";
import { porCobrarEnLasPantallas } from "@/test/por-cobrar-en-las-pantallas";

const DIA = 86_400_000;

test("QA MIA: con cuotas marcadas sin cobro, un cobro parcial y un proyecto en USD cobrado en pesos, las 5 pantallas dan el mismo «por cobrar»", async (t) => {
  const base = await baseEfimeraParaElTest(t);
  if (!base) return;
  apuntarLaAppA(base);
  Object.assign(process.env as Record<string, string | undefined>, { DB_CONNECTION_LIMIT: "8", DB_CONNECT_TIMEOUT_MS: "5000" });
  prepararAccionesDeServidor();
  const duenio = await prismaComoDuenio(base);
  const { a } = base;

  const t0 = await duenio.tenant.findUniqueOrThrow({ where: { id: a.id }, select: { modules: true } });
  await duenio.tenant.update({ where: { id: a.id }, data: { modules: [...new Set([...t0.modules, "proyectos"])] } });
  await duenio.proyectoTipoCambio.create({ data: { tenantId: a.id, moneda: "USD", porUnidad: 1200 } });

  const ahora = Date.now();
  const proyecto = async (numero: number, clientId: string, moneda: string, tcVenta: number | null) => {
    const p = await duenio.proyecto.create({ data: { tenantId: a.id, numero, clientId, nombre: `Stand ${numero}`, servicio: "ARQUITECTURA", etapa: "APROBADO", moneda }, select: { id: true } });
    const pres = await duenio.proyectoPresupuesto.create({ data: { tenantId: a.id, proyectoId: p.id, version: 1, estado: "APROBADO", token: `tok-${p.id}`, ivaPct: 21, tcVenta } });
    return { id: p.id, presupuestoId: pres.id };
  };
  const cuota = async (proyectoId: string, concepto: string, monto: number, moneda: string, dias: number, extra: Record<string, unknown> = {}) =>
    (await duenio.proyectoCuota.create({ data: { tenantId: a.id, proyectoId, tipo: "COBRO", concepto, monto, moneda, venceEl: new Date(ahora + dias * DIA), auto: false, ...extra }, select: { id: true } })).id;

  // P1 (pesos): aprobado 1.210; la primera cuota marcada paga SIN cobro registrado.
  const p1 = await proyecto(901, a.clientes[0], "ARS", null);
  await duenio.proyectoItem.create({ data: { tenantId: a.id, presupuestoId: p1.presupuestoId, rubro: "General", descripcion: "Stand", cantidad: 1, precio: 1000 } });
  await cuota(p1.id, "Anticipo", 605, "ARS", -10, { pagadoEl: new Date(ahora - 9 * DIA), pagadoPor: "migración", medio: "TRANSFERENCIA" });
  await cuota(p1.id, "Saldo", 605, "ARS", 10);

  // P2 (USD): $ 100.000 + IVA = $ 121.000, vendido a 1.000 → 121 USD; cuotas 60 + 61 USD.
  const p2 = await proyecto(902, a.clientes[1], "USD", 1000);
  await duenio.proyectoItem.create({ data: { tenantId: a.id, presupuestoId: p2.presupuestoId, rubro: "General", descripcion: "Stand", cantidad: 1, precio: 100000 } });
  const qu1 = await cuota(p2.id, "Anticipo USD", 60, "USD", -5);
  await cuota(p2.id, "Saldo USD", 61, "USD", 20);

  const { registrarCobro } = await import("./acciones");
  const { marcarCuota } = await import("./acciones-ficha");
  const { redondear } = await import("./core");

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

  // La plata entra por las acciones reales: el cobro parcial de P1, el cobro en pesos de P2 y «Marcar cobrado» de su cuota vieja.
  assert.deepEqual(await enSesion(() => registrarCobro(form({ proyectoId: p1.id, medio: "TRANSFERENCIA", monto: "300", nota: "parcial" }))), { ok: true });
  assert.deepEqual(await enSesion(() => registrarCobro(form({ proyectoId: p2.id, medio: "EFECTIVO", monto: "36000", nota: "en pesos" }))), { ok: true });
  const marcada = await enSesion(() => marcarCuota(form({ id: qu1, medio: "TRANSFERENCIA" })));
  assert.equal(marcada.ok, true, JSON.stringify(marcada));
  // Lo que cobró «Marcar cobrado»: lo que le faltaba a la cuota (60 − 30 USD), a 1.200.
  const pagosP2 = await duenio.proyectoPago.findMany({ where: { proyectoId: p2.id }, orderBy: { createdAt: "asc" }, select: { monto: true } });
  assert.deepEqual(pagosP2.map((x) => x.monto), [36000, 36000]);

  const esperado = new Map([
    [p1.id, 910],
    [p2.id, 61 * 1200],
  ]);
  const clienteDe = new Map([
    [p1.id, a.clientes[0]],
    [p2.id, a.clientes[1]],
  ]);

  const pantallas = await enSesion(() => porCobrarEnLasPantallas(a.id, clienteDe));

  for (const [id, valores] of pantallas.porProyecto) {
    for (const [pantalla, valor] of Object.entries(valores)) {
      assert.ok(Math.abs(valor - esperado.get(id)!) < 0.005, `${pantalla} da ${valor} y debía dar ${esperado.get(id)} (proyecto ${id}): ${JSON.stringify(valores)}`);
    }
  }
  const total = redondear([...esperado.values()].reduce((s, v) => s + v, 0));
  assert.equal(pantallas.kpiAdmin, total, "el «A cobrar» de Administración es la suma de los proyectos");
  assert.equal(pantallas.kpiEventos, total);
});
