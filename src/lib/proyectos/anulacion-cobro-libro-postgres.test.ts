// ============================================================================
// MIA-50 T01 · A-06 (traídos de #187 / MIA-060, cerrado sin merge: GSG-MIA-060 § «Correcciones», opción A).
// El EGRESO de la anulación de un cobro de proyecto NO se borra desde el libro de caja, contra Postgres
// (base efímera migrada, app_rls + RLS) y con las Server Actions reales (sesión de la dueña). Mensajes de T01
// (`motivoDeProyecto`, libro-caja.ts). Lo que T01 no medía y #187 sí:
//
//  (1) Servidor: `deleteLibroEntry` rechaza, con el día abierto, el EGRESO de la anulación (el que escribe hoy
//      `anularCobroFicha`, firmado con el NOMBRE del usuario), una FILA VIEJA sembrada igual (sólo con la columna)
//      y la VENTA del cobro; también después de cerrar y REABRIR el día. Las filas y el saldo del libro no cambian.
//      Una fila tipeada a mano sigue borrable. El loader del libro saca esas filas sin ✕ (misma regla).
//  (2) Carrera: N = 5 «Anular» del mismo cobro a la vez (en fila detrás del candado de la cobranza, barrera en la
//      base) más un borrado del egreso en paralelo → exactamente 1 EGRESO, 0 borrados, saldo = VENTA − EGRESO; los
//      otros 4 envíos dicen «ya estaba anulado».
//  (3) Aislamiento (cert. MIA-064, corrección 3): el negocio B no ve en su libro, ni borra, el egreso de la anulación de A.
//  (4) La reversa de un gasto anulado (cert. MIA-064, corrección 3; la forma de la tabla de #187 que no se había traído):
//      el INGRESO con `proyectoGastoId` que escribe hoy `anularGastoFicha` y una fila sembrada sólo con la columna,
//      firmada con el usuario, no se borran ni llevan ✕.
//
// Sin Postgres el test FALLA (no pasa vacío): un test de plata que no corrió no prueba nada.
// ============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio, type BaseEfimera, type NegocioDePrueba } from "@/test/base-efimera";

const laBase = baseEfimeraDelArchivo();
const N = 5;
const PLAZO_MS = 20_000;
const DIA = 86_400_000;
const AHORA = Date.parse("2026-11-10T12:00:00Z");
/** El mensaje de T01 para el cobro de un proyecto y su anulación (`motivoDeProyecto`, libro-caja.ts). */
const DEL_COBRO = /lo asentó un cobro de un proyecto \(o su anulación\)\. No se borra desde el libro: corregilo desde la ficha del proyecto/;
/** El de T01 para el pago de un gasto de proyecto y su anulación (`motivoDeProyecto`, libro-caja.ts). */
const DEL_GASTO = /lo asentó el pago de un gasto de un proyecto \(o su anulación\)\. No se borra desde el libro: corregilo desde la ficha del proyecto, en Gastos/;

