// ============================================================================
// Pago parcial a proveedor (GSG-UAT-008 · D2) cuando el plan de cuotas cambia, contra Postgres real (base efímera migrada,
// app_rls + RLS) y con las Server Actions reales. Salió de la certificación adversarial del frente:
//  - Lo pagado en parte es pagado: si el plan cambia (anticipo 0 %, baja el costo), no se le debe de más al proveedor.
//  - Anular esa parte después vuelve a pedirla (el plan se pone al día).
//  - El KPI «A pagar» de Administración baja con lo pagado en parte, igual que los renglones.
//  - Un movimiento cargado a mano con partes pagadas no se quita (antes hay que anular las partes).
// Deterministas: fechas fijas, sin azar.
// ============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio } from "@/test/base-efimera";

const laBase = baseEfimeraDelArchivo();
const DIA = 86_400_000;
const AHORA = Date.parse("2026-11-10T12:00:00Z");
type Res = { ok: boolean; error?: string; listo?: string };
const r2 = (n: number) => Math.round(n * 100) / 100;

async function preparar(t: import("node:test").TestContext) {
  const base = await laBase(t);
  if (!base) return null;
  apuntarLaAppA(base);
  Object.assign(process.env as Record<string, string | undefined>, { NODE_ENV: "development", DB_CONNECTION_LIMIT: "12", DB_CONNECT_TIMEOUT_MS: "5000" });
  prepararAccionesDeServidor();
  const duenio = await prismaComoDuenio(base);
  const { a } = base;
  const t0 = await duenio.tenant.findUniqueOrThrow({ where: { id: a.id }, select: { modules: true } });
  await duenio.tenant.update({ where: { id: a.id }, data: { modules: [...new Set([...t0.modules, "proyectos"])] } });
  const ficha = await import("./acciones-ficha");
  const empresa = await import("./empresa.server");
  const datos = await import("./datos.server");
  const gestion = await import("./gestion.server");
  const proveedor = (await duenio.supplier.create({ data: { tenantId: a.id, name: "Proveedor plan" }, select: { id: true } })).id;
  let numero = (await duenio.proyecto.count()) + 2900;
  const form = (campos: Record<string, string>) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(campos)) fd.set(k, v);
    return fd;
  };
  const enSesion = async <R>(fn: () => Promise<R>): Promise<R> => {
    const r = await ejecutarAccion({ negocio: a, usuario: { id: a.duenia.id } }, fn);
    assert.equal(r.tipo, "respuesta", JSON.stringify(r));
    return (r as { valor: R }).valor;
  };
  /** Proyecto aprobado con un ítem de costo 600 con proveedor: el plan da anticipo 300 + saldo 300. */
  const proyectoConPlan = async () => {
    const evento = new Date(AHORA + 40 * DIA);
    const p = await duenio.proyecto.create({
      data: { tenantId: a.id, numero: ++numero, clientId: a.clientes[0], nombre: `Stand ${numero}`, servicio: "ARQUITECTURA", etapa: "APROBADO", moneda: "ARS", fechaArmado: new Date(evento.getTime() - 2 * DIA), fechaEvento: evento, fechaDesarme: new Date(evento.getTime() + DIA) },
      select: { id: true },
    });
    const pres = await duenio.proyectoPresupuesto.create({ data: { tenantId: a.id, proyectoId: p.id, version: 1, estado: "APROBADO", token: `tok-${p.id}`, ivaPct: 21 }, select: { id: true } });
    const item = await duenio.proyectoItem.create({ data: { tenantId: a.id, presupuestoId: pres.id, rubro: "General", descripcion: "Stand", cantidad: 1, precio: 1000, costo: 600, supplierId: proveedor }, select: { id: true } });
    await enSesion(() => gestion.regenerarCuotas(a.id, p.id));
    return { id: p.id, item: item.id };
  };
  const cuotasPago = (proyectoId: string) => duenio.proyectoCuota.findMany({ where: { proyectoId, tipo: "PAGO" }, select: { id: true, clave: true, monto: true, moneda: true, pagadoEl: true, anuladoEl: true, prevista: true } });
  const marcar = (id: string, extra: Record<string, string> = {}) => enSesion(() => ficha.marcarCuota(form({ envio: crypto.randomUUID(), id, medio: "TRANSFERENCIA", ...extra })) as Promise<Res>);
  const pagadoVivo = async (proyectoId: string) => r2((await duenio.proyectoGasto.findMany({ where: { proyectoId, anuladoEl: null }, select: { neto: true, iva: true } })).reduce((s, g) => s + g.neto + g.iva, 0));
  /** Lo que falta por renglón (Administración) y el KPI «A pagar», del mismo proyecto y de todo el negocio. */
  const administracion = async (proyectoId: string) => {
    const r = await enSesion(() => empresa.recuadrosDeCuotas(a.id));
    const mias = r.cuotas.filter((c) => c.proyecto?.id === proyectoId && c.tipo === "PAGO" && !c.pagadoEl);
    return { falta: r2(mias.reduce((s, c) => s + (c.pendiente ?? 0), 0)), aPagar: r.resumen.aPagar };
  };
  const rentabilidad = async (proyectoId: string) => (await enSesion(() => datos.reporteProyectos())).find((f) => f.id === proyectoId)!.real;
  return { duenio, a, ficha, gestion, proveedor, form, enSesion, proyectoConPlan, cuotasPago, marcar, pagadoVivo, administracion, rentabilidad };
}

