// ENG-000 (docs/agent/BACKLOG.md): el arnés de la base efímera hace lo que dice. La base sale
// migrada entera, con `app_rls` sin BYPASSRLS y una política por tabla con negocio; A y B se ven
// cada uno lo suyo y nada del otro; y al terminar la base no existe más (criterio 4), tampoco la
// de un proceso que murió sin borrarla.

import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readdirSync } from "node:fs";
import path from "node:path";
import pg from "pg";
import {
  baseEfimeraParaElTest,
  crearBaseEfimera,
  pidDeLaBase,
  queHacerSinPostgres,
  SinPostgres,
  urlDelServidor,
  urlDeRol,
  type BaseEfimera,
} from "./base-efimera";

test("la URL de cada rol: otro usuario, otra base, sin contraseña, y el socket se conserva", () => {
  assert.equal(
    urlDeRol("postgresql://postgres@localhost:5433/postgres?host=/tmp/pgrun", "app_rls", "erp_test_1_ab"),
    "postgresql://app_rls@localhost:5433/erp_test_1_ab?host=/tmp/pgrun",
  );
  assert.equal(
    urlDeRol("postgresql://postgres:secreta@localhost:5432/postgres", "neondb_owner", "erp_test_1_ab"),
    "postgresql://neondb_owner@localhost:5432/erp_test_1_ab",
  );
  assert.equal(urlDeRol("postgresql://postgres:secreta@localhost:5432/postgres", null, "x"), "postgresql://postgres:secreta@localhost:5432/x");
  assert.equal(urlDelServidor({ ERP_TEST_PG_URL: " postgresql://postgres@localhost:5432/postgres " }), "postgresql://postgres@localhost:5432/postgres");
  assert.equal(urlDelServidor({}), "postgresql://postgres@localhost:5433/postgres?host=/tmp/pgrun");
});

test("sin Postgres: en CI el test de base falla; fuera de CI se saltea", () => {
  assert.equal(queHacerSinPostgres({ CI: "true" }), "fallar");
  assert.equal(queHacerSinPostgres({ CI: "1" }), "fallar");
  assert.equal(queHacerSinPostgres({}), "saltear");
  assert.equal(queHacerSinPostgres({ CI: "false" }), "saltear");
  assert.equal(queHacerSinPostgres({ CI: "" }), "saltear");
});

test("sólo se reconocen (y se pueden barrer) las bases con el nombre del arnés", () => {
  assert.equal(pidDeLaBase("erp_test_4312_9f3a2b1c"), 4312);
  for (const ajena of ["erp_qa", "erp_uat", "erp_test_", "erp_test_abc_12", "erp_test_12_zz", "erp_seed_1_2", "xerp_test_1_ab"]) {
    assert.equal(pidDeLaBase(ajena), null, ajena);
  }
});

test("contra un servidor que no es de esta máquina el arnés no arranca", async () => {
  await assert.rejects(
    crearBaseEfimera({ ERP_TEST_PG_URL: "postgresql://neondb_owner:clave-secreta@ep-x-123.sa-east-1.aws.neon.tech/neondb?sslmode=require" }),
    (err: Error) => {
      assert.ok(!(err instanceof SinPostgres));
      assert.match(err.message, /ep-x-123\.sa-east-1\.aws\.neon\.tech, que no es un Postgres de esta máquina/);
      assert.ok(!err.message.includes("clave-secreta"));
      return true;
    },
  );
});

test("sin servidor: fuera de CI se saltea diciéndolo, en CI falla", async () => {
  const sinServidor = { ERP_TEST_PG_URL: "postgresql://postgres@localhost:5433/postgres?host=/tmp/no-hay-postgres-aca" };
  await assert.rejects(crearBaseEfimera(sinServidor), SinPostgres);

  const salteos: string[] = [];
  const falso = { skip: (m: string) => salteos.push(m), after: () => assert.fail("no hay base que borrar") } as unknown as TestContext;
  assert.equal(await baseEfimeraParaElTest(falso, sinServidor), null);
  assert.equal(salteos.length, 1);
  assert.match(salteos[0], /sin Postgres .*SIN verificar/);

  await assert.rejects(baseEfimeraParaElTest(falso, { ...sinServidor, CI: "true" }), /En CI el job tiene que levantar Postgres/);
});