/** Pedidos que esperan el candado consultivo `clave` (ver cobranza-carrera-postgres.test.ts, `trabados`). */
async function trabados(c: pg.Client, clave: string): Promise<number> {
  const r = await c.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM pg_locks
      WHERE locktype = 'advisory' AND NOT granted AND objsubid = 1
        AND database = (SELECT oid FROM pg_database WHERE datname = current_database())
        AND objid = ((hashtext($1)::bigint & 4294967295)::text)::oid
        AND classid = ((hashtext($1)::bigint >> 32) & 4294967295)::text::oid`,
    [clave],
  );
  return r.rows[0].n;
}

/** Espera una CONDICIÓN (no un tiempo), con plazo. */
async function hasta(cond: () => Promise<boolean>, que: string): Promise<void> {
  const fin = performance.now() + PLAZO_MS;
  while (!(await cond())) {
    if (performance.now() > fin) assert.fail(`no se cumplió «${que}» en ${PLAZO_MS} ms`);
    await new Promise((r) => setImmediate(r));
  }
}

async function preparar(t: import("node:test").TestContext) {
  const base = await laBase(t);
  assert.ok(base, "sin Postgres este test no prueba nada: levantá ERP_TEST_PG_URL");
  apuntarLaAppA(base);
  Object.assign(process.env as Record<string, string | undefined>, { NODE_ENV: "development", DB_CONNECTION_LIMIT: "12", DB_CONNECT_TIMEOUT_MS: "5000" });
  prepararAccionesDeServidor();
  const duenio = await prismaComoDuenio(base);
  const { a, b } = base;
  for (const n of [a, b]) {
    const t0 = await duenio.tenant.findUniqueOrThrow({ where: { id: n.id }, select: { modules: true } });
    await duenio.tenant.update({ where: { id: n.id }, data: { modules: [...new Set([...t0.modules, "proyectos"])] } });
  }

  const acciones = await import("./acciones");
  const ficha = await import("./acciones-ficha");
  const libro = await import("@/lib/libro-caja-actions");
  const { cerrarDia } = await import("@/lib/cierre-diario-actions");
  const { reabrirDiaAction } = await import("@/lib/cierre-mes/acciones");
  const { dateStrInBusinessTz } = await import("@/lib/datetime");

  let numero = (await duenio.proyecto.count()) + 700;
  const proyecto = async () => {
    const evento = new Date(AHORA + 20 * DIA);
    const p = await duenio.proyecto.create({
      data: { tenantId: a.id, numero: ++numero, clientId: a.clientes[0], nombre: `Stand ${numero}`, servicio: "ARQUITECTURA", etapa: "APROBADO", fechaArmado: new Date(evento.getTime() - 2 * DIA), fechaEvento: evento, fechaDesarme: new Date(evento.getTime() + DIA) },
      select: { id: true, numero: true },
    });
    const pres = await duenio.proyectoPresupuesto.create({ data: { tenantId: a.id, proyectoId: p.id, version: 1, estado: "APROBADO", token: `tok-${p.id}`, ivaPct: 21 }, select: { id: true } });
    await duenio.proyectoItem.create({ data: { tenantId: a.id, presupuestoId: pres.id, rubro: "General", descripcion: "Stand", cantidad: 1, precio: 1000 } });
    return p;
  };
  const form = (campos: Record<string, string>) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(campos)) fd.set(k, v);
    return fd;
  };
  const como = async <R>(n: NegocioDePrueba, fn: () => Promise<R>): Promise<R> => {
    const r = await ejecutarAccion({ negocio: n, usuario: { id: n.duenia.id } }, fn);
    assert.equal(r.tipo, "respuesta", JSON.stringify(r));
    return (r as { valor: R }).valor;
  };
  /** Cobra $ 1.210 en efectivo y devuelve el id del cobro. */
  const cobrar = async (proyectoId: string) => {
    assert.deepEqual(await como(a, () => acciones.registrarCobro(form({ proyectoId, medio: "EFECTIVO", monto: "1210" }))), { ok: true });
    return (await duenio.proyectoPago.findFirstOrThrow({ where: { proyectoId }, orderBy: { createdAt: "desc" }, select: { id: true } })).id;
  };
  const anular = (pagoId: string) => como(a, () => ficha.anularCobroFicha(form({ id: pagoId })));
  const borrar = (n: NegocioDePrueba, id: string) => como(n, () => libro.deleteLibroEntry({ ok: true }, form({ id })));
  /** Todo el libro del negocio y su saldo (VENTA/INGRESO suman, EGRESO resta), visto como dueño de las tablas. */
  const foto = async (tenantId: string) => {
    const filas = await duenio.cashMovement.findMany({ where: { tenantId }, orderBy: { id: "asc" }, select: { id: true, type: true, amount: true } });
    const saldo = filas.reduce((s, f) => s + (f.type === "EGRESO" ? -f.amount : f.amount), 0);
    return { filas, saldo };
  };
  /** Las filas del cobro, EGRESO antes que VENTA (orden de texto: el enum de Postgres ordena por declaración). */
  const delCobro = async (pagoId: string) =>
    (await duenio.cashMovement.findMany({ where: { proyectoPagoId: pagoId }, select: { id: true, type: true, amount: true, createdBy: true } })).sort((x, y) => x.type.localeCompare(y.type));
  const hoy = dateStrInBusinessTz(new Date());
  return { base, duenio, a, b, proyecto, form, como, cobrar, anular, borrar, foto, delCobro, libro, cerrarDia, reabrirDiaAction, hoy, acciones, ficha };
}

type Preparado = Awaited<ReturnType<typeof preparar>>;

/** Intenta borrar `id` como la dueña: tiene que rebotar con el mensaje de T01 y el libro (filas y saldo) no cambia. */
async function intentar(p: Preparado, id: string, cuando: string, mensaje: RegExp = DEL_COBRO) {
  const antes = await p.foto(p.a.id);
  const r = await p.borrar(p.a, id);
  assert.equal(r?.ok, false, `${cuando}: el borrado tiene que rebotar (${JSON.stringify(r)})`);
  assert.match(String((r as { error?: string }).error), mensaje, cuando);
  assert.deepEqual(await p.foto(p.a.id), antes, `${cuando}: el libro (filas y saldo) no cambia`);
}

/** El loader del libro: id → ¿lleva ✕? (misma función que el servidor). */
async function enPantalla(p: Preparado): Promise<Map<string, boolean | undefined>> {
  return new Map((await p.como(p.a, () => p.libro.getLibroCajaData())).rows.map((r) => [r.id, r.borrable]));
}

/** Cobra y anula: devuelve el EGRESO de la anulación (el que escribe hoy `anularCobroFicha`) y la VENTA. */
async function cobradoYAnulado(p: Preparado) {
  const proy = await p.proyecto();
  const pagoId = await p.cobrar(proy.id);
  const anulo = await p.anular(pagoId);
  assert.equal(anulo.ok, true, JSON.stringify(anulo));
  const [egreso, venta] = await p.delCobro(pagoId);
  assert.deepEqual([egreso.type, venta.type], ["EGRESO", "VENTA"]);
  assert.ok(!egreso.createdBy.includes(":"), "el egreso de hoy va firmado con el nombre del usuario, sin marca");
  return { egreso, venta };
}

test("(1) día abierto: el EGRESO de la anulación y la VENTA del cobro de un proyecto no se borran ni llevan ✕; la manual sí", async (t) => {
  const p = await preparar(t);
  const { egreso, venta } = await cobradoYAnulado(p);
  await intentar(p, egreso.id, "egreso de la anulación, día abierto");
  await intentar(p, venta.id, "venta del cobro, día abierto");
  const x = await enPantalla(p);
  assert.deepEqual([x.get(egreso.id), x.get(venta.id)], [false, false], "sin ✕ en pantalla");

  // Una fila tipeada a mano (aunque el detalle diga «Proyecto») sigue borrable y con ✕.
  const alta = await p.como(p.a, () => p.libro.addLibroEntry({ ok: true }, p.form({ type: "EGRESO", method: "EFECTIVO", amount: "500", detail: "Anulación · Proyecto a mano", confirm: "1" })));
  assert.equal(alta?.ok, true, JSON.stringify(alta));
  const manual = await p.duenio.cashMovement.findFirstOrThrow({ where: { tenantId: p.a.id, amount: 500 }, select: { id: true } });
  assert.equal((await enPantalla(p)).get(manual.id), true, "la manual lleva ✕");
  const borrada = await p.borrar(p.a, manual.id);
  assert.equal(borrada?.ok, true, JSON.stringify(borrada));
  assert.equal(await p.duenio.cashMovement.count({ where: { id: manual.id } }), 0, "la manual se borró");
});

test("(1 bis) fila VIEJA: el EGRESO de una anulación firmado con el usuario y sólo con `proyectoPagoId` no se borra ni lleva ✕", async (t) => {
  const p = await preparar(t);
  // Sembrada como la dejó la anulación en las bases antes de T01: firmada con el usuario, sin marca, sólo con la columna.
  const proy = await p.proyecto();
  const pagoId = await p.cobrar(proy.id);
  const vieja = await p.duenio.cashMovement.create({
    data: { tenantId: p.a.id, type: "EGRESO", method: "EFECTIVO", amount: 1210, reason: `Anulación · Proyecto #${proy.numero}`, proyectoPagoId: pagoId, createdBy: "Dueña de prueba" },
    select: { id: true },
  });
  await intentar(p, vieja.id, "fila vieja, día abierto");
  assert.equal((await enPantalla(p)).get(vieja.id), false, "la fila vieja sale sin ✕");
});

