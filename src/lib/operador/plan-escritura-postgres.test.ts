// ============================================================================
// PLAN DEL NEGOCIO contra Postgres de verdad (R2-F4) — base efímera con RLS (src/test/base-efimera.ts).
// ============================================================================
//
// Lo que tiene que pasar en el laboratorio:
//   · Micro → PyME → Micro deja los mismos conteos por tabla y las mismas pantallas al final.
//   · La vista previa coincide con lo que queda en la base después de aplicar.
//   · Una escritura con una foto vieja no cambia nada ("cambio").
//   · CH (beauty-spa) queda bloqueado con el motivo del OK del dueño, aunque se llame directo.
//   · Una fila forjada desde el panel del negocio (rol app_rls, canal "admin") no cambia el plan
//     ni sus límites.

import { test } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { apuntarLaAppA, baseEfimeraDelArchivo, type BaseEfimera } from "@/test/base-efimera";
import { prepararAccionesDeServidor } from "@/test/accion-de-servidor";

const laBase = baseEfimeraDelArchivo();

async function conDuenio<T>(base: BaseEfimera, fn: (c: pg.Client) => Promise<T>): Promise<T> {
  const c = new pg.Client({ connectionString: base.urlDuenio });
  await c.connect();
  try {
    return await fn(c);
  } finally {
    await c.end();
  }
}

/** Filas por tabla del negocio (todas las tablas con `tenantId`, menos la auditoría, que crece a propósito). */
async function conteosDe(base: BaseEfimera, tenantId: string): Promise<Record<string, number>> {
  return conDuenio(base, async (c) => {
    const { rows } = await c.query<{ t: string }>(
      `SELECT DISTINCT table_name AS t FROM information_schema.columns
        WHERE table_schema = 'public' AND column_name = 'tenantId' ORDER BY 1`,
    );
    const out: Record<string, number> = {};
    for (const { t } of rows) {
      if (t === "AuditLog") continue;
      const q = await c.query<{ n: number }>(`SELECT count(*)::int AS n FROM "${t}" WHERE "tenantId" = $1`, [tenantId]);
      out[t] = q.rows[0].n;
    }
    return out;
  });
}

async function modulo() {
  prepararAccionesDeServidor();
  const escritura = await import("@/lib/operador/plan-escritura.server");
  const plan = await import("@/app/operador/(console)/tenants/[id]/plan-del-negocio");
  const { catalogo } = await import("@/modules/catalog");
  const { limitesDelNegocio } = await import("@/planes/limites");
  const { diferenciasDeConteo } = await import("@/modules/perfil-datos");
  const flags = { registroGlobal: true, enInicioPorApps: true };
  async function vista(tenantId: string, p: string) {
    const n = await escritura.leerNegocioParaPlan(tenantId);
    assert.ok(n, "el negocio existe");
    const filas = await escritura.leerFilasDeLimites(tenantId);
    return { n, filas, previa: plan.vistaPreviaDePlan(n, p, flags, catalogo(), filas) };
  }
  async function aplicar(tenantId: string, p: string) {
    const { n, previa } = await vista(tenantId, p);
    assert.ok(previa.ok, `vista previa de ${p}: ${previa.ok ? "" : previa.motivo}`);
    const r = await escritura.escribirPlanConCandado({
      tenantId,
      leido: { plan: n.plan, modules: n.modules, profile: n.profile },
      previa,
      operador: "prueba",
    });
    return { previa, r, n };
  }
  return { escritura, plan, limitesDelNegocio, diferenciasDeConteo, vista, aplicar };
}