async function consultar<T extends pg.QueryResultRow>(url: string, sql: string, params: unknown[] = []): Promise<T[]> {
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  try {
    return (await c.query<T>(sql, params)).rows;
  } finally {
    await c.end();
  }
}

async function existe(nombre: string): Promise<boolean> {
  const filas = await consultar(urlDeRol(urlDelServidor(), null, "postgres"), "SELECT 1 FROM pg_database WHERE datname = $1", [nombre]);
  return filas.length > 0;
}

test("contra Postgres: la base sale migrada, con RLS para app_rls, A y B separados, y se borra", async (t) => {
  const base = await baseEfimeraParaElTest(t);
  if (!base) return;
  const { a, b } = base;

  // Migrada entera: una fila terminada por cada carpeta de prisma/migrations.
  const carpetas = readdirSync(path.join(process.cwd(), "prisma", "migrations")).filter((n) => /^\d/.test(n));
  const aplicadas = await consultar<{ migration_name: string }>(
    base.urlDuenio,
    `SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY 1`,
  );
  assert.deepEqual(aplicadas.map((m) => m.migration_name), carpetas.sort());

  // app_rls: sin BYPASSRLS, dueño de nada; el dueño de las tablas es neondb_owner.
  const [rol] = await consultar<{ yo: string; bypass: boolean; propias: number }>(
    base.urlApp,
    `SELECT current_user AS yo, (SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user) AS bypass,
            (SELECT count(*)::int FROM pg_tables WHERE schemaname = 'public' AND tableowner = current_user) AS propias`,
  );
  assert.deepEqual(rol, { yo: "app_rls", bypass: false, propias: 0 });
  const duenios = await consultar<{ tableowner: string }>(base.urlDuenio, `SELECT DISTINCT tableowner FROM pg_tables WHERE schemaname = 'public'`);
  assert.deepEqual(duenios, [{ tableowner: "neondb_owner" }]);

  // Una política por cada tabla con negocio, y RLS encendido en todas.
  const [cobertura] = await consultar<{ con_negocio: number; con_politica: number; con_rls: number }>(
    base.urlDuenio,
    `SELECT (SELECT count(*)::int FROM information_schema.columns c JOIN information_schema.tables tb USING (table_schema, table_name)
              WHERE c.table_schema = 'public' AND c.column_name = 'tenantId' AND tb.table_type = 'BASE TABLE') AS con_negocio,
            (SELECT count(*)::int FROM pg_policies WHERE schemaname = 'public' AND policyname = 'tenant_isolation') AS con_politica,
            (SELECT count(*)::int FROM pg_class k JOIN pg_namespace n ON n.oid = k.relnamespace
              WHERE n.nspname = 'public' AND k.relkind = 'r' AND k.relrowsecurity) AS con_rls`,
  );
  assert.ok(cobertura.con_negocio > 30, JSON.stringify(cobertura));
  assert.deepEqual(cobertura, { con_negocio: cobertura.con_negocio, con_politica: cobertura.con_negocio, con_rls: cobertura.con_negocio });

  // Como app_rls: sin negocio no ve nada; con el de A, lo de A; con el de B, lo de B.
  const comoApp = async (tenantId: string | null) => {
    const c = new pg.Client({ connectionString: base.urlApp });
    await c.connect();
    try {
      await c.query("BEGIN");
      if (tenantId) await c.query(`SELECT set_config('app.current_tenant_id', $1, true)`, [tenantId]);
      const [v] = (
        await c.query<{ clientes: string[]; pedidos: string[]; usuarios: number }>(
          `SELECT coalesce((SELECT array_agg(id ORDER BY id) FROM "Client"), '{}') AS clientes,
                  coalesce((SELECT array_agg(id ORDER BY id) FROM "Order"), '{}') AS pedidos,
                  (SELECT count(*)::int FROM "User") AS usuarios`,
        )
      ).rows;
      await c.query("COMMIT");
      return v;
    } finally {
      await c.end();
    }
  };
  assert.deepEqual(await comoApp(null), { clientes: [], pedidos: [], usuarios: 0 });
  assert.deepEqual(await comoApp(a.id), { clientes: [...a.clientes].sort(), pedidos: [...a.pedidos].sort(), usuarios: 2 });
  assert.deepEqual(await comoApp(b.id), { clientes: [...b.clientes].sort(), pedidos: [...b.pedidos].sort(), usuarios: 2 });
  assert.equal(a.clientes.length !== b.clientes.length && a.pedidos.length !== b.pedidos.length, true, "cantidades distintas: una fuga se nota");

  // Con el negocio de A no se puede escribir una fila de B.
  const c = new pg.Client({ connectionString: base.urlApp });
  await c.connect();
  try {
    await c.query("BEGIN");
    await c.query(`SELECT set_config('app.current_tenant_id', $1, true)`, [a.id]);
    await assert.rejects(
      c.query(`INSERT INTO "Client" (id, "tenantId", name, phone, "updatedAt") VALUES ('intruso', $1, 'x', '1', now())`, [b.id]),
      /row-level security/,
    );
    await c.query("ROLLBACK");
  } finally {
    await c.end();
  }

  // El dueño de las tablas ve todo (como la consola): 3 clientes y 5 pedidos.
  const [todo] = await consultar<{ clientes: number; pedidos: number; negocios: string[] }>(
    base.urlDuenio,
    `SELECT (SELECT count(*)::int FROM "Client") AS clientes, (SELECT count(*)::int FROM "Order") AS pedidos,
            (SELECT array_agg(slug ORDER BY slug) FROM "Tenant") AS negocios`,
  );
  assert.deepEqual(todo, { clientes: 3, pedidos: 5, negocios: ["negocio-a", "negocio-b"] });
  assert.equal(a.host, "negocio-a.erp.test");
  assert.notEqual(a.id, a.slug, "id y slug distintos: un test que los confunda falla");

  // Se borra, y borrar dos veces no es un error.
  assert.equal(await existe(base.nombre), true);
  await base.borrar();
  assert.equal(await existe(base.nombre), false);
  await base.borrar();
});