test("(1 ter) cerrar y REABRIR el día: el EGRESO de la anulación sigue sin borrarse", async (t) => {
  const p = await preparar(t);
  const { egreso } = await cobradoYAnulado(p);
  // Cerrar el día (cuadra con lo que hay en efectivo: cobro y anulación se compensan) y reabrirlo.
  const efectivo = (await p.foto(p.a.id)).saldo;
  const cierre = await p.como(p.a, () => p.cerrarDia(p.form({ day: p.hoy, declarado_EFECTIVO: String(efectivo), columnas: "x" })));
  assert.equal(cierre?.ok, true, JSON.stringify(cierre));
  const reabre = await p.como(p.a, () => p.reabrirDiaAction(null, p.form({ day: p.hoy, motivo: "faltó cargar un gasto del cuaderno" })));
  assert.equal(reabre?.ok, true, JSON.stringify(reabre));
  await intentar(p, egreso.id, "egreso de la anulación, día cerrado y reabierto");
  assert.equal((await enPantalla(p)).get(egreso.id), false, "sin ✕ después de reabrir");
});

test(`(2) carrera: ${N} «Anular» del mismo cobro a la vez y un borrado del egreso en paralelo → 1 EGRESO, 0 borrados, saldo = VENTA − EGRESO`, async (t) => {
  const p = await preparar(t);
  const proy = await p.proyecto();
  const pagoId = await p.cobrar(proy.id);
  const clave = `cobranza-proyecto:${p.a.id}:${proy.id}`;
  const c = new pg.Client({ connectionString: p.base.urlDuenio });
  await c.connect();
  try {
    assert.equal(await trabados(c, clave), 0);
    // Barrera en la base: el test toma ANTES el candado que toma `anularCobroFicha` y espera a ver los N trabados.
    await c.query("SELECT pg_advisory_lock(hashtext($1))", [clave]);
    let anulaciones: Promise<Awaited<ReturnType<typeof p.anular>>>[] = [];
    let borrado: Promise<Awaited<ReturnType<typeof p.borrar>>>;
    try {
      anulaciones = Array.from({ length: N }, () => p.anular(pagoId));
      await hasta(async () => (await trabados(c, clave)) === N, `${N} anulaciones trabadas en el candado`);
      // El borrado sale en paralelo: espera a VER el egreso y lo intenta mientras las otras anulaciones siguen en vuelo.
      borrado = (async () => {
        await hasta(async () => (await p.duenio.cashMovement.count({ where: { proyectoPagoId: pagoId, type: "EGRESO" } })) > 0, "el egreso de la anulación");
        const e = await p.duenio.cashMovement.findFirstOrThrow({ where: { proyectoPagoId: pagoId, type: "EGRESO" }, select: { id: true } });
        return p.borrar(p.a, e.id);
      })();
    } finally {
      await c.query("SELECT pg_advisory_unlock(hashtext($1))", [clave]);
    }
    const [rs, rb] = await Promise.all([Promise.all(anulaciones), borrado!]);
    assert.equal(rs.length, N);
    assert.ok(rs.every((r) => r.ok), JSON.stringify(rs));
    const ya = rs.filter((r) => /ya estaba anulado/.test(String((r as { listo?: string }).listo)));
    assert.equal(ya.length, N - 1, `los otros ${N - 1} envíos dicen «ya estaba anulado»`);
    assert.equal(rb?.ok, false, `el borrado en paralelo rebota: ${JSON.stringify(rb)}`);
    const filas = await p.delCobro(pagoId);
    assert.deepEqual(filas.map((f) => f.type), ["EGRESO", "VENTA"], "exactamente 1 EGRESO y su VENTA: 0 borrados");
    const [egreso, venta] = filas;
    assert.equal(venta.amount - egreso.amount, 0, "saldo del cobro = VENTA − EGRESO = 0");
    assert.equal(await p.duenio.auditLog.count({ where: { tenantId: p.a.id, action: "libro.delete", entityId: egreso.id } }), 0, "nadie borró el egreso");
  } finally {
    await c.end();
  }
});

