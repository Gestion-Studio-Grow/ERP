// ============================================================================
// DOBLE ENVÍO de «Registrar cobro» y «Conciliar», contra Postgres (base efímera migrada, app_rls + RLS) y con las
// Server Actions reales (sesión de la dueña). Estos tests FIJAN EL COMPORTAMIENTO DE HOY: cuando se cambie, se invierte
// la aserción marcada «HOY» y el test pasa a cubrir el arreglo.
//
// Barreras deterministas, sin esperas arbitrarias:
//  · cobro: el mismo candado consultivo que toma la acción (como `cobranza-carrera-postgres.test.ts`).
//  · conciliar: la acción no toma candado; el test traba con FOR UPDATE las filas de los movimientos, lanza los pedidos
//    de a uno y espera a VER cada uno esperando ese bloqueo (con su comprobación previa ya hecha). Después suelta.
// ============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio, type BaseEfimera } from "@/test/base-efimera";

const laBase = baseEfimeraDelArchivo();
const DIA = 86_400_000;
const PLAZO_MS = 20_000;
const AHORA = Date.parse("2026-11-10T12:00:00Z");

/** Pedidos que esperan el candado consultivo `clave` (misma cuenta que `cobranza-carrera-postgres.test.ts`). */
async function trabadosEnCandado(c: pg.Client, clave: string): Promise<number> {
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

/** Conexiones de esta base (menos la del test) esperando un bloqueo de fila. `pg_locks`, no `wait_event`: éste se ve sólo con el mismo rol. */
async function esperandoFila(c: pg.Client): Promise<number> {
  const r = await c.query<{ n: number }>(
    `SELECT count(DISTINCT pid)::int AS n FROM pg_locks
      WHERE NOT granted AND locktype IN ('transactionid', 'tuple') AND pid <> pg_backend_pid()
        AND pid IN (SELECT pid FROM pg_stat_activity WHERE datname = current_database())`,
  );
  return r.rows[0].n;
}

/** Lanza los pedidos de a uno; cada uno, recién cuando el anterior quedó esperando (`cuantos() >= i + 1`). */
async function lanzarEnFila<T>(pedidos: readonly (() => Promise<T>)[], cuantos: () => Promise<number>, que: string): Promise<Promise<T>[]> {
  const enCurso: Promise<T>[] = [];
  const terminados = new Set<number>();
  for (let i = 0; i < pedidos.length; i++) {
    const p = pedidos[i]();
    p.then(() => terminados.add(i), () => terminados.add(i));
    enCurso.push(p);
    const hasta = performance.now() + PLAZO_MS;
    while ((await cuantos()) < i + 1) {
      if (terminados.has(i)) {
        const r = await p.catch((e: unknown) => e);
        assert.fail(`el pedido ${i + 1} terminó sin esperar ${que}: ${JSON.stringify(r instanceof Error ? r.message : r)}`);
      }
      if (performance.now() > hasta) assert.fail(`el pedido ${i + 1} no llegó a ${que} en ${PLAZO_MS} ms`);
      await new Promise((r) => setImmediate(r));
    }
  }
  return enCurso;
}

async function enFilaDelCandado<T>(base: BaseEfimera, clave: string, pedidos: readonly (() => Promise<T>)[]): Promise<T[]> {
  const c = new pg.Client({ connectionString: base.urlDuenio });
  await c.connect();
  try {
    assert.equal(await trabadosEnCandado(c, clave), 0);
    await c.query("SELECT pg_advisory_lock(hashtext($1))", [clave]);
    let enCurso: Promise<T>[];
    try {
      enCurso = await lanzarEnFila(pedidos, () => trabadosEnCandado(c, clave), `el candado «${clave}»`);
    } finally {
      await c.query("SELECT pg_advisory_unlock(hashtext($1))", [clave]);
    }
    return await Promise.all(enCurso);
  } finally {
    await c.end();
  }
}

async function enFilaDeLasFilas<T>(base: BaseEfimera, movimientos: readonly string[], pedidos: readonly (() => Promise<T>)[]): Promise<T[]> {
  const c = new pg.Client({ connectionString: base.urlDuenio });
  await c.connect();
  try {
    assert.equal(await esperandoFila(c), 0);
    await c.query("BEGIN");
    let enCurso: Promise<T>[];
    try {
      await c.query(`SELECT id FROM "ProyectoMovBanco" WHERE id = ANY($1) FOR UPDATE`, [movimientos]);
      enCurso = await lanzarEnFila(pedidos, () => esperandoFila(c), "el bloqueo de fila del movimiento");
    } finally {
      await c.query("COMMIT");
    }
    return await Promise.all(enCurso);
  } finally {
    await c.end();
  }
}

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

  const acciones = await import("./acciones");
  const empresa = await import("./acciones-empresa");

  let numero = (await duenio.proyecto.count()) + 700;
  /** Proyecto confirmado de A; con `aprobado`, presupuesto aprobado por $ 1.210 (tope del cobro). */
  const proyecto = async (aprobado: boolean) => {
    const evento = new Date(AHORA + 20 * DIA);
    const p = await duenio.proyecto.create({
      data: { tenantId: a.id, numero: ++numero, clientId: a.clientes[0], nombre: `Stand ${numero}`, servicio: "ARQUITECTURA", etapa: "APROBADO", fechaArmado: new Date(evento.getTime() - 2 * DIA), fechaEvento: evento, fechaDesarme: new Date(evento.getTime() + DIA) },
      select: { id: true },
    });
    if (aprobado) {
      const pres = await duenio.proyectoPresupuesto.create({ data: { tenantId: a.id, proyectoId: p.id, version: 1, estado: "APROBADO", token: `tok-${p.id}`, ivaPct: 21 }, select: { id: true } });
      await duenio.proyectoItem.create({ data: { tenantId: a.id, presupuestoId: pres.id, rubro: "General", descripcion: "Stand", cantidad: 1, precio: 1000 } });
    }
    return p.id;
  };
  const cuota = async (proyectoId: string, monto = 1210) =>
    (await duenio.proyectoCuota.create({ data: { tenantId: a.id, proyectoId, tipo: "COBRO", concepto: "Anticipo", monto, moneda: "ARS", venceEl: new Date(AHORA + 5 * DIA), auto: false }, select: { id: true } })).id;
  const cuenta = async () => (await duenio.proyectoCuentaBanco.create({ data: { tenantId: a.id, nombre: "Banco" }, select: { id: true } })).id;
  const movimiento = async (cuentaId: string, importe: number) =>
    (await duenio.proyectoMovBanco.create({ data: { tenantId: a.id, cuentaId, fecha: new Date(AHORA), descripcion: `Transferencia ${importe}`, importe }, select: { id: true } })).id;
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
  /** El mismo formulario, tal cual: es lo que manda el navegador si se envía dos veces. */
  const cobrar = (proyectoId: string, monto: number) => () => enSesion(() => acciones.registrarCobro(form({ proyectoId, medio: "TRANSFERENCIA", monto: String(monto), nota: "anticipo" })));
  const conciliar = (id: string, cuotaId: string) => () => enSesion(() => empresa.conciliarMovimiento(form({ id, cuotaId })));
  const plata = async (proyectoId: string) => {
    const pagos = await duenio.proyectoPago.findMany({ where: { proyectoId, anuladoEl: null }, select: { id: true, monto: true } });
    const asientos = await duenio.cashMovement.count({ where: { proyectoPagoId: { in: pagos.map((x) => x.id) } } });
    return { pagos: pagos.length, suma: pagos.reduce((s, x) => s + x.monto, 0), asientos };
  };
  const atados = async (cuotaId: string) => duenio.proyectoMovBanco.count({ where: { cuotaId } });
  const claveCobranza = (proyectoId: string) => `cobranza-proyecto:${a.id}:${proyectoId}`;
  return { base, proyecto, cuota, cuenta, movimiento, cobrar, conciliar, plata, atados, claveCobranza };
}

