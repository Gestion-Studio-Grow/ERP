// ============================================================================
// MIA-50 · tanda T01 (plata urgente), contra Postgres real: base efímera migrada, rol app_rls sin BYPASSRLS y las
// Server Actions reales con sesión. Cada caso es el del plan (PLAN-MIA-50-OPERACIONES § 2.2 y § 2.8) y su esperado
// se escribió a mano ANTES de correrlo (R7), desde el proyecto de prueba: un ítem de $ 1.000 + IVA 21 % = $ 1.210.
//
//  C-A06  el libro no borra lo que nació en Proyectos (cobro y su anulación); un asiento manual sí.
//  C-P06  un borrador encima de la versión aprobada no mueve cuotas ni cabecera; cobrar todo suma lo aprobado.
//  C-O41  `registrarCobro` con clave de envío: doble envío, 10 a la vez y reintento, en 3 rondas → 1 cobro, 1 asiento.
//  C-O42  `pagarGasto`: Producción de otro proyecto, sólo «proveedores», sin ver la plata → 0 cambios; Administración ×1.
//  C-O40  día de caja cerrado (y mes congelado): cada acción que asienta rechaza con 0 filas nuevas (rendiciones
//         incluidas); abierto, entran. Carrera: un cobro que arranca antes del cierre y confirma después se rechaza.
//  A-05   anular un pago de la empresa: la cuota vuelve a pendiente y la caja al saldo de antes; ×1.
//  2 negocios  cada acción de T01 con ids del otro negocio: rechazo y 0 cambios en su plata; tampoco la ve.
//  O37    corregido tras el primer rojo: no es sólo «verifica». En main 170e56f daba rojo (PR #185, «Rojos antes y
//         verdes después») y pasa con los arreglos de esta tanda.
//
// Reloj fijado: `Date` vale AHORA en todo el archivo (el día de caja y los vencimientos no dependen de cuándo corre).
// ============================================================================

import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";
import pg from "pg";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio, type NegocioDePrueba } from "@/test/base-efimera";

const laBase = baseEfimeraDelArchivo();
const DIA = 86_400_000;
/** 17/11/2026 a las 15:00 en Buenos Aires: el día de caja es «2026-11-17». */
const AHORA = Date.parse("2026-11-17T18:00:00Z");
const HOY = "2026-11-17";

async function preparar(t: import("node:test").TestContext) {
  const base = await laBase(t);
  if (!base) return null;
  mock.timers.enable({ apis: ["Date"], now: AHORA });
  t.after(() => mock.timers.reset());
  apuntarLaAppA(base);
  Object.assign(process.env as Record<string, string | undefined>, { NODE_ENV: "development", DB_CONNECTION_LIMIT: "12", DB_CONNECT_TIMEOUT_MS: "5000" });
  prepararAccionesDeServidor();
  const duenio = await prismaComoDuenio(base);
  const { a } = base;
  const { b } = base;
  for (const n of [a, b]) {
    const t0 = await duenio.tenant.findUniqueOrThrow({ where: { id: n.id }, select: { modules: true } });
    await duenio.tenant.update({ where: { id: n.id }, data: { modules: [...new Set([...t0.modules, "proyectos"])] } });
  }

  const acciones = await import("./acciones");
  const rendiciones = await import("./acciones-rendiciones");
  const ficha = await import("./acciones-ficha");
  const empresa = await import("./acciones-empresa");
  const libro = await import("@/lib/libro-caja-actions");
  const gestion = await import("./gestion.server");
  const fichaServer = await import("./ficha.server");

  let numero = (await duenio.proyecto.count()) + 700;
  /** Proyecto confirmado con fecha, v1 APROBADA: 1 ítem de `precio` ($ 1.000 por defecto) con IVA 21 % → venta con IVA $ 1.210. */
  const proyecto = async (precio = 1000, n: NegocioDePrueba = a) => {
    const evento = new Date(AHORA + 30 * DIA);
    const p = await duenio.proyecto.create({
      data: { tenantId: n.id, numero: ++numero, clientId: n.clientes[0], nombre: `Stand T01 ${numero}`, servicio: "ARQUITECTURA", etapa: "APROBADO", fechaArmado: new Date(evento.getTime() - 2 * DIA), fechaEvento: evento, fechaDesarme: new Date(evento.getTime() + DIA) },
      select: { id: true },
    });
    const pres = await duenio.proyectoPresupuesto.create({ data: { tenantId: n.id, proyectoId: p.id, version: 1, estado: "APROBADO", token: `t01-${p.id}`, ivaPct: 21 }, select: { id: true } });
    await duenio.proyectoItem.create({ data: { tenantId: n.id, presupuestoId: pres.id, rubro: "General", descripcion: "Stand", cantidad: 1, precio } });
    return p.id;
  };
  const form = (campos: Record<string, string>) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(campos)) fd.set(k, v);
    return fd;
  };
  const como = async <R>(usuarioId: string, fn: () => Promise<R>, negocio: NegocioDePrueba = a): Promise<R> => {
    const r = await ejecutarAccion({ negocio, usuario: { id: usuarioId } }, fn);
    assert.equal(r.tipo, "respuesta", JSON.stringify(r));
    return (r as { valor: R }).valor;
  };
  const enSesion = <R>(fn: () => Promise<R>) => como(a.duenia.id, fn);
  /** Saldo del libro del negocio: lo que entró menos lo que salió, y cuántas filas tiene. */
  const caja = async (n: NegocioDePrueba = a) => {
    const filas = await duenio.cashMovement.findMany({ where: { tenantId: n.id }, select: { type: true, amount: true } });
    const saldo = filas.reduce((s, m) => s + (m.type === "EGRESO" ? -m.amount : m.amount), 0);
    return { filas: filas.length, saldo: Math.round(saldo * 100) / 100 };
  };
  const cerrarDia = (dia = HOY) => duenio.auditLog.create({ data: { tenantId: a.id, actor: "test", action: "caja.cierre-diario", entity: "CierreDiario", entityId: dia } });
  const reabrirTodo = () => duenio.auditLog.deleteMany({ where: { tenantId: { in: [a.id, b.id] }, entity: { in: ["CierreDiario", "CierreMes"] } } });
  const congelarMes = (mes = HOY.slice(0, 7)) => duenio.auditLog.create({ data: { tenantId: a.id, actor: "test", action: "cierre-mes.congelar", entity: "CierreMes", entityId: mes, changes: { por: "test" } } });
  // La base es del archivo entero: cada caso arranca con la caja abierta, aunque el anterior la haya dejado cerrada.
  await reabrirTodo();
  return { base, duenio, a, b, acciones, rendiciones, ficha, empresa, libro, gestion, fichaServer, proyecto, form, como, enSesion, caja, cerrarDia, reabrirTodo, congelarMes };
}

type P = NonNullable<Awaited<ReturnType<typeof preparar>>>;

const cuotasDe = (p: P, proyectoId: string) =>
  p.duenio.proyectoCuota.findMany({ where: { proyectoId, anuladoEl: null }, orderBy: { venceEl: "asc" }, select: { id: true, tipo: true, monto: true, moneda: true, prevista: true, pagadoEl: true, clave: true } });

