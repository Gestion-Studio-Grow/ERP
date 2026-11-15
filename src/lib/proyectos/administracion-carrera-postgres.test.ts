// ============================================================================
// CARRERAS de Administración (acciones-empresa.ts), contra Postgres (base efímera migrada, app_rls + RLS) y con las
// Server Actions reales (sesión de la dueña). Arnés copiado de `doble-envio-postgres.test.ts`.
//
// Barrera determinista, sin esperas: el test traba con FOR UPDATE las filas en juego, lanza los pedidos de a uno (cada
// uno, cuando el anterior quedó esperando un bloqueo de fila según `pg_locks`), hace «lo que pasó en el medio» con la
// fila todavía trabada (otra pestaña que cambió el monto, pagó la cuota o reconcilió el movimiento) y suelta.
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

/**
 * Conexiones de esta base (menos la del test) esperando un bloqueo de fila. `pg_locks`, no `wait_event`: éste se ve sólo
 * con el mismo rol. Se limpia la foto de estadísticas antes de mirar: adentro de la transacción del test,
 * `pg_stat_activity` queda congelada en la primera consulta y una conexión que el pool abre después no aparecería nunca.
 */
async function esperandoFila(c: pg.Client): Promise<number> {
  await c.query("SELECT pg_stat_clear_snapshot()");
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

/**
 * Traba las filas `ids` de `tabla`, lanza los pedidos en fila y, con todos esperando, corre `enElMedio` en la misma
 * transacción del test (lo que otro usuario grabó entre la lectura y la escritura). Después suelta.
 */
async function enFilaDeLasFilas<T>(base: BaseEfimera, tabla: "ProyectoMovBanco" | "ProyectoCuota", ids: readonly string[], pedidos: readonly (() => Promise<T>)[], enElMedio?: (c: pg.Client) => Promise<void>): Promise<T[]> {
  const c = new pg.Client({ connectionString: base.urlDuenio });
  await c.connect();
  try {
    assert.equal(await esperandoFila(c), 0);
    await c.query("BEGIN");
    let enCurso: Promise<T>[];
    try {
      await c.query(`SELECT id FROM "${tabla}" WHERE id = ANY($1) FOR UPDATE`, [ids]);
      enCurso = await lanzarEnFila(pedidos, () => esperandoFila(c), `el bloqueo de fila de ${tabla}`);
      if (enElMedio) await enElMedio(c);
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

  const empresa = await import("./acciones-empresa");

  let numero = (await duenio.proyecto.count()) + 800;
  /** Proyecto confirmado de A, con presupuesto aprobado por $ 1.210. */
  const proyecto = async () => {
    const evento = new Date(AHORA + 20 * DIA);
    const p = await duenio.proyecto.create({
      data: { tenantId: a.id, numero: ++numero, clientId: a.clientes[0], nombre: `Stand ${numero}`, servicio: "ARQUITECTURA", etapa: "APROBADO", fechaArmado: new Date(evento.getTime() - 2 * DIA), fechaEvento: evento, fechaDesarme: new Date(evento.getTime() + DIA) },
      select: { id: true },
    });
    const pres = await duenio.proyectoPresupuesto.create({ data: { tenantId: a.id, proyectoId: p.id, version: 1, estado: "APROBADO", token: `tok-${p.id}`, ivaPct: 21 }, select: { id: true } });
    await duenio.proyectoItem.create({ data: { tenantId: a.id, presupuestoId: pres.id, rubro: "General", descripcion: "Stand", cantidad: 1, precio: 1000 } });
    return p.id;
  };
  /** Cuota; sin `proyectoId`, es de la empresa (la de Administración). */
  const cuota = async (proyectoId: string | null, d: { tipo?: "COBRO" | "PAGO"; monto?: number } = {}) =>
    (await duenio.proyectoCuota.create({ data: { tenantId: a.id, proyectoId, tipo: d.tipo ?? "COBRO", concepto: proyectoId ? "Anticipo" : "Alquiler", monto: d.monto ?? 1210, moneda: "ARS", venceEl: new Date(AHORA + 5 * DIA), auto: false }, select: { id: true } })).id;
  const cuenta = async () => (await duenio.proyectoCuentaBanco.create({ data: { tenantId: a.id, nombre: "Banco" }, select: { id: true } })).id;
  const movimiento = async (cuentaId: string, importe: number, cuotaId: string | null = null) =>
    (await duenio.proyectoMovBanco.create({ data: { tenantId: a.id, cuentaId, fecha: new Date(AHORA), descripcion: `Transferencia ${importe}`, importe, cuotaId }, select: { id: true } })).id;
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
  const conciliar = (id: string, cuotaId: string) => () => enSesion(() => empresa.conciliarMovimiento(form({ id, cuotaId })));
  const desconciliar = (id: string) => () => enSesion(() => empresa.desconciliarMovimiento(form({ id })));
  const marcar = (id: string, cuentaId?: string) => () => enSesion(() => empresa.marcarCuotaEmpresa(form({ id, medio: "TRANSFERENCIA", ...(cuentaId && { cuenta: cuentaId }) })));
  const vencimiento = (id: string, valor: string) => () => enSesion(() => empresa.guardarDatoCuota(form({ id, campo: "venceEl", valor })));
  const atados = async (cuotaId: string) => duenio.proyectoMovBanco.count({ where: { cuotaId } });
  const cuotaDe = async (movId: string) => (await duenio.proyectoMovBanco.findUniqueOrThrow({ where: { id: movId }, select: { cuotaId: true } })).cuotaId;
  return { base, duenio, enSesion, proyecto, cuota, cuenta, movimiento, conciliar, desconciliar, marcar, vencimiento, atados, cuotaDe };
}

// ── 1 · Desconciliar ────────────────────────────────────────────────────────

test("1.a desconciliar mientras otro lo desconcilió y lo concilió a otra cuota: no suelta la conciliación nueva", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const [q1, q2] = [await p.cuota(null), await p.cuota(null)];
  const m = await p.movimiento(await p.cuenta(), 1210, q1);
  // Pantalla vieja: el pedido leyó «atado a q1». En el medio, otra pestaña lo pasó a q2.
  const [r] = await enFilaDeLasFilas(p.base, "ProyectoMovBanco", [m], [p.desconciliar(m)], async (c) => {
    await c.query(`UPDATE "ProyectoMovBanco" SET "cuotaId" = $1 WHERE id = $2`, [q2, m]);
  });
  assert.equal(r.ok, false, JSON.stringify(r));
  assert.equal(await p.cuotaDe(m), q2, "la conciliación con q2 sigue en pie");
  assert.equal(await p.atados(q2), 1);
});

test("1.b desconciliar enviado dos veces a la vez: suelta una vez y deja un solo registro", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const q = await p.cuota(null);
  const m = await p.movimiento(await p.cuenta(), 1210, q);
  const [r1, r2] = await enFilaDeLasFilas(p.base, "ProyectoMovBanco", [m], [p.desconciliar(m), p.desconciliar(m)]);
  assert.deepEqual(r1, { ok: true });
  assert.equal(r2.ok, false, JSON.stringify(r2));
  assert.equal(await p.cuotaDe(m), null);
  assert.equal(await p.duenio.proyectoCambio.count({ where: { entidad: "movimiento", entidadId: m, campo: "conciliación", antes: { not: null } } }), 1, "un solo «desconciliado» en el registro");
});

// ── 2 · Marcar y vencimiento, con lo leído afuera ───────────────────────────

test("2.a marcar una cuota de empresa a la que en el medio le cambiaron el monto: no asienta el monto viejo", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const q = await p.cuota(null, { tipo: "PAGO", monto: 1000 });
  const cta = await p.cuenta();
  const [r] = await enFilaDeLasFilas(p.base, "ProyectoCuota", [q], [p.marcar(q, cta)], async (c) => {
    await c.query(`UPDATE "ProyectoCuota" SET "monto" = 1500 WHERE id = $1`, [q]);
  });
  assert.equal(r.ok, false, JSON.stringify(r));
  assert.match((r as { error: string }).error, /cambió/);
  const fila = await p.duenio.proyectoCuota.findUniqueOrThrow({ where: { id: q }, select: { pagadoEl: true, cuentaId: true } });
  assert.deepEqual(fila, { pagadoEl: null, cuentaId: null }, "la cuota sigue pendiente");
  assert.equal(await p.duenio.cashMovement.count({ where: { createdBy: { contains: q } } }), 0, "sin asiento en el libro");
  assert.equal((await p.duenio.proyectoCuentaBanco.findUniqueOrThrow({ where: { id: cta }, select: { saldo: true } })).saldo, 0, "el banco no se movió");
  // Recargada la pantalla, se marca con el monto nuevo.
  assert.equal((await p.marcar(q, cta)()).ok, true);
  const [asiento] = await p.duenio.cashMovement.findMany({ where: { createdBy: { contains: q } }, select: { amount: true } });
  assert.equal(asiento.amount, 1500);
});