test("plan que cambia: el anticipo pasa a 0 % después de pagar una parte → no se le debe de más; anular la parte la vuelve a pedir", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const { id } = await p.proyectoConPlan();
  const anticipo = (await p.cuotasPago(id)).find((c) => c.clave?.endsWith(":anticipo"))!;
  assert.ok(anticipo && !anticipo.prevista);
  assert.equal((await p.marcar(anticipo.id, { monto: "200" })).ok, true);

  await p.duenio.proyectoProveedorFicha.create({ data: { tenantId: p.a.id, supplierId: p.proveedor, anticipoPct: 0 } });
  await p.enSesion(() => p.gestion.regenerarCuotas(p.a.id, id));
  assert.equal(await p.pagadoVivo(id), 200);
  assert.equal((await p.administracion(id)).falta, 400, "pagado 200 + falta 400 = el costo del ítem (600)");
  const real = await p.rentabilidad(id);
  assert.deepEqual({ costoReal: real.costoReal, porPagar: real.porPagar }, { costoReal: 600, porPagar: 400 });

  // Se anula la parte: vuelve a faltar todo (el plan se pone al día con lo pagado de verdad).
  const enlace = await p.duenio.proyectoCambio.findFirstOrThrow({ where: { entidad: "ProyectoCuota", campo: "Asiento", entidadId: anticipo.id }, select: { despues: true } });
  assert.equal((await p.enSesion(() => p.ficha.anularGastoFicha(p.form({ id: enlace.despues! }))) as Res).ok, true);
  assert.equal(await p.pagadoVivo(id), 0);
  assert.equal((await p.administracion(id)).falta, 600);
});

test("plan que cambia: baja el costo por debajo de lo pagado en parte → la cuota no baja de lo pagado y el resto absorbe", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const { id, item } = await p.proyectoConPlan();
  const anticipo = (await p.cuotasPago(id)).find((c) => c.clave?.endsWith(":anticipo"))!;
  assert.equal((await p.marcar(anticipo.id, { monto: "250" })).ok, true);
  await p.duenio.proyectoItem.update({ where: { id: item }, data: { costo: 300 } });
  await p.enSesion(() => p.gestion.regenerarCuotas(p.a.id, id));
  assert.equal(r2((await p.pagadoVivo(id)) + (await p.administracion(id)).falta), 300, "pagado + falta = el costo nuevo");
  const vivas = (await p.cuotasPago(id)).filter((c) => !c.anuladoEl).map((c) => [c.clave!.split(":").pop(), c.monto]);
  assert.deepEqual(Object.fromEntries(vivas), { anticipo: 250, saldo: 50 });
});

