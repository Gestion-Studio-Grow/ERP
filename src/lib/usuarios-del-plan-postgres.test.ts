// Tope de usuarios del plan contra Postgres con RLS (R3-F3): la decisión ejecutada, no sólo calculada.

import { test } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { apuntarLaAppA, baseEfimeraDelArchivo, type BaseEfimera } from "@/test/base-efimera";

const laBase = baseEfimeraDelArchivo();

async function sql(base: BaseEfimera, q: string, v: unknown[] = []) {
  const c = new pg.Client({ connectionString: base.urlDuenio });
  await c.connect();
  try {
    return await c.query(q, v);
  } finally {
    await c.end();
  }
}

const activos = async (base: BaseEfimera, id: string) =>
  Number((await sql(base, `SELECT count(*)::int AS n FROM "User" WHERE "tenantId" = $1 AND active AND "deletedAt" IS NULL`, [id])).rows[0].n);

const datos = (email: string) => ({ name: "Tercera", email, role: "RECEPTION" as const, passwordHash: "x" });

test("un negocio Micro (2 usuarios) no puede crear un tercero y recibe el porqué", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  apuntarLaAppA(base);
  const { crearUsuarioSiEntra } = await import("@/lib/usuarios-del-plan");
  const A = base.a.id;
  await sql(base, `UPDATE "Tenant" SET plan = 'micro' WHERE id = $1`, [A]);
  assert.equal(await activos(base, A), 2);
  const r = await crearUsuarioSiEntra({ data: { tenantId: A, ...datos("tercera@a.test") } });
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.motivo, /^Tu plan incluye hasta 2 personas con usuario\. Para sumar otra, escribinos a Gestión Studio Grow/);
  assert.equal(await activos(base, A), 2, "no se creó nadie");
});

test("con un ajuste de GSG (3) entra uno más; sin plan del catálogo no hay tope", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  apuntarLaAppA(base);
  const { crearUsuarioSiEntra } = await import("@/lib/usuarios-del-plan");
  const A = base.a.id;
  await sql(base, `UPDATE "Tenant" SET plan = 'micro' WHERE id = $1`, [A]);
  await sql(
    base,
    `INSERT INTO "AuditLog" (id, "tenantId", actor, action, entity, "entityId", changes, channel)
     VALUES ('ajuste-u', $1, 'operator:prueba', 'limite.ajustar', 'LimiteDelPlan', 'usuarios', '{"plan":"micro","valor":3}'::jsonb, 'operador')`,
    [A],
  );
  const baseA = await activos(base, A);
  const r = await crearUsuarioSiEntra({ data: { tenantId: A, ...datos(`t-${baseA}@a.test`) } });
  assert.equal(r.ok, baseA < 3, `con ${baseA} activos y tope 3`);
  const B = base.b.id;
  await sql(base, `UPDATE "Tenant" SET plan = NULL WHERE id = $1`, [B]);
  for (let i = 0; i < 3; i++) assert.equal((await crearUsuarioSiEntra({ data: { tenantId: B, ...datos(`libre-${i}@b.test`) } })).ok, true);
});

test("CH (beauty-spa) no tiene tope nuevo: se comporta como hoy", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  apuntarLaAppA(base);
  const { crearUsuarioSiEntra } = await import("@/lib/usuarios-del-plan");
  const B = base.b.id;
  await sql(base, `UPDATE "Tenant" SET slug = 'beauty-spa', plan = 'micro' WHERE id = $1`, [B]);
  for (let i = 0; i < 3; i++) assert.equal((await crearUsuarioSiEntra({ data: { tenantId: B, ...datos(`ch-${i}@b.test`) } })).ok, true);
  await sql(base, `UPDATE "Tenant" SET slug = $2 WHERE id = $1`, [B, base.b.slug]);
});

/** Espera hasta que `cond` dé verdadero (o falla con `que` a los 10 s). */
async function esperarA(que: string, cond: () => Promise<boolean>): Promise<void> {
  const hasta = Date.now() + 10_000;
  while (!(await cond())) {
    if (Date.now() > hasta) throw new Error(`No pasó a tiempo: ${que}`);
    await new Promise((r) => setTimeout(r, 25));
  }
}

