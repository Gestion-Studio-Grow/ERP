// ============================================================================
// MIA-50 · T08 · Adenda 1 § B (CG1-CG8): las cuentas generales del negocio suman lo de Proyectos. Contra Postgres real:
// base efímera con todas las migraciones, rol app_rls sin BYPASSRLS y las lecturas/acciones reales con sesión.
// Esperados escritos a mano desde la Adenda (R7). Todo ficticio y marcado «CG T08».
//
// Datos (negocio A; B, los mismos):
//   propias   a cobrar 100.000 con un cobro de 30.000 → 70.000 · a pagar 50.000
//   P1 (ARS)  venta con IVA 500.000: cuota cobrada 200.000, cuota pendiente 300.000, cobro suelto 50.000 → 250.000
//   P2 (USD)  cuota de US$ 1.000, cambio de venta y de hoy 1.200 → 1.200.000
//   no suman  prevista 40.000 sin marcar, anulada 25.000, cobro de un perdido 60.000
//   a pagar   cuota a proveedor 80.000 con un pago parcial de 30.000 → 50.000; gasto sin pagar 10.000 + IVA 2.100 →
//             12.100; cuota de la empresa sin proyecto 15.000 → 77.100
//   CG1  a cobrar 1.520.000 · a pagar 127.100
//
// Orden (una base por archivo): CG1, CG2, CG4, CG5, CG6, CG8, CG7 y CG3 al final (los dos últimos mueven datos).
// Reloj fijado: `Date` vale AHORA (19/11/2026 15:00 en Buenos Aires).
// ============================================================================

import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio, type NegocioDePrueba } from "@/test/base-efimera";

const laBase = baseEfimeraDelArchivo();
const DIA = 86_400_000;
const AHORA = Date.parse("2026-11-19T18:00:00Z");
const HOY = "2026-11-19";

type Ids = { ar: string; p1: string; p2: string; cuota300: string; cuotas: string[] };
let sembrado: { a: Ids; b: Ids } | null = null;