test("C-A06 · el libro no borra el cobro de un proyecto ni su anulación; un asiento manual sí", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const id = await p.proyecto();
  const antes = await p.caja();
  assert.deepEqual(await p.enSesion(() => p.acciones.registrarCobro(p.form({ proyectoId: id, medio: "EFECTIVO", monto: "500" }))), { ok: true });
  const pago = await p.duenio.proyectoPago.findFirstOrThrow({ where: { proyectoId: id }, select: { id: true } });
  const anulo = await p.enSesion(() => p.ficha.anularCobroFicha(p.form({ id: pago.id })));
  assert.equal(anulo.ok, true, JSON.stringify(anulo));
  const asientos = await p.duenio.cashMovement.findMany({ where: { proyectoPagoId: pago.id }, select: { id: true, type: true } });
  assert.deepEqual(asientos.map((m) => m.type).sort(), ["EGRESO", "VENTA"], "el cobro y su contraasiento");
  const despuesDeAnular = await p.caja();
  assert.equal(despuesDeAnular.saldo, antes.saldo, "cobrar 500 y anular deja la caja como estaba (a mano: +500 − 500)");
  const respuestas = [];
  for (const m of asientos) respuestas.push(await p.enSesion(() => p.libro.deleteLibroEntry(null, p.form({ id: m.id }))));
  assert.equal(await p.duenio.cashMovement.count({ where: { id: { in: asientos.map((m) => m.id) } } }), 2, "0 filas borradas");
  assert.deepEqual(await p.caja(), despuesDeAnular, "la caja sigue igual que antes del cobro");
  for (const r of respuestas) {
    assert.equal(r?.ok, false);
    assert.match(String((r as { error: string }).error), /proyecto/i, "dice dónde se corrige");
  }
  // Un asiento escrito a mano se sigue pudiendo borrar.
  const manual = await p.duenio.cashMovement.create({ data: { tenantId: p.a.id, type: "INGRESO", method: "EFECTIVO", amount: 77, reason: "Manual T01", createdBy: `user:${p.a.duenia.id}` }, select: { id: true } });
  const borra = await p.enSesion(() => p.libro.deleteLibroEntry(null, p.form({ id: manual.id })));
  assert.equal(borra?.ok, true, JSON.stringify(borra));
  assert.equal(await p.duenio.cashMovement.count({ where: { id: manual.id } }), 0);
});

test("C-P06 · un borrador encima de la aprobada no mueve cuotas ni cabecera; cobrar todo suma la venta aprobada con IVA", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const id = await p.proyecto();
  await p.enSesion(() => p.gestion.regenerarCuotas(p.a.id, id));
  const foto = await cuotasDe(p, id);
  const cobros = foto.filter((c) => c.tipo === "COBRO");
  assert.ok(cobros.length > 0 && cobros.every((c) => !c.prevista), "cuotas de cobro reales");
  assert.equal(Math.round(cobros.reduce((s, c) => s + c.monto, 0) * 100) / 100, 1210, "a mano: 1.000 × 1,21 = 1.210");
  // v2 en borrador con el ítem a $ 1.300 (venta 1.573): editarla dispara la regeneración del plan.
  const v2 = await p.duenio.proyectoPresupuesto.create({ data: { tenantId: p.a.id, proyectoId: id, version: 2, estado: "BORRADOR", token: `t01b-${id}`, ivaPct: 21 }, select: { id: true } });
  await p.duenio.proyectoItem.create({ data: { tenantId: p.a.id, presupuestoId: v2.id, rubro: "General", descripcion: "Stand", cantidad: 1, precio: 1300 } });
  await p.enSesion(() => p.gestion.regenerarCuotas(p.a.id, id));
  assert.deepEqual(await cuotasDe(p, id), foto, "la foto de después es igual, fila por fila");
  const cab = await p.enSesion(async () => p.fichaServer.cabeceraFicha(await p.gestion.actorActual(), id));
  assert.ok(cab);
  assert.equal(cab.totales.venta, 1000, "la cabecera cuenta la aprobada");
  assert.equal(cab.totalesViva.venta, 1300, "la pestaña Ficha muestra el borrador");
  assert.equal(cab.borradorSobreAprobada, true);
  // Cobrar todas las cuotas: la suma de cobros es la venta con IVA de la aprobada y ninguna se cobra por menos.
  for (const c of cobros) {
    const r: { ok: boolean } = await p.enSesion(() => p.ficha.marcarCuota(p.form({ id: c.id, medio: "TRANSFERENCIA" })));
    assert.equal(r.ok, true, JSON.stringify(r));
  }
  const pagos = await p.duenio.proyectoPago.findMany({ where: { proyectoId: id, anuladoEl: null }, select: { id: true, monto: true } });
  assert.equal(Math.round(pagos.reduce((s, x) => s + x.monto, 0) * 100) / 100, 1210);
  for (const c of cobros) {
    const enlace: { despues: string | null } = await p.duenio.proyectoCambio.findFirstOrThrow({ where: { entidad: "ProyectoCuota", entidadId: c.id, campo: "Asiento" }, select: { despues: true } });
    assert.equal(pagos.find((x: { id: string }) => x.id === enlace.despues)?.monto, c.monto, "cada cuota cobrada tiene un cobro por su importe");
  }
});

test("C-P06 · «Marcar cobrado» por menos que la cuota lo dice, con la diferencia", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const id = await p.proyecto();
  await p.enSesion(() => p.gestion.regenerarCuotas(p.a.id, id));
  const [primera] = (await cuotasDe(p, id)).filter((c) => c.tipo === "COBRO");
  assert.deepEqual(await p.enSesion(() => p.acciones.registrarCobro(p.form({ proyectoId: id, medio: "EFECTIVO", monto: "10" }))), { ok: true });
  const r = await p.enSesion(() => p.ficha.marcarCuota(p.form({ id: primera.id, medio: "TRANSFERENCIA" })));
  assert.equal(r.ok, true, JSON.stringify(r));
  const listo = String((r as { listo?: string }).listo).replace(/ /g, " ");
  assert.match(listo, /\$ 10 restantes/, `a mano: la cuota de ${primera.monto} cobra ${primera.monto - 10} y dice que faltan 10: «${listo}»`);
});

test("C-O41 · `registrarCobro` con clave de envío: doble envío, 10 a la vez y reintento dejan 1 cobro y 1 asiento (3 rondas)", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  for (let ronda = 1; ronda <= 3; ronda++) {
    const id = await p.proyecto();
    const envio = `envio-t01-${ronda}`;
    const cobro = () => p.enSesion(() => p.acciones.registrarCobro(p.form({ proyectoId: id, medio: "TRANSFERENCIA", monto: "100", envio })));
    await cobro();
    await cobro(); // doble clic
    const diez = await Promise.all(Array.from({ length: 10 }, cobro)); // 10 a la vez
    assert.ok(diez.every((r) => r.ok), JSON.stringify(diez));
    await cobro(); // reintento
    const pagos: { id: string }[] = await p.duenio.proyectoPago.findMany({ where: { proyectoId: id }, select: { id: true } });
    assert.equal(pagos.length, 1, `ronda ${ronda}: 1 cobro`);
    assert.equal(await p.duenio.cashMovement.count({ where: { proyectoPagoId: { in: pagos.map((x) => x.id) } } }), 1, `ronda ${ronda}: 1 asiento`);
    // Otro formulario (otra clave) sí es otro cobro.
    await p.enSesion(() => p.acciones.registrarCobro(p.form({ proyectoId: id, medio: "TRANSFERENCIA", monto: "100", envio: `${envio}-otro` })));
    assert.equal(await p.duenio.proyectoPago.count({ where: { proyectoId: id } }), 2);
  }
});