test("contra Postgres: la base de un proceso muerto se barre; la de uno vivo, no", async (t) => {
  const admin = new pg.Client({ connectionString: urlDelServidor(), connectionTimeoutMillis: 3000 });
  try {
    await admin.connect();
  } catch {
    await admin.end().catch(() => {});
    const sinBase = await baseEfimeraParaElTest(t); // saltea o, en CI, falla con el motivo
    assert.equal(sinBase, null);
    return;
  }
  const vivo = spawn(process.execPath, ["-e", "setTimeout(() => {}, 60000)"], { stdio: "ignore" });
  const muerto = spawn(process.execPath, ["-e", ""], { stdio: "ignore" });
  await new Promise((ok) => muerto.on("exit", ok));
  const deMuerto = `erp_test_${muerto.pid}_dead0001`;
  const deVivo = `erp_test_${vivo.pid}_a11e0001`;
  let nueva: BaseEfimera | null = null;
  try {
    await admin.query(`CREATE DATABASE ${deMuerto}`);
    await admin.query(`CREATE DATABASE ${deVivo}`);
    nueva = await crearBaseEfimera();
    assert.equal(await existe(deMuerto), false, "la huérfana se barrió");
    assert.equal(await existe(deVivo), true, "la de un proceso vivo sigue");
  } finally {
    vivo.kill();
    await nueva?.borrar();
    await admin.query(`DROP DATABASE IF EXISTS ${deMuerto} WITH (FORCE)`);
    await admin.query(`DROP DATABASE IF EXISTS ${deVivo} WITH (FORCE)`);
    await admin.end();
  }
});