test("2.b marcar dos veces a la vez: un asiento solo (el segundo avisa que ya estaba marcada)", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const q = await p.cuota(null, { tipo: "PAGO", monto: 1000 });
  const [r1, r2] = await enFilaDeLasFilas(p.base, "ProyectoCuota", [q], [p.marcar(q), p.marcar(q)]);
  assert.equal(r1.ok, true, JSON.stringify(r1));
  assert.deepEqual(r2, { ok: false, error: "Esa cuota ya estaba marcada." });
  assert.equal(await p.duenio.cashMovement.count({ where: { createdBy: { contains: q } } }), 1);
});

test("2.d marcar una cuota en dólares mientras cambia el tipo de cambio: asienta con el cambio vigente al marcar", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const { a } = p.base;
  await p.duenio.proyectoTipoCambio.upsert({ where: { tenantId_moneda: { tenantId: a.id, moneda: "USD" } }, create: { tenantId: a.id, moneda: "USD", porUnidad: 1000 }, update: { porUnidad: 1000 } });
  const q = (await p.duenio.proyectoCuota.create({ data: { tenantId: a.id, proyectoId: null, tipo: "PAGO", concepto: "Licencia", monto: 100, moneda: "USD", venceEl: new Date(AHORA + 5 * DIA), auto: false }, select: { id: true } })).id;
  const cta = await p.cuenta();
  // La pantalla leyó el cambio a $ 1.000; mientras el pedido espera la cuota, el cambio pasa a $ 1.200.
  const [r] = await enFilaDeLasFilas(p.base, "ProyectoCuota", [q], [p.marcar(q, cta)], async (c) => {
    await c.query(`UPDATE "ProyectoTipoCambio" SET "porUnidad" = 1200 WHERE "tenantId" = $1 AND "moneda" = 'USD'`, [a.id]);
  });
  assert.equal(r.ok, true, JSON.stringify(r));
  const [asiento] = await p.duenio.cashMovement.findMany({ where: { createdBy: { contains: q } }, select: { amount: true } });
  assert.equal(asiento.amount, 120_000, "el libro, con el cambio de ahora");
  const fila = await p.duenio.proyectoCuota.findUniqueOrThrow({ where: { id: q }, select: { cuentaMovido: true } });
  assert.equal(fila.cuentaMovido, -120_000);
  assert.equal((await p.duenio.proyectoCuentaBanco.findUniqueOrThrow({ where: { id: cta }, select: { saldo: true } })).saldo, -120_000, "el banco, con el mismo importe");
});