test("C-O42 · `pagarGasto` exige ver el proyecto, el permiso de pagos y ver la plata; Administración paga ×1", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const { duenio, a } = p;
  const id = await p.proyecto();
  const otro = await p.proyecto();
  const gasto = await duenio.proyectoGasto.create({ data: { tenantId: a.id, proyectoId: id, rubro: "General", descripcion: "Alfombra", neto: 300, iva: 0, cargadoPor: "test" }, select: { id: true } });
  const persona = await duenio.proyectoPersona.create({ data: { tenantId: a.id, userId: a.recepcion.id, nombre: "Recepción T01", rol: "PRODUCCION" }, select: { id: true } });
  await duenio.proyectoEquipo.create({ data: { tenantId: a.id, proyectoId: otro, personaId: persona.id } });
  const pagar = () => p.como(a.recepcion.id, () => p.acciones.pagarGasto(p.form({ id: gasto.id, medio: "TRANSFERENCIA" })));
  const sinCambios = async (caso: string) => {
    const g = await duenio.proyectoGasto.findUniqueOrThrow({ where: { id: gasto.id }, select: { pagadoEl: true } });
    assert.equal(g.pagadoEl, null, `${caso}: el gasto sigue sin pagar`);
    assert.equal(await duenio.cashMovement.count({ where: { proyectoGastoId: gasto.id } }), 0, `${caso}: ningún egreso`);
  };
  // 1) Producción de OTRO proyecto (tiene pagos y ve la plata, pero no ve éste).
  let r = await pagar();
  assert.equal(r?.ok, false, JSON.stringify(r));
  assert.match(String((r as { error: string }).error), /proyecto que no ves/);
  await sinCambios("Producción de otro proyecto");
  // 2) En el equipo, pero su rol tiene sólo «proveedores» (pagos apagado).
  await duenio.proyectoEquipo.create({ data: { tenantId: a.id, proyectoId: id, personaId: persona.id } });
  await duenio.proyectoPermiso.create({ data: { tenantId: a.id, rol: "PRODUCCION", modulo: "pagos", ver: false, editar: false } });
  r = await pagar();
  assert.equal(r?.ok, false, JSON.stringify(r));
  assert.match(String((r as { error: string }).error), /permiso de editar Pagos/);
  await sinCambios("sólo proveedores");
  // 3) Con pagos, pero el usuario no ve la plata.
  await duenio.proyectoPermiso.deleteMany({ where: { tenantId: a.id, rol: "PRODUCCION", modulo: "pagos" } });
  await duenio.userPermissionOverride.create({ data: { tenantId: a.id, userId: a.recepcion.id, capability: "agenda:manage", allowed: false } });
  r = await pagar();
  assert.equal(r?.ok, false, JSON.stringify(r));
  assert.match(String((r as { error: string }).error), /no ve la plata/);
  await sinCambios("sin ver la plata");
  // 4) Administración: 1 egreso, y el segundo envío no paga dos veces.
  await duenio.userPermissionOverride.deleteMany({ where: { tenantId: a.id, userId: a.recepcion.id } });
  await duenio.proyectoPersona.update({ where: { id: persona.id }, data: { rol: "ADMINISTRACION" } });
  assert.deepEqual(await pagar(), { ok: true });
  const segundo = await pagar();
  assert.equal(segundo?.ok, false);
  const egresos = await duenio.cashMovement.findMany({ where: { proyectoGastoId: gasto.id }, select: { type: true, amount: true } });
  assert.deepEqual(egresos, [{ type: "EGRESO", amount: 300 }], "1 egreso por $ 300");
});