// ── H1 · Registrar cobro ────────────────────────────────────────────────────

test("H1.a cobro enviado dos veces a la vez, proyecto sin presupuesto aprobado (sin tope): HOY entran los dos", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const id = await p.proyecto(false);
  const r = await enFilaDelCandado(p.base, p.claveCobranza(id), [p.cobrar(id, 1210), p.cobrar(id, 1210)]);
  assert.deepEqual(r, [{ ok: true }, { ok: true }], "HOY: el candado los ordena pero no reconoce el repetido");
  assert.deepEqual(await p.plata(id), { pagos: 2, suma: 2420, asientos: 2 }, "HOY: cobro y asiento de caja duplicados");
});

test("H1.b cinco envíos a la vez del mismo cobro, con tope de $ 1.210: HOY entran los cinco mientras sumen menos que el tope", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const id = await p.proyecto(true);
  const r = await enFilaDelCandado(p.base, p.claveCobranza(id), Array.from({ length: 5 }, () => p.cobrar(id, 200)));
  assert.ok(r.every((x) => x.ok), `HOY: el tope sólo frena lo que pasa el total (${JSON.stringify(r)})`);
  assert.deepEqual(await p.plata(id), { pagos: 5, suma: 1000, asientos: 5 });
  // Y con tope, el sexto (que ya lo pasa) sí se frena: el tope funciona, lo que falta es reconocer el repetido.
  const [sexto] = await enFilaDelCandado(p.base, p.claveCobranza(id), [p.cobrar(id, 400)]);
  assert.equal(sexto.ok, false);
});