test("Micro → PyME → Micro: mismos conteos por tabla, mismas pantallas, la vista previa es lo que queda", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  apuntarLaAppA(base);
  const m = await modulo();
  const A = base.a.id;

  const primero = await m.aplicar(A, "micro");
  assert.equal(primero.r.tipo, "ok");
  assert.ok(primero.previa.ok);
  const conteosMicro = await conteosDe(base, A);
  const modulosMicro = [...primero.previa.despues.modules].sort();
  const appsMicro = primero.previa.appsDespues.map((a) => a.id).sort();

  // La vista previa coincide con lo que queda: releída de la base, "micro" ya no tiene nada que cambiar.
  const releida = await m.vista(A, "micro");
  assert.ok(releida.previa.ok && releida.previa.sinCambios, "después de aplicar, la base es la vista previa");
  assert.deepEqual([...releida.n.modules].sort(), modulosMicro);
  assert.deepEqual(releida.previa.appsDespues.map((a) => a.id).sort(), appsMicro);

  // Un ajuste de límite con Micro; al pasar a PyME se cierra.
  const ajuste = await m.escritura.escribirExcepcionDeLimite({ tenantId: A, planVisto: "micro", limite: "usuarios", valor: 5, operador: "prueba" });
  assert.equal(ajuste.tipo, "ok");
  const conAjuste = m.limitesDelNegocio({ slug: base.a.slug, plan: "micro" }, await m.escritura.leerFilasDeLimites(A));
  assert.equal(conAjuste.topes.usuarios.valor, 5);
  assert.equal(conAjuste.topes.usuarios.origen, "excepcion");

  const pyme = await m.aplicar(A, "pyme");
  assert.deepEqual(pyme.r, { tipo: "ok", excepcionesCerradas: 1 });
  assert.ok(pyme.previa.ok);
  const enPyme = await m.vista(A, "pyme");
  assert.ok(enPyme.previa.ok && enPyme.previa.sinCambios);
  assert.deepEqual(enPyme.previa.appsDespues.map((a) => a.id).sort(), pyme.previa.appsDespues.map((a) => a.id).sort());

  const vuelta = await m.aplicar(A, "micro");
  assert.equal(vuelta.r.tipo, "ok");
  assert.ok(vuelta.previa.ok);
  assert.deepEqual([...vuelta.previa.despues.modules].sort(), modulosMicro, "vuelve con los mismos módulos");
  assert.deepEqual(vuelta.previa.appsDespues.map((a) => a.id).sort(), appsMicro, "vuelve con las mismas pantallas");
  assert.deepEqual(m.diferenciasDeConteo(conteosMicro, await conteosDe(base, A)), [], "ninguna tabla ganó ni perdió filas");

  // El ajuste de Micro quedó cerrado: vuelve a valer el tope del plan.
  const alFinal = m.limitesDelNegocio({ slug: base.a.slug, plan: "micro" }, await m.escritura.leerFilasDeLimites(A));
  assert.equal(alFinal.topes.usuarios.origen, "plan");

  // Tres cambios de plan = tres filas de auditoría con quién, antes y después.
  const filas = await conDuenio(base, (c) =>
    c.query<{ actor: string; changes: { antes: { plan: string | null }; despues: { plan: string } } }>(
      `SELECT actor, changes FROM "AuditLog" WHERE "tenantId" = $1 AND action = 'tenant.plan.aplicar' ORDER BY "createdAt", id`,
      [A],
    ),
  );
  assert.deepEqual(
    filas.rows.map((f) => [f.actor, f.changes.antes.plan, f.changes.despues.plan]),
    [
      ["operator:prueba", null, "micro"],
      ["operator:prueba", "micro", "pyme"],
      ["operator:prueba", "pyme", "micro"],
    ],
  );
});

test("una escritura con una foto vieja no cambia nada", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  apuntarLaAppA(base);
  const m = await modulo();
  const A = base.a.id;
  await m.aplicar(A, "micro");
  const { n, previa } = await m.vista(A, "comerciante");
  assert.ok(previa.ok);
  // Otro operador lo pasa a PyME en el medio.
  assert.equal((await m.aplicar(A, "pyme")).r.tipo, "ok");
  const r = await m.escritura.escribirPlanConCandado({
    tenantId: A,
    leido: { plan: n.plan, modules: n.modules, profile: n.profile },
    previa,
    operador: "prueba",
  });
  assert.deepEqual(r, { tipo: "cambio" });
  const plan = await conDuenio(base, (c) => c.query<{ plan: string }>(`SELECT plan FROM "Tenant" WHERE id = $1`, [A]));
  assert.equal(plan.rows[0].plan, "pyme");
  // Un ajuste pedido con el plan viejo tampoco se escribe.
  const ajuste = await m.escritura.escribirExcepcionDeLimite({ tenantId: A, planVisto: "micro", limite: "usuarios", valor: 9, operador: "prueba" });
  assert.deepEqual(ajuste, { tipo: "cambio" });
});