test("C-O40 · con el día de caja cerrado ninguna acción de Proyectos asienta; con el mes congelado tampoco; abierto, entran", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const { duenio, a } = p;
  const id = await p.proyecto();
  await p.enSesion(() => p.gestion.regenerarCuotas(p.a.id, id));
  const [cuotaCobro] = (await cuotasDe(p, id)).filter((c) => c.tipo === "COBRO");
  const cuotaPago = await duenio.proyectoCuota.create({ data: { tenantId: a.id, proyectoId: id, tipo: "PAGO", concepto: "Proveedor T01", monto: 200, moneda: "ARS", venceEl: new Date(AHORA + 5 * DIA), auto: false }, select: { id: true } });
  const cuotaEmpresa = await duenio.proyectoCuota.create({ data: { tenantId: a.id, proyectoId: null, tipo: "PAGO", concepto: "Alquiler T01", monto: 250, moneda: "ARS", venceEl: new Date(AHORA + 5 * DIA) }, select: { id: true } });
  const gastoSinPagar = await duenio.proyectoGasto.create({ data: { tenantId: a.id, proyectoId: id, rubro: "General", descripcion: "Luces", neto: 150, iva: 0, cargadoPor: "test" }, select: { id: true } });
  const persona = await duenio.proyectoPersona.create({ data: { tenantId: a.id, nombre: "Freelance T01", rol: "PRODUCCION" }, select: { id: true } });
  const liquidacion = await duenio.proyectoLiquidacion.create({ data: { tenantId: a.id, personaId: persona.id, periodo: "2026-10", total: 400, estado: "PUBLICADA", publicadaEl: new Date(AHORA - DIA) }, select: { id: true } });
  // Rendiciones (acciones-rendiciones.ts, `asentarTx`): un anticipo de $ 100 sin rendir (cerrarlo devuelve $ 100) y una
  // rendición de su bolsillo de $ 60 aprobada (reintegrarla es un egreso de $ 60).
  const anticipo = await duenio.proyectoAnticipo.create({ data: { tenantId: a.id, personaId: persona.id, proyectoId: id, montoCentavos: 10_000 }, select: { id: true } });
  const gastoRendido = await duenio.proyectoGasto.create({ data: { tenantId: a.id, proyectoId: id, rubro: "General", descripcion: "Taxi T01", neto: 60, iva: 0, cargadoPor: "test" }, select: { id: true } });
  const rendicion = await duenio.proyectoRendicion.create({ data: { tenantId: a.id, proyectoId: id, gastoId: gastoRendido.id, personaId: persona.id, medio: "PROPIO", montoCentavos: 6_000, estado: "aprobada" }, select: { id: true } });
  // Con el día abierto: un cobro, un gasto pagado y un pago de la empresa, para tener qué anular después.
  assert.deepEqual(await p.enSesion(() => p.acciones.registrarCobro(p.form({ proyectoId: id, medio: "EFECTIVO", monto: "50" }))), { ok: true });
  const cobroVivo = await duenio.proyectoPago.findFirstOrThrow({ where: { proyectoId: id }, select: { id: true } });
  assert.deepEqual(await p.enSesion(() => p.acciones.registrarGasto(p.form({ proyectoId: id, descripcion: "Flete", neto: "80", pagado: "on", medio: "EFECTIVO" }))), { ok: true });
  const gastoPagado = await duenio.proyectoGasto.findFirstOrThrow({ where: { proyectoId: id, descripcion: "Flete" }, select: { id: true } });
  const pagadaEmpresa = await duenio.proyectoCuota.create({ data: { tenantId: a.id, proyectoId: null, tipo: "PAGO", concepto: "Luz T01", monto: 90, moneda: "ARS", venceEl: new Date(AHORA + 5 * DIA) }, select: { id: true } });
  assert.equal((await p.enSesion(() => p.empresa.marcarCuotaEmpresa(p.form({ id: pagadaEmpresa.id, medio: "EFECTIVO" })))).ok, true);

  await p.cerrarDia();
  const acciones: [string, () => Promise<{ ok: boolean; error?: string } | undefined>][] = [
    ["cobro", () => p.enSesion(() => p.acciones.registrarCobro(p.form({ proyectoId: id, medio: "EFECTIVO", monto: "20" })))],
    ["cuota de cobro", () => p.enSesion(() => p.ficha.marcarCuota(p.form({ id: cuotaCobro.id, medio: "EFECTIVO" })))],
    ["cuota de pago", () => p.enSesion(() => p.ficha.marcarCuota(p.form({ id: cuotaPago.id, medio: "EFECTIVO" })))],
    ["gasto pagado al cargarlo", () => p.enSesion(() => p.acciones.registrarGasto(p.form({ proyectoId: id, descripcion: "Otro", neto: "10", pagado: "on", medio: "EFECTIVO" })))],
    ["pago de un gasto", () => p.enSesion(() => p.acciones.pagarGasto(p.form({ id: gastoSinPagar.id, medio: "EFECTIVO" })))],
    ["anulación de un cobro", () => p.enSesion(() => p.ficha.anularCobroFicha(p.form({ id: cobroVivo.id })))],
    ["anulación de un gasto", () => p.enSesion(() => p.ficha.anularGastoFicha(p.form({ id: gastoPagado.id })))],
    ["pago de la empresa", () => p.enSesion(() => p.empresa.marcarCuotaEmpresa(p.form({ id: cuotaEmpresa.id, medio: "EFECTIVO" })))],
    ["anulación de un pago de la empresa", () => p.enSesion(() => p.empresa.anularCuotaEmpresa(p.form({ id: pagadaEmpresa.id })))],
    ["pago de liquidación", () => p.enSesion(() => p.empresa.pagarLiquidacion(p.form({ id: liquidacion.id, medio: "EFECTIVO" })))],
    ["entrega de un anticipo", () => p.enSesion(() => p.rendiciones.entregarAnticipo(p.form({ personaId: persona.id, proyectoId: id, medio: "EFECTIVO", monto: "70", clave: "t01-anticipo-dia-cerrado" })))],
    ["cierre de un anticipo", () => p.enSesion(() => p.rendiciones.cerrarAnticipo(p.form({ id: anticipo.id, medio: "EFECTIVO" })))],
    ["reintegro de una rendición", () => p.enSesion(() => p.rendiciones.reintegrarDirecto(p.form({ id: rendicion.id, medio: "EFECTIVO" })))],
  ];
  const filas = async () => ({
    caja: await p.caja(),
    pagos: await duenio.proyectoPago.count({ where: { tenantId: a.id } }),
    gastos: await duenio.proyectoGasto.count({ where: { tenantId: a.id, pagadoEl: { not: null }, anuladoEl: null } }),
    anticipos: await duenio.proyectoAnticipo.findMany({ where: { tenantId: a.id }, orderBy: { id: "asc" }, select: { id: true, estado: true, devueltoCentavos: true } }),
    rendicion: await duenio.proyectoRendicion.findUniqueOrThrow({ where: { id: rendicion.id }, select: { estado: true, reintegradoEl: true } }),
  });
  for (const cierre of ["día", "mes"] as const) {
    if (cierre === "mes") {
      await p.reabrirTodo();
      await p.congelarMes();
    }
    const antes = await filas();
    for (const [que, accion] of acciones) {
      const r = await accion();
      assert.equal(r?.ok, false, `${cierre} cerrado · ${que}: ${JSON.stringify(r)}`);
      assert.match(String(r?.error), cierre === "día" ? /17\/11\/2026 ya está cerrada.*Cierre del día/ : /noviembre de 2026 está congelado.*Cierre del mes/, `${cierre} · ${que}: el rechazo dice qué hacer`);
    }
    assert.deepEqual(await filas(), antes, `${cierre} cerrado: 0 filas nuevas`);
  }
  // Abierto: entran.
  await p.reabrirTodo();
  const antes = await p.caja();
  for (const [que, accion] of acciones) {
    const r = await accion();
    assert.equal(r?.ok, true, `abierto · ${que}: ${JSON.stringify(r)}`);
  }
  assert.ok((await p.caja()).filas > antes.filas, "con el día abierto asientan");
  const despues = await filas();
  assert.deepEqual(despues.rendicion.estado, "reintegrada", "abierto: la rendición se reintegra");
  assert.deepEqual(despues.anticipos.find((x) => x.id === anticipo.id), { id: anticipo.id, estado: "CERRADO", devueltoCentavos: 10_000 }, "abierto: el anticipo se cierra y devuelve $ 100");
  assert.equal(despues.anticipos.length, 2, "abierto: se entrega el anticipo nuevo");
  assert.equal(await duenio.cashMovement.count({ where: { tenantId: a.id, OR: [{ proyectoGastoId: gastoRendido.id }, { proyectoAnticipoId: anticipo.id }] } }), 2, "un egreso de $ 60 y un ingreso de $ 100");
});

test("C-O40 · carrera: un cobro que arranca antes de que confirme el cierre del día espera su candado y se rechaza; 0 filas", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const id = await p.proyecto();
  const antes = await p.caja();
  // El «cierre» corre por una conexión propia, como `cerrarDia` (cierre-diario-actions.ts:790): toma el MISMO candado
  // `pg_advisory_xact_lock(hashtext('cierre-dia:<negocio>'))` y escribe el cierre, sin confirmar todavía.
  const cierre = new pg.Client({ connectionString: p.base.urlDuenio });
  await cierre.connect();
  t.after(() => cierre.end().catch(() => {}));
  await cierre.query("BEGIN");
  await cierre.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`cierre-dia:${p.a.id}`]);
  await cierre.query(`INSERT INTO "AuditLog" (id, "tenantId", actor, action, entity, "entityId") VALUES ($1, $2, 'test', 'caja.cierre-diario', 'CierreDiario', $3)`, [`carrera-${Date.now()}-${Math.random()}`, p.a.id, HOY]);
  // El cobro arranca mientras el cierre está abierto.
  let termino = false;
  const cobro = p.enSesion(() => p.acciones.registrarCobro(p.form({ proyectoId: id, medio: "EFECTIVO", monto: "300" }))).finally(() => (termino = true));
  // Tiene que quedar esperando ese candado (sin él, leería «abierto» y confirmaría antes que el cierre).
  const espia = new pg.Client({ connectionString: p.base.urlDuenio });
  await espia.connect();
  t.after(() => espia.end().catch(() => {}));
  let espera = false;
  for (let i = 0; i < 200 && !espera && !termino; i++) {
    const { rows } = await espia.query(`SELECT count(*)::int AS n FROM pg_locks WHERE locktype = 'advisory' AND NOT granted AND database = (SELECT oid FROM pg_database WHERE datname = current_database())`);
    espera = rows[0].n > 0;
    if (!espera) await new Promise((r) => setTimeout(r, 25));
  }
  if (!espera) await cierre.query("ROLLBACK");
  assert.ok(espera, `el cobro no esperó el candado del cierre (terminó: ${termino}): ${JSON.stringify(termino ? await cobro : null)}`);
  await cierre.query("COMMIT");
  const r = await cobro;
  assert.equal(r.ok, false, JSON.stringify(r));
  assert.match(String((r as { error?: string }).error), /17\/11\/2026 ya está cerrada.*Cierre del día/, "el rechazo dice qué hacer");
  assert.deepEqual(await p.caja(), antes, "0 filas en el libro");
  assert.equal(await p.duenio.proyectoPago.count({ where: { proyectoId: id } }), 0, "0 cobros");
});