test("2.e marcar sin tipo de cambio o con una cuenta de otra moneda: vuelve atrás entero (ni marca, ni libro, ni banco)", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const { a } = p.base;
  const intacta = async (q: string, cta: string, saldo: number) => {
    assert.equal((await p.duenio.proyectoCuota.findUniqueOrThrow({ where: { id: q }, select: { pagadoEl: true } })).pagadoEl, null, "la cuota sigue sin marcar");
    assert.equal(await p.duenio.cashMovement.count({ where: { createdBy: { contains: q } } }), 0, "sin asiento en el libro");
    assert.equal((await p.duenio.proyectoCuentaBanco.findUniqueOrThrow({ where: { id: cta }, select: { saldo: true } })).saldo, saldo, "el banco no se movió");
  };
  // Cuota en dólares sin cambio cargado: el error sale adentro, después de tomar la cuota.
  await p.duenio.proyectoTipoCambio.deleteMany({ where: { tenantId: a.id, moneda: "USD" } });
  const enDolares = (await p.duenio.proyectoCuota.create({ data: { tenantId: a.id, proyectoId: null, tipo: "PAGO", concepto: "Licencia", monto: 100, moneda: "USD", venceEl: new Date(AHORA + 5 * DIA), auto: false }, select: { id: true } })).id;
  const enPesos = await p.cuenta();
  assert.deepEqual(await p.marcar(enDolares, enPesos)(), { ok: false, error: "Falta el tipo de cambio: cargalo en Monedas y gastos fijos." });
  await intacta(enDolares, enPesos, 0);
  // Cuota en pesos con una cuenta en dólares: no hay cómo moverla.
  const q = await p.cuota(null, { tipo: "PAGO", monto: 1000 });
  const ctaUsd = (await p.duenio.proyectoCuentaBanco.create({ data: { tenantId: a.id, nombre: "Banco USD", moneda: "USD", saldo: 50 }, select: { id: true } })).id;
  assert.deepEqual(await p.marcar(q, ctaUsd)(), { ok: false, error: "Esa cuenta está en USD y la cuota en ARS: elegí otra o dejala sin cuenta." });
  await intacta(q, ctaUsd, 50);
  // Después de la vuelta atrás, sin cuenta se marca.
  assert.equal((await p.marcar(q)()).ok, true);
});