test("dos altas a la vez por el último lugar: entra una sola (la segunda espera a la primera)", async (t) => {
  // Cruce forzado, sin depender de la suerte del reloj:
  //   1. T0 (otra conexión) inserta sin confirmar un usuario con el mismo email que va a usar el alta A.
  //   2. El alta A decide que entra (T0 no se ve: no está confirmado) y queda frenada en su INSERT,
  //      esperando a T0 por el índice único (tenantId, email). Sigue con su transacción abierta.
  //   3. Arranca el alta B por el último lugar. Con el candado por negocio, B queda esperando el
  //      candado de A; sin candado, B cuenta el lugar libre, crea su usuario y termina.
  //   4. T0 se deshace: A termina. Con candado, B recién ahí cuenta y ve el lugar lleno.
  // Sin `pg_advisory_xact_lock` en decidirAltaDeUsuarioEnTx este test falla (entran las dos).
  const base = await laBase(t);
  if (!base) return;
  apuntarLaAppA(base);
  const { crearUsuarioSiEntra, reactivarUsuarioSiEntra } = await import("@/lib/usuarios-del-plan");
  const A = base.a.id;
  const n = await activos(base, A);
  await sql(base, `UPDATE "Tenant" SET plan = 'micro' WHERE id = $1`, [A]);
  await sql(
    base,
    `INSERT INTO "AuditLog" (id, "tenantId", actor, action, entity, "entityId", changes, channel, "createdAt")
     VALUES ('ajuste-c', $1, 'operator:prueba', 'limite.ajustar', 'LimiteDelPlan', 'usuarios', $2::jsonb, 'operador', now() + interval '1 second')`,
    [A, JSON.stringify({ plan: "micro", valor: n + 1 })],
  );

  const t0 = new pg.Client({ connectionString: base.urlDuenio });
  const mirador = new pg.Client({ connectionString: base.urlDuenio });
  await Promise.all([t0.connect(), mirador.connect()]);
  try {
    const pidT0 = Number((await t0.query(`SELECT pg_backend_pid() AS p`)).rows[0].p);
    await t0.query("BEGIN");
    await t0.query(
      `INSERT INTO "User" (id, "tenantId", name, email, "passwordHash", role, active, "updatedAt")
       VALUES ('u-t0', $1, 'Sin confirmar', 'c1@a.test', 'x', 'RECEPTION', true, now())`,
      [A],
    );

    const altaA = crearUsuarioSiEntra({ data: { tenantId: A, ...datos("c1@a.test") } });
    await esperarA("el alta A queda frenada detrás de T0", async () =>
      Number((await mirador.query(`SELECT count(*)::int AS n FROM pg_stat_activity WHERE $1 = ANY(pg_blocking_pids(pid))`, [pidT0])).rows[0].n) > 0,
    );

    let bTermino = false;
    const altaB = crearUsuarioSiEntra({ data: { tenantId: A, ...datos("c2@a.test") } }).finally(() => {
      bTermino = true;
    });
    await esperarA("el alta B espera el candado de A o termina", async () => {
      if (bTermino) return true;
      const q = await mirador.query(
        `SELECT count(*)::int AS n FROM pg_locks WHERE locktype = 'advisory' AND NOT granted
            AND database = (SELECT oid FROM pg_database WHERE datname = current_database())`,
      );
      return Number(q.rows[0].n) > 0;
    });
    assert.equal(bTermino, false, "B no esperó a A: dos altas pueden contar el mismo lugar libre");

    await t0.query("ROLLBACK");
    const rs = await Promise.all([altaA, altaB]);
    assert.deepEqual(
      rs.map((r) => r.ok),
      [true, false],
      "entra la primera; la segunda recibe el porqué",
    );
    const rechazo = rs[1];
    if (!rechazo.ok) assert.match(rechazo.motivo, /^Tu plan incluye hasta/);
    assert.equal(await activos(base, A), n + 1);
  } finally {
    await t0.query("ROLLBACK").catch(() => undefined);
    await Promise.all([t0.end(), mirador.end()]);
  }

  // Reactivar también suma: con el lugar lleno, no entra.
  const baja = await sql(base, `UPDATE "User" SET active = false WHERE "tenantId" = $1 AND email = 'c1@a.test' RETURNING id`, [A]);
  const id = String(baja.rows[0].id);
  assert.equal((await crearUsuarioSiEntra({ data: { tenantId: A, ...datos("c3@a.test") } })).ok, true);
  const r = await reactivarUsuarioSiEntra(A, id);
  assert.equal(r.ok, false);
  assert.equal(await activos(base, A), n + 1);
});