test("Dos negocios · cada acción de T01 con ids del otro negocio se rechaza y no mueve su plata; tampoco la ve", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const { duenio, a, b } = p;
  // La plata de B, cargada como dueño de la base: proyecto con cuotas, un cobro asentado, un gasto sin pagar y otro
  // pagado, cuotas de la empresa (una pagada), una liquidación, un anticipo y una rendición aprobada.
  const idB = await p.proyecto(1000, b);
  const cuotaCobroB = await duenio.proyectoCuota.create({ data: { tenantId: b.id, proyectoId: idB, tipo: "COBRO", concepto: "Anticipo B", monto: 605, moneda: "ARS", venceEl: new Date(AHORA + 5 * DIA), auto: false }, select: { id: true } });
  const cuotaPagoB = await duenio.proyectoCuota.create({ data: { tenantId: b.id, proyectoId: idB, tipo: "PAGO", concepto: "Proveedor B", monto: 200, moneda: "ARS", venceEl: new Date(AHORA + 5 * DIA), auto: false }, select: { id: true } });
  const empresaB = await duenio.proyectoCuota.create({ data: { tenantId: b.id, proyectoId: null, tipo: "PAGO", concepto: "Alquiler B", monto: 250, moneda: "ARS", venceEl: new Date(AHORA + 5 * DIA) }, select: { id: true } });
  const empresaPagadaB = await duenio.proyectoCuota.create({ data: { tenantId: b.id, proyectoId: null, tipo: "PAGO", concepto: "Luz B", monto: 90, moneda: "ARS", venceEl: new Date(AHORA + 5 * DIA), pagadoEl: new Date(AHORA - DIA) }, select: { id: true } });
  const pagoB = await duenio.proyectoPago.create({ data: { tenantId: b.id, proyectoId: idB, medio: "EFECTIVO", monto: 400, cobradoPor: "B" }, select: { id: true } });
  const asientoB = await duenio.cashMovement.create({ data: { tenantId: b.id, type: "VENTA", method: "EFECTIVO", amount: 400, reason: "Proyecto B", proyectoPagoId: pagoB.id, createdBy: "B" }, select: { id: true } });
  const gastoB = await duenio.proyectoGasto.create({ data: { tenantId: b.id, proyectoId: idB, rubro: "General", descripcion: "Luces B", neto: 150, iva: 0, cargadoPor: "test" }, select: { id: true } });
  const gastoPagadoB = await duenio.proyectoGasto.create({ data: { tenantId: b.id, proyectoId: idB, rubro: "General", descripcion: "Flete B", neto: 80, iva: 0, cargadoPor: "test", pagadoEl: new Date(AHORA - DIA) }, select: { id: true } });
  const personaB = await duenio.proyectoPersona.create({ data: { tenantId: b.id, nombre: "Freelance B", rol: "PRODUCCION" }, select: { id: true } });
  const liquidacionB = await duenio.proyectoLiquidacion.create({ data: { tenantId: b.id, personaId: personaB.id, periodo: "2026-10", total: 400, estado: "PUBLICADA", publicadaEl: new Date(AHORA - DIA) }, select: { id: true } });
  const anticipoB = await duenio.proyectoAnticipo.create({ data: { tenantId: b.id, personaId: personaB.id, proyectoId: idB, montoCentavos: 10_000 }, select: { id: true } });
  const gastoRendidoB = await duenio.proyectoGasto.create({ data: { tenantId: b.id, proyectoId: idB, rubro: "General", descripcion: "Taxi B", neto: 60, iva: 0, cargadoPor: "test" }, select: { id: true } });
  const rendicionB = await duenio.proyectoRendicion.create({ data: { tenantId: b.id, proyectoId: idB, gastoId: gastoRendidoB.id, personaId: personaB.id, medio: "PROPIO", montoCentavos: 6_000, estado: "aprobada" }, select: { id: true } });

  /** Todo lo de plata de un negocio, fila por fila. */
  const foto = async (tenantId: string) => ({
    caja: await duenio.cashMovement.findMany({ where: { tenantId }, orderBy: { id: "asc" }, select: { id: true, type: true, amount: true } }),
    pagos: await duenio.proyectoPago.findMany({ where: { tenantId }, orderBy: { id: "asc" }, select: { id: true, monto: true, anuladoEl: true } }),
    cuotas: await duenio.proyectoCuota.findMany({ where: { tenantId }, orderBy: { id: "asc" }, select: { id: true, pagadoEl: true, anuladoEl: true } }),
    gastos: await duenio.proyectoGasto.findMany({ where: { tenantId }, orderBy: { id: "asc" }, select: { id: true, pagadoEl: true, anuladoEl: true } }),
    liquidaciones: await duenio.proyectoLiquidacion.findMany({ where: { tenantId }, orderBy: { id: "asc" }, select: { id: true, estado: true } }),
    anticipos: await duenio.proyectoAnticipo.findMany({ where: { tenantId }, orderBy: { id: "asc" }, select: { id: true, estado: true, devueltoCentavos: true } }),
    rendiciones: await duenio.proyectoRendicion.findMany({ where: { tenantId }, orderBy: { id: "asc" }, select: { id: true, estado: true, reintegradoEl: true } }),
  });
  const fotoB = await foto(b.id);
  const fotoA = await foto(a.id);

  // La dueña de A, con todos los permisos de A, apunta a los ids de B.
  const acciones: [string, () => Promise<{ ok: boolean; error?: string } | null | undefined>][] = [
    ["cobro", () => p.enSesion(() => p.acciones.registrarCobro(p.form({ proyectoId: idB, medio: "EFECTIVO", monto: "20" })))],
    ["cuota de cobro", () => p.enSesion(() => p.ficha.marcarCuota(p.form({ id: cuotaCobroB.id, medio: "EFECTIVO" })))],
    ["cuota de pago", () => p.enSesion(() => p.ficha.marcarCuota(p.form({ id: cuotaPagoB.id, medio: "EFECTIVO" })))],
    ["gasto pagado al cargarlo", () => p.enSesion(() => p.acciones.registrarGasto(p.form({ proyectoId: idB, descripcion: "Otro", neto: "10", pagado: "on", medio: "EFECTIVO" })))],
    ["pago de un gasto", () => p.enSesion(() => p.acciones.pagarGasto(p.form({ id: gastoB.id, medio: "EFECTIVO" })))],
    ["anulación de un cobro", () => p.enSesion(() => p.ficha.anularCobroFicha(p.form({ id: pagoB.id })))],
    ["anulación de un gasto", () => p.enSesion(() => p.ficha.anularGastoFicha(p.form({ id: gastoPagadoB.id })))],
    ["pago de la empresa", () => p.enSesion(() => p.empresa.marcarCuotaEmpresa(p.form({ id: empresaB.id, medio: "EFECTIVO" })))],
    ["anulación de un pago de la empresa", () => p.enSesion(() => p.empresa.anularCuotaEmpresa(p.form({ id: empresaPagadaB.id, visto: "PAGADA" })))],
    ["pago de liquidación", () => p.enSesion(() => p.empresa.pagarLiquidacion(p.form({ id: liquidacionB.id, medio: "EFECTIVO" })))],
    ["borrar el asiento del libro", () => p.enSesion((): Promise<{ ok: boolean; error?: string } | null | undefined> => p.libro.deleteLibroEntry(null, p.form({ id: asientoB.id })))],
    ["entrega de un anticipo", () => p.enSesion(() => p.rendiciones.entregarAnticipo(p.form({ personaId: personaB.id, proyectoId: idB, medio: "EFECTIVO", monto: "70", clave: "t01-anticipo-de-otro-negocio" })))],
    ["cierre de un anticipo", () => p.enSesion(() => p.rendiciones.cerrarAnticipo(p.form({ id: anticipoB.id, medio: "EFECTIVO" })))],
    ["reintegro de una rendición", () => p.enSesion(() => p.rendiciones.reintegrarDirecto(p.form({ id: rendicionB.id, medio: "EFECTIVO" })))],
  ];
  for (const [que, accion] of acciones) {
    const r = await accion();
    assert.equal(r?.ok, false, `A sobre B · ${que}: ${JSON.stringify(r)}`);
    // El rechazo es porque para A eso no existe, no por un dato mal cargado en el formulario.
    assert.match(String(r?.error), /no existe|no está en el equipo|no ves|ya estaba anulado/, `A sobre B · ${que}: «${r?.error}»`);
  }
  assert.deepEqual(await foto(b.id), fotoB, "la plata de B, fila por fila, igual que antes");
  assert.deepEqual(await foto(a.id), fotoA, "y en A tampoco se escribió nada");

  // Tampoco la ve: la cabecera del proyecto de B desde la sesión de A no existe.
  assert.equal(await p.enSesion(async () => p.fichaServer.cabeceraFicha(await p.gestion.actorActual(), idB)), null, "A no ve el proyecto de B");

  // Y al revés: la dueña de B cobra en su proyecto (entra en SU caja) y no puede cobrar en uno de A.
  const idA = await p.proyecto();
  const cajaA = await p.caja();
  const comoB = <R>(fn: () => Promise<R>) => p.como(b.duenia.id, fn, b);
  assert.deepEqual(await comoB(() => p.acciones.registrarCobro(p.form({ proyectoId: idB, medio: "EFECTIVO", monto: "100" }))), { ok: true }, "B cobra en lo suyo");
  const otro = await comoB(() => p.acciones.registrarCobro(p.form({ proyectoId: idA, medio: "EFECTIVO", monto: "100" })));
  assert.equal(otro.ok, false, JSON.stringify(otro));
  assert.deepEqual(await p.caja(), cajaA, "la caja de A no se movió");
  assert.equal((await p.caja(b)).filas, fotoB.caja.length + 1, "el cobro de B quedó en la caja de B");
});