async function preparar(t: import("node:test").TestContext) {
  const base = await laBase(t);
  if (!base) return null;
  mock.timers.enable({ apis: ["Date"], now: AHORA });
  t.after(() => mock.timers.reset());
  apuntarLaAppA(base);
  Object.assign(process.env as Record<string, string | undefined>, { NODE_ENV: "development", DB_CONNECTION_LIMIT: "12", DB_CONNECT_TIMEOUT_MS: "5000" });
  prepararAccionesDeServidor();
  const duenio = await prismaComoDuenio(base);
  const { a, b } = base;

  const acciones = await import("./acciones");
  const ficha = await import("./acciones-ficha");
  const empresa = await import("./acciones-empresa");
  const cg = await import("./cuentas-generales.server");
  const cgCore = await import("./cuentas-generales");
  const emp = await import("./empresa.server");
  const flujo = await import("@/lib/reports/flujo-lectura");
  const { HORIZONTE_POR_DEFECTO } = await import("@/lib/reports/flujo");
  const { prisma } = await import("@/lib/prisma");
  // La acción de la pantalla (`registerReceivableCollection`) pide la app «cuentas-a-cobrar» del catálogo, que el negocio
  // de prueba no trae; el control del id está en el servicio que llama (`collectReceivable`), que es lo que se prueba.
  const { collectReceivable } = await import("@/lib/debts/receivable-service");
  const cobrarFiado = (n: NegocioDePrueba, id: string, amount: number) =>
    como(n, n.duenia.id, () => collectReceivable(n.id, id, { amount, method: "EFECTIVO", note: null, by: `user:${n.duenia.id}` }).then(() => "ok", (e: Error) => `error: ${e.message}`));

  const form = (campos: Record<string, string>) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(campos)) fd.set(k, v);
    return fd;
  };
  const como = async <R>(negocio: NegocioDePrueba, usuarioId: string, fn: () => Promise<R>): Promise<R> => {
    const r = await ejecutarAccion({ negocio, usuario: { id: usuarioId } }, fn);
    assert.equal(r.tipo, "respuesta", JSON.stringify(r));
    return (r as { valor: R }).valor;
  };
  const ok = (r: unknown) => assert.equal((r as { ok: boolean }).ok, true, JSON.stringify(r));

  let numero = (await duenio.proyecto.count()) + 900;
  const proyecto = async (n: NegocioDePrueba, d: { precio: number; moneda?: string; tcVenta?: number; perdido?: boolean }) => {
    const evento = new Date(AHORA + 30 * DIA);
    const p = await duenio.proyecto.create({
      data: {
        tenantId: n.id, numero: ++numero, clientId: n.clientes[0], nombre: `CG T08 ${numero}`, servicio: "ARQUITECTURA", etapa: "APROBADO", moneda: d.moneda ?? "ARS",
        fechaArmado: new Date(evento.getTime() - 2 * DIA), fechaEvento: evento, fechaDesarme: new Date(evento.getTime() + DIA), perdidoEl: d.perdido ? new Date(AHORA - DIA) : null,
      },
      select: { id: true },
    });
    const pres = await duenio.proyectoPresupuesto.create({ data: { tenantId: n.id, proyectoId: p.id, version: 1, estado: "APROBADO", token: `cg-${p.id}`, ivaPct: 21, tcVenta: d.tcVenta ?? null }, select: { id: true } });
    await duenio.proyectoItem.create({ data: { tenantId: n.id, presupuestoId: pres.id, rubro: "General", descripcion: "Stand", cantidad: 1, precio: d.precio } });
    return p.id;
  };
  const cuota = async (n: NegocioDePrueba, d: { proyectoId: string | null; monto: number; tipo?: string; moneda?: string; prevista?: boolean; anulada?: boolean; supplierId?: string }) =>
    (
      await duenio.proyectoCuota.create({
        data: {
          tenantId: n.id, proyectoId: d.proyectoId, tipo: d.tipo ?? "COBRO", concepto: `Cuota CG T08 ${d.monto}`, monto: d.monto, moneda: d.moneda ?? "ARS",
          venceEl: new Date(AHORA + 5 * DIA), auto: false, prevista: !!d.prevista, anuladoEl: d.anulada ? new Date(AHORA - DIA) : null, supplierId: d.supplierId ?? null,
        },
        select: { id: true },
      })
    ).id;

  /** El seed de la Adenda en un negocio. Idempotente por archivo: se siembra una vez. */
  const sembrar = async (n: NegocioDePrueba): Promise<Ids> => {
    const t0 = await duenio.tenant.findUniqueOrThrow({ where: { id: n.id }, select: { modules: true } });
    await duenio.tenant.update({ where: { id: n.id }, data: { modules: [...new Set([...t0.modules, "proyectos"])] } });
    const sup = await duenio.supplier.create({ data: { tenantId: n.id, name: "Proveedor CG T08" }, select: { id: true } });
    // Propias: a cobrar 100.000 − 30.000; a pagar 50.000.
    const ar = await duenio.accountReceivable.create({ data: { tenantId: n.id, clientId: n.clientes[0], amount: 100_000, concept: "Fiado CG T08", createdBy: `user:${n.duenia.id}` }, select: { id: true } });
    await duenio.collection.create({ data: { tenantId: n.id, originType: "RECEIVABLE", originId: ar.id, amount: 30_000, method: "EFECTIVO", collectedBy: `user:${n.duenia.id}` } });
    await duenio.accountPayable.create({ data: { tenantId: n.id, supplierId: sup.id, amount: 50_000, createdBy: `user:${n.duenia.id}` } });
    // Cambio de hoy: USD 1.200 (M6: historial por día).
    ok(await como(n, n.duenia.id, () => empresa.guardarTipoCambio(form({ moneda: "USD", fecha: HOY, porUnidad: "1200" }))));
    // P1 en pesos: venta con IVA 500.000.
    const p1 = await proyecto(n, { precio: 500_000 / 1.21 });
    const c200 = await cuota(n, { proyectoId: p1, monto: 200_000 });
    const c300 = await cuota(n, { proyectoId: p1, monto: 300_000 });
    ok(await como(n, n.duenia.id, () => ficha.marcarCuota(form({ envio: crypto.randomUUID(), id: c200, medio: "TRANSFERENCIA" }))));
    ok(await como(n, n.duenia.id, () => acciones.registrarCobro(form({ proyectoId: p1, medio: "TRANSFERENCIA", monto: "50000" }))));
    // Lo que no suma: prevista, anulada y un cobro de un perdido.
    const prev = await cuota(n, { proyectoId: p1, monto: 40_000, prevista: true });
    const anul = await cuota(n, { proyectoId: p1, monto: 25_000, anulada: true });
    const perdido = await proyecto(n, { precio: 60_000 / 1.21, perdido: true });
    const c60 = await cuota(n, { proyectoId: perdido, monto: 60_000 });
    // P2 en dólares: US$ 1.000 con IVA al cambio de venta 1.200 (los ítems se calculan en pesos: 1.200.000 con IVA).
    const p2 = await proyecto(n, { precio: 1_200_000 / 1.21, moneda: "USD", tcVenta: 1200 });
    const cUsd = await cuota(n, { proyectoId: p2, monto: 1_000, moneda: "USD" });
    // A pagar: cuota a proveedor 80.000 con un pago parcial de 30.000 (gasto pagado enlazado por «Asiento»).
    const c80 = await cuota(n, { proyectoId: p1, monto: 80_000, tipo: "PAGO", supplierId: sup.id });
    const parcial = await duenio.proyectoGasto.create({ data: { tenantId: n.id, proyectoId: p1, supplierId: sup.id, descripcion: "Pago parcial CG T08", neto: 30_000, iva: 0, pagadoEl: new Date(AHORA - DIA), medio: "TRANSFERENCIA" }, select: { id: true } });
    await duenio.proyectoCambio.create({ data: { tenantId: n.id, entidad: "ProyectoCuota", campo: "Asiento", entidadId: c80, despues: parcial.id, autor: "CG T08" } });
    await duenio.proyectoGasto.create({ data: { tenantId: n.id, proyectoId: p1, supplierId: sup.id, descripcion: "Gasto sin pagar CG T08", neto: 10_000, iva: 2_100 } });
    const c15 = await cuota(n, { proyectoId: null, monto: 15_000, tipo: "PAGO" });
    return { ar: ar.id, p1, p2, cuota300: c300, cuotas: [c200, c300, prev, anul, c60, cUsd, c80, c15] };
  };
  if (!sembrado) sembrado = { a: await sembrar(a), b: await sembrar(b) };

  const generales = (n: NegocioDePrueba = a, usuarioId = n.duenia.id) => como(n, usuarioId, () => cg.cuentasGenerales(n.id));
  const suma = (xs: readonly { pesos: number }[]) => Math.round(xs.reduce((s, x) => s + x.pesos, 0) * 100) / 100;
  return { base, duenio, a, b, ids: sembrado, ficha, cg, cgCore, emp, flujo, HORIZONTE_POR_DEFECTO, prisma, cobrarFiado, form, como, ok, generales, suma };
}