test("H1.c reintento del mismo formulario después de terminar el primero: HOY se graba de nuevo", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const id = await p.proyecto(true);
  assert.deepEqual(await p.cobrar(id, 500)(), { ok: true });
  assert.deepEqual(await p.cobrar(id, 500)(), { ok: true }, "HOY: el reenvío no se reconoce");
  assert.deepEqual(await p.plata(id), { pagos: 2, suma: 1000, asientos: 2 });
});

// ── H2 · Conciliar ──────────────────────────────────────────────────────────

test("H2.a el mismo movimiento con la misma cuota, enviado dos veces a la vez: entra uno solo (el UPDATE condicionado lo frena)", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const q = await p.cuota(await p.proyecto(true));
  const m = await p.movimiento(await p.cuenta(), 1210);
  const [r1, r2] = await enFilaDeLasFilas(p.base, [m], [p.conciliar(m, q), p.conciliar(m, q)]);
  assert.deepEqual(r1, { ok: true });
  assert.equal(r2.ok, false);
  assert.equal(await p.atados(q), 1);
});

test("H2.b dos movimientos distintos a la misma cuota, a la vez: HOY quedan los dos atados a la cuota", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const q = await p.cuota(await p.proyecto(true));
  const cta = await p.cuenta();
  const [m1, m2] = [await p.movimiento(cta, 1210), await p.movimiento(cta, 1210)];
  const r = await enFilaDeLasFilas(p.base, [m1, m2], [p.conciliar(m1, q), p.conciliar(m2, q)]);
  assert.deepEqual(r, [{ ok: true }, { ok: true }], "HOY: los dos pasan la comprobación antes de que el otro grabe");
  assert.equal(await p.atados(q), 2, "HOY: la cuota queda conciliada con dos movimientos");
  // Uno detrás del otro, en cambio, la comprobación sí frena.
  const m3 = await p.movimiento(cta, 1210);
  assert.equal((await p.conciliar(m3, q)()).ok, false);
});

test("H2.c conciliar no compara el importe (decisión de diseño: cobros partidos y comisiones)", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const q = await p.cuota(await p.proyecto(true), 1210);
  const m = await p.movimiento(await p.cuenta(), 100);
  assert.deepEqual(await p.conciliar(m, q)(), { ok: true });
  assert.equal(await p.atados(q), 1);
});