test("CH (beauty-spa) queda bloqueado con el motivo del OK del dueño, aunque se llame directo a la escritura", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  apuntarLaAppA(base);
  const m = await modulo();
  const B = base.b.id;
  await conDuenio(base, (c) => c.query(`UPDATE "Tenant" SET slug = 'beauty-spa', plan = 'micro' WHERE id = $1`, [B]));
  const { previa } = await m.vista(B, "pyme");
  assert.deepEqual(previa, { ok: false, motivo: m.plan.MOTIVO_PLAN_OK_DEL_DUENIO });

  // Directo a la escritura con una vista previa armada para otro negocio: tampoco.
  const otra = await m.vista(base.a.id, "pyme");
  assert.ok(otra.previa.ok);
  const nB = await m.escritura.leerNegocioParaPlan(B);
  assert.ok(nB);
  const r = await m.escritura.escribirPlanConCandado({
    tenantId: B,
    leido: { plan: nB.plan, modules: nB.modules, profile: nB.profile },
    previa: otra.previa,
    operador: "prueba",
  });
  assert.deepEqual(r, { tipo: "rechazado", motivo: m.plan.MOTIVO_PLAN_OK_DEL_DUENIO });
  const ajuste = await m.escritura.escribirExcepcionDeLimite({ tenantId: B, planVisto: "micro", limite: "usuarios", valor: 50, operador: "prueba" });
  assert.deepEqual(ajuste, { tipo: "rechazado", motivo: m.plan.MOTIVO_PLAN_OK_DEL_DUENIO });
  const fila = await conDuenio(base, (c) =>
    c.query<{ plan: string; n: number }>(
      `SELECT t.plan, (SELECT count(*)::int FROM "AuditLog" a WHERE a."tenantId" = t.id) AS n FROM "Tenant" t WHERE t.id = $1`,
      [B],
    ),
  );
  assert.equal(fila.rows[0].plan, "micro", "el plan de CH no cambió");
});

test("una fila forjada desde el panel del negocio no cambia el plan ni sus límites", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  apuntarLaAppA(base);
  const m = await modulo();
  const A = base.a.id;
  await m.aplicar(A, "micro");
  const antes = m.limitesDelNegocio({ slug: base.a.slug, plan: "micro" }, await m.escritura.leerFilasDeLimites(A));

  // Con el rol de la app (RLS aplicado), como escribiría el panel: canal "admin".
  const app = new pg.Client({ connectionString: base.urlApp });
  await app.connect();
  try {
    await app.query("BEGIN");
    await app.query(`SELECT set_config('app.current_tenant_id', $1, true)`, [A]);
    const insertar = `INSERT INTO "AuditLog" (id, "tenantId", actor, action, entity, "entityId", changes, channel)
                      VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)`;
    await app.query(insertar, ["forjada-1", A, "operator:alguien", "limite.ajustar", "LimiteDelPlan", "usuarios", '{"plan":"micro","valor":99}', "admin"]);
    await app.query(insertar, ["forjada-2", A, "admin", "limite.ajustar", "LimiteDelPlan", "usuarios", '{"plan":"micro","valor":98}', "operador"]);
    await app.query(insertar, ["forjada-3", A, "operator:alguien", "tenant.plan.aplicar", "Tenant", A, '{"despues":{"plan":"pyme"}}', "admin"]);
    await app.query("COMMIT");
  } finally {
    await app.end();
  }
  const despues = m.limitesDelNegocio({ slug: base.a.slug, plan: "micro" }, await m.escritura.leerFilasDeLimites(A));
  assert.deepEqual(despues.topes, antes.topes, "los topes no cambiaron");
  const plan = await conDuenio(base, (c) => c.query<{ plan: string }>(`SELECT plan FROM "Tenant" WHERE id = $1`, [A]));
  assert.equal(plan.rows[0].plan, "micro");
});