test("C-O40 · búsqueda en el código: ningún módulo de proyectos crea un movimiento de caja sin pasar por el candado", () => {
  const dir = join(process.cwd(), "src/lib/proyectos");
  const fuera = readdirSync(dir)
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts") && f !== "periodo-cerrado.server.ts")
    .filter((f) => /cashMovement\.(create|createMany|upsert)\b/.test(readFileSync(join(dir, f), "utf8")));
  assert.deepEqual(fuera, [], "todo asiento de Proyectos pasa por `asentarEnCajaTx`");
});

test("A-05 · anular un pago de la empresa: la cuota vuelve a pendiente, la caja al saldo de antes, ×1", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const { duenio, a } = p;
  const cuota = await duenio.proyectoCuota.create({ data: { tenantId: a.id, proyectoId: null, tipo: "PAGO", concepto: "Contador T01", monto: 250, moneda: "ARS", venceEl: new Date(AHORA + 5 * DIA) }, select: { id: true } });
  const antes = await p.caja();
  assert.equal((await p.enSesion(() => p.empresa.marcarCuotaEmpresa(p.form({ id: cuota.id, medio: "EFECTIVO" })))).ok, true);
  assert.equal((await p.caja()).saldo, antes.saldo - 250, "a mano: sale $ 250");
  const [uno, dos] = await Promise.all([1, 2].map(() => p.enSesion(() => p.empresa.anularCuotaEmpresa(p.form({ id: cuota.id, visto: "PAGADA" })))));
  assert.deepEqual([uno.ok, dos.ok].sort(), [false, true], "dos clics: anula uno solo");
  const c = await duenio.proyectoCuota.findUniqueOrThrow({ where: { id: cuota.id }, select: { pagadoEl: true, anuladoEl: true } });
  assert.deepEqual(c, { pagadoEl: null, anuladoEl: null }, "la cuota queda pendiente, a la vista; no «pagada» sin plata");
  assert.equal((await p.caja()).saldo, antes.saldo, "la caja vuelve al saldo de antes");
  // Se puede volver a pagar y volver a anular: la vuelta es por lo neto asentado.
  assert.equal((await p.enSesion(() => p.empresa.marcarCuotaEmpresa(p.form({ id: cuota.id, medio: "EFECTIVO" })))).ok, true);
  assert.equal((await p.enSesion(() => p.empresa.anularCuotaEmpresa(p.form({ id: cuota.id, visto: "PAGADA" })))).ok, true);
  assert.equal((await p.caja()).saldo, antes.saldo, "pagar, anular, pagar y anular: la caja vuelve al saldo de antes");
  // Una cuota sin pagar se anula (sale de la lista).
  assert.equal((await p.enSesion(() => p.empresa.anularCuotaEmpresa(p.form({ id: cuota.id })))).ok, true);
  assert.ok((await duenio.proyectoCuota.findUniqueOrThrow({ where: { id: cuota.id }, select: { anuladoEl: true } })).anuladoEl);
});

/** Proyecto de `p.proyecto()` más un ítem de proveedor: costo $ 600 (anticipo 50 % por defecto: $ 300 + $ 300), precio $ 800. */
async function conProveedor(p: P, proyectoId: string) {
  const sup = await p.duenio.supplier.create({ data: { tenantId: p.a.id, name: `Proveedor T01 ${proyectoId.slice(-4)}` }, select: { id: true } });
  const pres = await p.duenio.proyectoPresupuesto.findFirstOrThrow({ where: { proyectoId, version: 1 }, select: { id: true } });
  await p.duenio.proyectoItem.create({ data: { tenantId: p.a.id, presupuestoId: pres.id, rubro: "General", descripcion: "Alfombra", cantidad: 1, costo: 600, precio: 800, supplierId: sup.id } });
}

test("O32 (verifica) · el plan de cuotas: cobros = venta con IVA, pagos = costo con proveedor, claves únicas y regenerar no duplica", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const id = await p.proyecto();
  await conProveedor(p, id);
  await p.enSesion(() => p.gestion.regenerarCuotas(p.a.id, id));
  const una = await cuotasDe(p, id);
  await p.enSesion(() => p.gestion.regenerarCuotas(p.a.id, id));
  const dos = await cuotasDe(p, id);
  assert.deepEqual(dos, una, "regenerar no duplica ni cambia");
  assert.equal(new Set(dos.map((c) => c.clave)).size, dos.length, "una clave por tramo");
  const suma = (tipo: string) => Math.round(dos.filter((c) => c.tipo === tipo).reduce((s, c) => s + c.monto, 0) * 100) / 100;
  assert.equal(suma("COBRO"), 2178, "a mano: (1.000 + 800) × 1,21");
  assert.deepEqual(dos.filter((c) => c.tipo === "PAGO").map((c) => c.monto), [300, 300], "a mano: 600 al 50 %: anticipo y saldo");
  assert.equal(suma("PAGO"), 600);
});