test("CG1 · totales: a cobrar 1.520.000 y a pagar 127.100; la lista suma lo mismo que el total", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const g = await p.generales();
  assert.deepEqual(g.aCobrar, { propias: 70_000, proyectos: 1_450_000, total: 1_520_000 });
  assert.deepEqual(g.aPagar, { propias: 50_000, proyectos: 77_100, total: 127_100 });
  assert.equal(p.suma(g.proyectos!.aCobrar.renglones), 1_450_000);
  assert.equal(p.suma(g.proyectos!.aPagar.renglones), 77_100);
  assert.equal(g.proyectos!.sinCambio, false);
});

test("CG2 · sin doble conteo: general − propias === recuadrosDeCuotas(A).resumen; lo no sumable da 0; 0 filas nuevas de AR/AP", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const g = await p.generales();
  const r = await p.como(p.a, p.a.duenia.id, () => p.emp.recuadrosDeCuotas(p.a.id));
  assert.equal(g.aCobrar.total - g.aCobrar.propias, r.resumen.aCobrar);
  assert.equal(g.aPagar.total - g.aPagar.propias, r.resumen.aPagar);
  assert.notEqual(g.aCobrar.total, 1_570_000, "el cobro suelto se contó dos veces");
  const claves = new Set(g.proyectos!.aCobrar.renglones.map((x) => x.clave));
  const [, , prev, anul, c60] = p.ids.a.cuotas;
  for (const id of [prev, anul, c60]) assert.equal(claves.has(`cuota-${id}`), false, `la cuota ${id} no suma`);
  // La parte de proyectos no escribe cuentas corrientes: sigue habiendo 1 a cobrar y 1 a pagar por negocio (las propias).
  assert.equal(await p.duenio.accountReceivable.count({ where: { tenantId: p.a.id } }), 1);
  assert.equal(await p.duenio.accountPayable.count({ where: { tenantId: p.a.id } }), 1);
});

test("CG4 · aislamiento: A con B cargado da lo mismo que CG1 y 0 renglones de B; B ve lo suyo", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const g = await p.generales();
  assert.equal(g.aCobrar.total, 1_520_000);
  assert.equal(g.aPagar.total, 127_100);
  const deB = [...p.ids.b.cuotas, p.ids.b.p1, p.ids.b.p2];
  const todas = [...g.proyectos!.aCobrar.renglones, ...g.proyectos!.aPagar.renglones].map((x) => x.clave);
  for (const id of deB) assert.equal(todas.some((c) => c.endsWith(id)), false, `A ve ${id} de B`);
  const gb = await p.generales(p.b);
  assert.equal(gb.aCobrar.total, 1_520_000);
  const deA = new Set([...p.ids.a.cuotas].map((id) => `cuota-${id}`));
  for (const x of gb.proyectos!.aCobrar.renglones) assert.equal(deA.has(x.clave), false);
});

test("CG5 · sin «Empresa · ver»: 0 renglones de proyectos y total 70.000", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const g = await p.generales(p.a, p.a.recepcion.id);
  assert.equal(g.proyectos, null);
  assert.equal(g.aCobrar.total, 70_000);
  assert.equal(g.aPagar.total, 50_000);
});