test("(3) aislamiento: el negocio B no ve en su libro ni borra el egreso de la anulación de A", async (t) => {
  const p = await preparar(t);
  const { egreso } = await cobradoYAnulado(p);
  const antesA = await p.foto(p.a.id);
  const antesB = await p.foto(p.b.id);
  const r = await p.borrar(p.b, egreso.id);
  assert.equal(r?.ok, false, JSON.stringify(r));
  assert.match(String((r as { error?: string }).error), /ya no existe/, "para B la fila de A no existe");
  const deB = await p.como(p.b, () => p.libro.getLibroCajaData());
  assert.equal(deB.rows.some((x) => x.id === egreso.id), false, "B no la ve en su libro");
  assert.ok((await enPantalla(p)).has(egreso.id), "A sí la ve en el suyo (el filtro es por negocio, no un libro vacío)");
  assert.deepEqual(await p.foto(p.a.id), antesA, "el libro de A no cambió");
  assert.deepEqual(await p.foto(p.b.id), antesB, "el de B tampoco");
});

test("(4) la reversa de un gasto anulado: el INGRESO con `proyectoGastoId` no se borra ni lleva ✕, tampoco una fila vieja sólo con la columna", async (t) => {
  const p = await preparar(t);
  const proy = await p.proyecto();
  assert.deepEqual(await p.como(p.a, () => p.acciones.registrarGasto(p.form({ proyectoId: proy.id, descripcion: "Alfombra", neto: "800", pagado: "on", medio: "EFECTIVO" }))), { ok: true });
  const gasto = await p.duenio.proyectoGasto.findFirstOrThrow({ where: { proyectoId: proy.id, descripcion: "Alfombra" }, select: { id: true } });
  const anulo = await p.como(p.a, () => p.ficha.anularGastoFicha(p.form({ id: gasto.id })));
  assert.equal(anulo.ok, true, JSON.stringify(anulo));
  const filas = await p.duenio.cashMovement.findMany({ where: { proyectoGastoId: gasto.id }, orderBy: { type: "asc" }, select: { id: true, type: true, amount: true } });
  // A mano: pagar el gasto de $ 800 (sin IVA) es un EGRESO de 800; anularlo, un INGRESO de 800.
  assert.deepEqual(filas.map((f) => [f.type, f.amount]).sort(), [["EGRESO", 800], ["INGRESO", 800]]);
  const reversa = filas.find((f) => f.type === "INGRESO")!;
  // La fila vieja: la reversa firmada con el usuario y sin marca, sólo con la columna. Va en otro gasto: la base no deja
  // dos reversas del mismo (índice único tenantId + proyectoGastoId + type).
  const otro = await p.duenio.proyectoGasto.create({ data: { tenantId: p.a.id, proyectoId: proy.id, rubro: "General", descripcion: "Alfombra vieja", neto: 800, iva: 0, cargadoPor: "test" }, select: { id: true } });
  const vieja = await p.duenio.cashMovement.create({ data: { tenantId: p.a.id, type: "INGRESO", method: "EFECTIVO", amount: 800, reason: `Anulación de gasto · Proyecto #${proy.numero}`, proyectoGastoId: otro.id, createdBy: "Ana Pérez" }, select: { id: true } });
  await intentar(p, reversa.id, "INGRESO de la reversa de hoy", DEL_GASTO);
  await intentar(p, vieja.id, "INGRESO de la reversa, fila vieja sin marca", DEL_GASTO);
  const x = await enPantalla(p);
  assert.deepEqual([x.get(reversa.id), x.get(vieja.id)], [false, false], "sin ✕ en pantalla");
});