test("O37 (corregido tras el primer rojo) · todo cobro y pago de T01 asienta ×1 y la suma del libro = cobros − pagos, a mano", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const { duenio, a } = p;
  const id = await p.proyecto();
  await conProveedor(p, id);
  await p.enSesion(() => p.gestion.regenerarCuotas(p.a.id, id));
  const cuotas = await cuotasDe(p, id);
  const anticipoCliente = cuotas.find((c) => c.clave?.endsWith(":cliente:anticipo"))!;
  const anticipoProveedor = cuotas.find((c) => c.tipo === "PAGO" && c.clave?.endsWith(":anticipo"))!;
  const empresa = await duenio.proyectoCuota.create({ data: { tenantId: a.id, proyectoId: null, tipo: "PAGO", concepto: "Alquiler O37", monto: 250, moneda: "ARS", venceEl: new Date(AHORA + 5 * DIA) }, select: { id: true } });
  const gasto = await duenio.proyectoGasto.create({ data: { tenantId: a.id, proyectoId: id, rubro: "General", descripcion: "Luces O37", neto: 150, iva: 0, cargadoPor: "test" }, select: { id: true } });
  const antes = await p.caja();
  const ok = async (r: Promise<{ ok: boolean } | undefined>, que: string) => assert.equal((await r)?.ok, true, que);
  await ok(p.enSesion(() => p.acciones.registrarCobro(p.form({ proyectoId: id, medio: "EFECTIVO", monto: "500" }))), "cobro suelto +500");
  await ok(p.enSesion(() => p.ficha.marcarCuota(p.form({ id: anticipoCliente.id, medio: "TRANSFERENCIA" }))), "anticipo del cliente");
  await ok(p.enSesion(() => p.ficha.marcarCuota(p.form({ id: anticipoProveedor.id, medio: "EFECTIVO" }))), "anticipo al proveedor −300");
  await ok(p.enSesion(() => p.acciones.registrarGasto(p.form({ proyectoId: id, descripcion: "Flete O37", neto: "80", pagado: "on", medio: "EFECTIVO" }))), "gasto pagado −80");
  await ok(p.enSesion(() => p.acciones.pagarGasto(p.form({ id: gasto.id, medio: "EFECTIVO" }))), "pago de gasto −150");
  await ok(p.enSesion(() => p.empresa.marcarCuotaEmpresa(p.form({ id: empresa.id, medio: "EFECTIVO" }))), "pago de la empresa −250");
  const suelto = await duenio.proyectoPago.findFirstOrThrow({ where: { proyectoId: id, monto: 500 }, select: { id: true } });
  await ok(p.enSesion(() => p.ficha.anularCobroFicha(p.form({ id: suelto.id }))), "anular el suelto −500");
  // ×1: cada cobro, cada gasto pagado y el pago de la empresa tienen un asiento de ida (y el anulado, uno de vuelta).
  const pagos = await duenio.proyectoPago.findMany({ where: { proyectoId: id }, select: { id: true, monto: true, anuladoEl: true } });
  for (const x of pagos) assert.equal(await duenio.cashMovement.count({ where: { proyectoPagoId: x.id } }), x.anuladoEl ? 2 : 1);
  const gastos = await duenio.proyectoGasto.findMany({ where: { proyectoId: id, pagadoEl: { not: null } }, select: { id: true, neto: true } });
  for (const g of gastos) assert.equal(await duenio.cashMovement.count({ where: { proyectoGastoId: g.id } }), 1);
  // A mano: venta con IVA (1.000 + 800) × 1,21 = 2.178; anticipo del cliente 50 % = 1.089. «Marcar cobrado» cobra 1.089 − 500
  // = 589, porque los 500 sueltos ya estaban cobrados (y lo avisa: P-06). Anulado el suelto, cobros vivos = 589.
  // Pagos = 300 + 80 + 150 + 250 = 780. Libro = 589 − 780 = −191.
  assert.equal(anticipoCliente.monto, 1089);
  assert.equal(pagos.filter((x) => !x.anuladoEl).reduce((s, x) => s + x.monto, 0), 589);
  assert.equal(Math.round(((await p.caja()).saldo - antes.saldo) * 100) / 100, -191, "libro = 589 − 780");
});

// ── § 2.2 bis (plan v2): los casos de la certificación 051 con sus importes exactos (inventados, publicados en 051) ──

test("§ 2.2 bis A-06 · cobro de $ 2.000.000, anular, borrar contraasiento y venta: rechazo en los dos, nombra Proyectos y no Turnos; libro neto 0", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const id = await p.proyecto(12_150_000);
  const antes = await p.caja();
  assert.deepEqual(await p.enSesion(() => p.acciones.registrarCobro(p.form({ proyectoId: id, medio: "TRANSFERENCIA", monto: "2000000" }))), { ok: true });
  const pago = await p.duenio.proyectoPago.findFirstOrThrow({ where: { proyectoId: id }, select: { id: true } });
  assert.equal((await p.enSesion(() => p.ficha.anularCobroFicha(p.form({ id: pago.id })))).ok, true);
  const asientos = await p.duenio.cashMovement.findMany({ where: { proyectoPagoId: pago.id }, orderBy: { type: "asc" }, select: { id: true, type: true } });
  const errores: string[] = [];
  for (const m of asientos) {
    const r: { ok: boolean; error?: string } | null | undefined = await p.enSesion((): Promise<{ ok: boolean; error?: string } | null | undefined> => p.libro.deleteLibroEntry(null, p.form({ id: m.id })));
    assert.equal(r?.ok, false, `${m.type}: rechazo`);
    errores.push(String(r?.error));
  }
  assert.equal(await p.duenio.cashMovement.count({ where: { proyectoPagoId: pago.id } }), 2, "las dos filas siguen");
  for (const e of errores) {
    assert.match(e, /proyecto/i, `nombra Proyectos: «${e}»`);
    assert.doesNotMatch(e, /turno/i, `no manda a Turnos: «${e}»`);
  }
  assert.equal((await p.caja()).saldo, antes.saldo, "a mano: +2.000.000 − 2.000.000 = 0 (antes del arreglo quedaba +2.000.000)");
  assert.equal(await p.duenio.proyectoPago.count({ where: { proyectoId: id, anuladoEl: null } }), 0, "0 cobros vivos");
});