test("CG6 · un negocio sin la app de Proyectos no lee ninguna cuota y su lectura no cambia", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const antes = await p.duenio.tenant.findUniqueOrThrow({ where: { id: p.b.id }, select: { modules: true } });
  await p.duenio.tenant.update({ where: { id: p.b.id }, data: { modules: antes.modules.filter((m) => m !== "proyectos") } });
  t.after(() => p.duenio.tenant.update({ where: { id: p.b.id }, data: { modules: antes.modules } }));
  let leyo = 0;
  const deps = {
    ...p.cg.dependenciasCuentas,
    veEmpresa: async () => (leyo++, true),
    recuadros: async (): Promise<never> => {
      leyo++;
      throw new Error("leyó cuotas de proyectos");
    },
  };
  const g = await p.como(p.b, p.b.duenia.id, () => p.cg.cuentasGenerales(p.b.id, deps));
  assert.equal(g.proyectos, null);
  assert.equal(leyo, 0);
  assert.deepEqual(g.aCobrar, { propias: 70_000, proyectos: 0, total: 70_000 });
  // El flujo de un negocio sin Proyectos es idéntico con y sin el agregado (CH no cambia).
  const sin = await p.como(p.b, p.b.duenia.id, () => p.flujo.leerFlujo(p.prisma, p.b.id, HOY, p.HORIZONTE_POR_DEFECTO));
  const con = await p.como(p.b, p.b.duenia.id, () => p.flujo.leerFlujo(p.prisma, p.b.id, HOY, p.HORIZONTE_POR_DEFECTO, p.cgCore.paraElFlujo(g.proyectos)));
  assert.deepEqual(con, sin);
});

test("CG8 · flujo: las cuotas de proyectos entran en su fecha por lo que les falta; «sin calendario» no", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const proy = await p.como(p.a, p.a.duenia.id, () => p.cg.proyectosParaCuentas(p.a.id));
  const extra = p.cgCore.paraElFlujo(proy);
  const { flujo: f } = await p.como(p.a, p.a.duenia.id, () => p.flujo.leerFlujo(p.prisma, p.a.id, HOY, p.HORIZONTE_POR_DEFECTO, extra));
  const movs = f.semanas.flatMap((s) => s.movimientos);
  const de = (id: string) => movs.filter((m) => m.cuentaId === `cuota-${id}`);
  const [, c300, , , , cUsd, c80, c15] = p.ids.a.cuotas;
  assert.deepEqual(de(c300).map((m) => [m.dia, m.tipo, m.monto]), [["2026-11-24", "cobro", 250_000]]);
  assert.deepEqual(de(cUsd).map((m) => [m.tipo, m.monto]), [["cobro", 1_200_000]]);
  assert.deepEqual(de(c80).map((m) => [m.tipo, m.monto]), [["pago", 50_000]]);
  assert.deepEqual(de(c15).map((m) => [m.tipo, m.monto]), [["pago", 15_000]]);
  assert.equal(movs.some((m) => String(m.cuentaId).startsWith("sincal-")), false);
});

test("CG7 · sólo lectura: la acción general rechaza el id de una cuota de proyecto; sin cambio, se avisa", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const antes = await p.duenio.collection.count({ where: { tenantId: p.a.id } });
  const r = await p.cobrarFiado(p.a, p.ids.a.cuota300, 1000);
  assert.match(r, /^error: /, r);
  assert.equal(await p.duenio.collection.count({ where: { tenantId: p.a.id } }), antes);
  // Sin cambio cargado para una moneda (en B, una cuota en EUR): el aviso, no un 0 callado.
  await p.duenio.proyectoCuota.create({ data: { tenantId: p.b.id, proyectoId: p.ids.b.p2, tipo: "COBRO", concepto: "Cuota EUR CG T08", monto: 100, moneda: "EUR", venceEl: new Date(AHORA + 5 * DIA), auto: false } });
  const gb = await p.generales(p.b);
  assert.equal(gb.proyectos!.sinCambio, true);
});

test("CG3 · se mueve con la operación: marcar la cuota de 300.000 baja 250.000; cobrar la propia no mueve proyectos", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const g0 = await p.generales();
  p.ok(await p.como(p.a, p.a.duenia.id, () => p.ficha.marcarCuota(p.form({ envio: crypto.randomUUID(), id: p.ids.a.cuota300, medio: "TRANSFERENCIA" }))));
  const g1 = await p.generales();
  assert.equal(g0.aCobrar.total - g1.aCobrar.total, 250_000);
  assert.equal(g1.aCobrar.propias, g0.aCobrar.propias);
  assert.equal(await p.cobrarFiado(p.a, p.ids.a.ar, 70_000), "ok");
  const g2 = await p.generales();
  assert.equal(g2.aCobrar.propias, 0);
  assert.equal(g2.aCobrar.proyectos, g1.aCobrar.proyectos);
});