test("KPI «A pagar» de Administración baja con lo pagado en parte, igual que los renglones", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const { id } = await p.proyectoConPlan();
  const anticipo = (await p.cuotasPago(id)).find((c) => c.clave?.endsWith(":anticipo"))!;
  const antes = await p.administracion(id);
  assert.equal((await p.marcar(anticipo.id, { monto: "200" })).ok, true);
  const despues = await p.administracion(id);
  assert.equal(r2(antes.falta - despues.falta), 200);
  assert.equal(r2(antes.aPagar - despues.aPagar), 200);
});

test("un movimiento cargado a mano con partes pagadas no se quita; sin partes, sí", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const { id } = await p.proyectoConPlan();
  const nueva = () => p.duenio.proyectoCuota.create({ data: { tenantId: p.a.id, proyectoId: id, supplierId: p.proveedor, tipo: "PAGO", concepto: "Flete", monto: 500, venceEl: new Date(AHORA + 5 * DIA) }, select: { id: true } });
  const conParte = await nueva();
  assert.equal((await p.marcar(conParte.id, { monto: "100" })).ok, true);
  const quitar = (cuota: string) => p.enSesion(() => p.ficha.quitarMovimiento(p.form({ proyectoId: id, id: cuota }))) as Promise<Res>;
  const r = await quitar(conParte.id);
  assert.equal(r.ok, false);
  assert.match(String(r.error), /pagos en parte/);
  assert.equal((await p.duenio.proyectoCuota.findUniqueOrThrow({ where: { id: conParte.id }, select: { anuladoEl: true } })).anuladoEl, null);
  const sinParte = await nueva();
  assert.equal((await quitar(sinParte.id)).ok, true);
});

test("plan que cambia de moneda: lo pagado en pesos se descuenta en dólares al cambio, no como si fueran dólares", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  await p.duenio.proyectoTipoCambio.upsert({ where: { tenantId_moneda: { tenantId: p.a.id, moneda: "USD" } }, create: { tenantId: p.a.id, moneda: "USD", porUnidad: 1000 }, update: { porUnidad: 1000 } });
  const vivas = async (id: string) => Object.fromEntries((await p.cuotasPago(id)).filter((c) => !c.anuladoEl).map((c) => [c.clave!.split(":").pop(), c.monto]));

  // Anticipo 0 % y el ítem pasa a 600 USD: 200 pesos pagados = 0,2 USD → al saldo le faltan 599,8 USD.
  const uno = await p.proyectoConPlan();
  const anticipo1 = (await p.cuotasPago(uno.id)).find((c) => c.clave?.endsWith(":anticipo"))!;
  assert.equal((await p.marcar(anticipo1.id, { monto: "200" })).ok, true);
  await p.duenio.proyectoProveedorFicha.upsert({ where: { supplierId: p.proveedor }, create: { tenantId: p.a.id, supplierId: p.proveedor, anticipoPct: 0 }, update: { anticipoPct: 0 } });
  await p.enSesion(() => p.gestion.regenerarCuotas(p.a.id, uno.id));
  await p.duenio.proyectoItem.update({ where: { id: uno.item }, data: { moneda: "USD", costo: 600 } });
  await p.enSesion(() => p.gestion.regenerarCuotas(p.a.id, uno.id));
  assert.deepEqual(await vivas(uno.id), { saldo: 599.8 });
  await p.duenio.proyectoProveedorFicha.deleteMany({ where: { tenantId: p.a.id, supplierId: p.proveedor } });

  // El ítem pasa a 0,5 USD con 250 pesos ya pagados (= 0,25 USD): ninguna cuota pasa del costo nuevo.
  const dos = await p.proyectoConPlan();
  const anticipo2 = (await p.cuotasPago(dos.id)).find((c) => c.clave?.endsWith(":anticipo"))!;
  assert.equal((await p.marcar(anticipo2.id, { monto: "250" })).ok, true);
  await p.duenio.proyectoItem.update({ where: { id: dos.item }, data: { moneda: "USD", costo: 0.5 } });
  await p.enSesion(() => p.gestion.regenerarCuotas(p.a.id, dos.id));
  assert.deepEqual(await vivas(dos.id), { anticipo: 0.25, saldo: 0.25 });
});