test("§ 2.2 bis P-06 · aprobada $ 14.701.500, borrador $ 15.191.550, anticipo $ 7.350.750 cobrado: el saldo sigue en $ 7.350.750; cobrarlo deja falta 0", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  // A mano: 12.150.000 × 1,21 = 14.701.500 (anticipo 50 % = 7.350.750, saldo 7.350.750); 12.555.000 × 1,21 = 15.191.550.
  const id = await p.proyecto(12_150_000);
  await p.enSesion(() => p.gestion.regenerarCuotas(p.a.id, id));
  const cobrosDe = async () => (await cuotasDe(p, id)).filter((c) => c.tipo === "COBRO");
  const [anticipo, saldo] = await cobrosDe();
  assert.deepEqual([anticipo.monto, saldo.monto], [7_350_750, 7_350_750]);
  assert.equal((await p.enSesion(() => p.ficha.marcarCuota(p.form({ id: anticipo.id, medio: "TRANSFERENCIA" })))).ok, true);
  const v2 = await p.duenio.proyectoPresupuesto.create({ data: { tenantId: p.a.id, proyectoId: id, version: 2, estado: "BORRADOR", token: `t01c-${id}`, ivaPct: 21 }, select: { id: true } });
  await p.duenio.proyectoItem.create({ data: { tenantId: p.a.id, presupuestoId: v2.id, rubro: "General", descripcion: "Stand", cantidad: 1, precio: 12_555_000 } });
  await p.enSesion(() => p.gestion.regenerarCuotas(p.a.id, id));
  const saldoDespues = (await cobrosDe()).find((c) => c.id === saldo.id)!;
  assert.equal(saldoDespues.monto, 7_350_750, "el saldo sigue en 7.350.750 y no en 7.840.800");
  const r = await p.enSesion(() => p.ficha.marcarCuota(p.form({ id: saldo.id, medio: "TRANSFERENCIA" })));
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.doesNotMatch(String((r as { listo?: string }).listo), /restantes/, "se cobra entera: sin diferencia");
  const cobrado = (await p.duenio.proyectoPago.findMany({ where: { proyectoId: id, anuladoEl: null }, select: { monto: true } })).reduce((s, x) => s + x.monto, 0);
  assert.equal(cobrado, 14_701_500, "cobrado 14.701.500");
  const tc = await import("./cobranza.server");
  const cob = (await tc.cobranzasDelNegocio(p.a.id, {}, 0, [id], p.duenio)).get(id)!;
  assert.equal(cob.porCobrar, 0, "falta 0: no quedan 490.050 sin cuota");
});

test("§ 2.2 bis O40 · día cerrado: cobro de $ 1.000 y pago de una cuota de $ 600.000 rechazan con 0 filas; el asiento manual del libro sigue rechazado", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const id = await p.proyecto(12_150_000);
  const cuota = await p.duenio.proyectoCuota.create({ data: { tenantId: p.a.id, proyectoId: id, tipo: "PAGO", concepto: "Carpintería", monto: 600_000, moneda: "ARS", venceEl: new Date(AHORA + 5 * DIA), auto: false }, select: { id: true } });
  await p.cerrarDia();
  const antes = await p.caja();
  const cobro = await p.enSesion(() => p.acciones.registrarCobro(p.form({ proyectoId: id, medio: "EFECTIVO", monto: "1000" })));
  const pagoCuota = await p.enSesion(() => p.ficha.marcarCuota(p.form({ id: cuota.id, medio: "TRANSFERENCIA" })));
  const manual = await p.enSesion(() => p.libro.addLibroEntry({ ok: false } as never, p.form({ type: "INGRESO", method: "EFECTIVO", amount: "1000", detail: "Manual T01" })));
  for (const [que, r] of [["cobro", cobro], ["pago de cuota", pagoCuota], ["asiento manual", manual]] as const) {
    assert.equal(r?.ok, false, `${que}: ${JSON.stringify(r)}`);
    assert.match(String((r as { error?: string }).error), /cerrad/i, `${que}: dice que el día está cerrado`);
  }
  assert.deepEqual(await p.caja(), antes, "0 filas en el libro");
  assert.equal(await p.duenio.proyectoPago.count({ where: { proyectoId: id } }), 0, "0 cobros");
  assert.equal((await p.duenio.proyectoCuota.findUniqueOrThrow({ where: { id: cuota.id }, select: { pagadoEl: true } })).pagadoEl, null, "la cuota sigue para pagar");
});

test("§ 2.2 bis O41 · el mismo envío 5 veces a la vez: 1 cobro; 5 cobros distintos de $ 3.500.000 a la vez sobre $ 14.701.500: entran 4 y se rechaza 1 (3 rondas)", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  for (let ronda = 1; ronda <= 3; ronda++) {
    const id = await p.proyecto(12_150_000);
    const cobro = (envio: string) => p.enSesion(() => p.acciones.registrarCobro(p.form({ proyectoId: id, medio: "TRANSFERENCIA", monto: "3500000", envio })));
    await Promise.all(Array.from({ length: 5 }, () => cobro(`mismo-${ronda}`)));
    assert.equal(await p.duenio.proyectoPago.count({ where: { proyectoId: id } }), 1, `ronda ${ronda}: el mismo envío ×5 → 1 cobro`);
    // D-A11: con 3.500.000 ya cobrados, 5 distintos de 3.500.000 a la vez. A mano: tope 14.701.500 → caben 4 en total
    // (4 × 3.500.000 = 14.000.000); con 1 ya adentro entran 3 y se rechazan 2. Para el caso tal como lo escribe el plan
    // (sobre 14.701.500 sin cobros) va un proyecto nuevo.
    const limpio = await p.proyecto(12_150_000);
    const distinto = (n: number): Promise<{ ok: boolean }> => p.enSesion(() => p.acciones.registrarCobro(p.form({ proyectoId: limpio, medio: "TRANSFERENCIA", monto: "3500000", envio: `d-${ronda}-${n}` })));
    const rs = await Promise.all([1, 2, 3, 4, 5].map(distinto));
    assert.equal(rs.filter((r) => r.ok).length, 4, `ronda ${ronda}: entran 4 · ${JSON.stringify(rs)}`);
    assert.equal(rs.filter((r) => !r.ok).length, 1, `ronda ${ronda}: se rechaza 1`);
    const pagos: { id: string; monto: number }[] = await p.duenio.proyectoPago.findMany({ where: { proyectoId: limpio }, select: { id: true, monto: true } });
    assert.equal(pagos.reduce((s, x) => s + x.monto, 0), 14_000_000);
    assert.equal(await p.duenio.cashMovement.count({ where: { proyectoPagoId: { in: pagos.map((x) => x.id) } } }), 4, "4 asientos");
  }
});

test("§ 2.2 bis A-05 · pagar $ 250.000 de la empresa, anular: caja igual y la cuota para pagar; pagarla otra vez (doble clic): 1 egreso", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const cuota = await p.duenio.proyectoCuota.create({ data: { tenantId: p.a.id, proyectoId: null, tipo: "PAGO", concepto: "Alquiler del depósito", monto: 250_000, moneda: "ARS", venceEl: new Date(AHORA + 5 * DIA) }, select: { id: true } });
  const antes = await p.caja();
  assert.equal((await p.enSesion(() => p.empresa.marcarCuotaEmpresa(p.form({ id: cuota.id, medio: "EFECTIVO" })))).ok, true);
  assert.equal((await p.enSesion(() => p.empresa.anularCuotaEmpresa(p.form({ id: cuota.id, visto: "PAGADA" })))).ok, true);
  assert.equal((await p.caja()).saldo, antes.saldo, "caja igual que antes");
  const paraPagar = await p.duenio.proyectoCuota.findMany({ where: { tenantId: p.a.id, proyectoId: null, tipo: "PAGO", pagadoEl: null, anuladoEl: null }, select: { id: true } });
  assert.ok(paraPagar.some((c) => c.id === cuota.id), "la cuota figura para pagar");
  const egresosAntes = await p.duenio.cashMovement.count({ where: { tenantId: p.a.id, type: "EGRESO", amount: 250_000 } });
  await Promise.all([1, 2].map(() => p.enSesion(() => p.empresa.marcarCuotaEmpresa(p.form({ id: cuota.id, medio: "EFECTIVO" })))));
  assert.equal(await p.duenio.cashMovement.count({ where: { tenantId: p.a.id, type: "EGRESO", amount: 250_000 } }) - egresosAntes, 1, "1 egreso");
  assert.equal((await p.caja()).saldo, antes.saldo - 250_000);
});