test("2.c cambiar el vencimiento de una cuota que en el medio se pagó: no la toca", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const q = await p.cuota(null);
  const antes = await p.duenio.proyectoCuota.findUniqueOrThrow({ where: { id: q }, select: { venceEl: true } });
  const [r] = await enFilaDeLasFilas(p.base, "ProyectoCuota", [q], [p.vencimiento(q, "2026-12-24")], async (c) => {
    await c.query(`UPDATE "ProyectoCuota" SET "pagadoEl" = now(), "pagadoPor" = 'Otra pestaña' WHERE id = $1`, [q]);
  });
  assert.deepEqual(r, { ok: false, error: "Esa cuota ya se pagó o ya no corre." });
  const fila = await p.duenio.proyectoCuota.findUniqueOrThrow({ where: { id: q }, select: { venceEl: true, venceManual: true } });
  assert.deepEqual(fila, { venceEl: antes.venceEl, venceManual: false });
  assert.equal(await p.duenio.proyectoCambio.count({ where: { entidad: "cuota", entidadId: q, campo: "vencimiento" } }), 0);
});

// ── 4 · Una cuota, un movimiento: variantes de H2.b ─────────────────────────

test("4.a dos movimientos a la misma cuota de EMPRESA (sin proyecto), a la vez: queda atado uno solo", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const q = await p.cuota(null);
  const cta = await p.cuenta();
  const [m1, m2] = [await p.movimiento(cta, 1210), await p.movimiento(cta, 1210)];
  const [r1, r2] = await enFilaDeLasFilas(p.base, "ProyectoMovBanco", [m1, m2], [p.conciliar(m1, q), p.conciliar(m2, q)]);
  assert.deepEqual(r1, { ok: true });
  assert.deepEqual(r2, { ok: false, error: "Esa cuota ya está conciliada con otro movimiento." });
  assert.equal(await p.atados(q), 1);
});

test("4.b tres movimientos a la misma cuota a la vez: queda atado uno solo", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const q = await p.cuota(await p.proyecto());
  const cta = await p.cuenta();
  const ms = [await p.movimiento(cta, 1210), await p.movimiento(cta, 1210), await p.movimiento(cta, 1210)];
  const rs = await enFilaDeLasFilas(p.base, "ProyectoMovBanco", ms, ms.map((m) => p.conciliar(m, q)));
  assert.deepEqual(rs.map((r) => r.ok), [true, false, false]);
  assert.equal(await p.atados(q), 1);
});

test("4.c conciliar otro movimiento a la cuota mientras se desconcilia el suyo: espera y queda atado uno solo", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const q = await p.cuota(null);
  const cta = await p.cuenta();
  const m1 = await p.movimiento(cta, 1210, q);
  const m2 = await p.movimiento(cta, 1210);
  const [r1, r2] = await enFilaDeLasFilas(p.base, "ProyectoMovBanco", [m1], [p.desconciliar(m1), p.conciliar(m2, q)]);
  assert.deepEqual([r1, r2], [{ ok: true }, { ok: true }], "el que concilia espera a que se suelte la cuota");
  assert.equal(await p.atados(q), 1);
  assert.equal(await p.cuotaDe(m2), q);
});

test("4.d el mismo movimiento a dos cuotas distintas, a la vez: queda atado a una sola", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const [q1, q2] = [await p.cuota(null), await p.cuota(null)];
  const m = await p.movimiento(await p.cuenta(), 1210);
  const [r1, r2] = await enFilaDeLasFilas(p.base, "ProyectoMovBanco", [m], [p.conciliar(m, q1), p.conciliar(m, q2)]);
  assert.deepEqual(r1, { ok: true });
  assert.deepEqual(r2, { ok: false, error: "Ese movimiento ya estaba conciliado." });
  assert.equal(await p.cuotaDe(m), q1);
  assert.equal((await p.atados(q1)) + (await p.atados(q2)), 1);
});
