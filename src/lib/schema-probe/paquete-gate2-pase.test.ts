// ============================================================================
// Pase N2 — los dos pasos que el pase suma al paquete Gate 2 (Postgres local efímero, nunca Neon)
// ============================================================================
//
//   N2_modulo_mercadopago.sql   (paso 0 bis) — `mercadopago` en Tenant.modules de todos los negocios
//   N2_integraciones_ruteo.sql  (paso 6 bis) — gsg_conexion_por_cuenta / gsg_conexiones_activas
//
// Corre igual que paquete-gate2.test.ts: `GATE2_PG_URL=… node --import tsx --test <este>` o, sin
// Postgres, `node scripts/qa/gate2-pglite.mjs src/lib/schema-probe/paquete-gate2-pase.test.ts`.
// Sin GATE2_PG_URL se saltea; con una URL que no es local, también.
//
// Qué prueba: el paso de módulos agrega sólo lo que falta, no duplica ni reordena, y la segunda
// corrida no toca filas; las funciones, como `app_rls` SIN negocio en el GUC (la tabla le da 0
// filas), devuelven sólo ("tenantId", id), sólo estados que reciben y sólo negocios con el
// conector en `modules`; el tope devuelve tope+1; un rol sin GRANT no las ejecuta; idempotentes;
// la reversa del pie las borra y se pueden volver a crear.
// ============================================================================
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";

const URL_ADMIN = process.env.GATE2_PG_URL ?? "";
const RAIZ = process.cwd();
const PENDIENTES = path.join(RAIZ, "prisma/pending-gate2");
const PRISMA_CLI = path.join(RAIZ, "node_modules", "prisma", "build", "index.js");

function esLocal(url: string): boolean {
  try {
    const h = new URL(url).hostname;
    return h === "localhost" || h === "127.0.0.1" || h === "::1" || h === "[::1]";
  } catch {
    return false;
  }
}
const motivoSalto = !URL_ADMIN
  ? "sin GATE2_PG_URL (Postgres local efímero)"
  : !esLocal(URL_ADMIN)
    ? "GATE2_PG_URL no es local: este test nunca corre contra Neon"
    : false;

const sufijo = `${process.pid}_${Date.now().toString(36)}`;
const BASE = `n2_pase_${sufijo}`;
const OTRO = `n2_pase_otro_${sufijo}`;
const urlBase = () => {
  const u = new URL(URL_ADMIN);
  u.pathname = `/${BASE}`;
  return u.toString();
};

/** Sentencias de un .sql como las corta psql (comentarios, comillas y $$…$$). */
function sentenciasSql(texto: string): string[] {
  const out: string[] = [];
  let actual = "";
  let i = 0;
  while (i < texto.length) {
    const c = texto[i];
    const d = texto[i + 1];
    if (c === "-" && d === "-") {
      const fin = texto.indexOf("\n", i);
      i = fin < 0 ? texto.length : fin;
      continue;
    }
    if (c === "'" || c === '"') {
      let j = i + 1;
      while (j < texto.length && !(texto[j] === c && texto[j + 1] !== c)) j += texto[j] === c ? 2 : 1;
      actual += texto.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    if (c === "$" && d === "$") {
      const fin = texto.indexOf("$$", i + 2);
      actual += texto.slice(i, fin + 2);
      i = fin + 2;
      continue;
    }
    if (c === ";") {
      if (actual.trim()) out.push(actual.trim());
      actual = "";
      i++;
      continue;
    }
    actual += c;
    i++;
  }
  if (actual.trim()) out.push(actual.trim());
  return out;
}

async function conCliente<T>(fn: (c: pg.Client) => Promise<T>, url = urlBase()): Promise<T> {
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  try {
    return await fn(c);
  } finally {
    await c.end();
  }
}
/** Como `psql -v ON_ERROR_STOP=1 -f`: autocommit, frena en el primer error. */
async function aplicar(archivo: string) {
  await conCliente(async (c) => {
    for (const s of sentenciasSql(readFileSync(archivo, "utf8"))) await c.query(s);
  });
}
function reversaDe(archivo: string): string {
  const l = readFileSync(path.join(PENDIENTES, archivo), "utf8").split(/\r?\n/);
  const desde = l.findIndex((x) => x.includes("REVERSA"));
  const ini = l.findIndex((x, k) => k > desde && x.trim() === "--   BEGIN;");
  const fin = l.findIndex((x, k) => k > ini && x.trim() === "--   COMMIT;");
  assert.ok(ini > 0 && fin > ini, `${archivo}: falta la reversa BEGIN…COMMIT`);
  return l.slice(ini, fin + 1).map((x) => x.replace(/^--   /, "")).join("\n");
}
/** Como `app_rls`, SIN negocio en el GUC, en una transacción (SET LOCAL; PGlite comparte sesión). */
async function comoApp<T>(rol: string, fn: (c: pg.Client) => Promise<T>): Promise<T> {
  return conCliente(async (c) => {
    await c.query("BEGIN");
    try {
      await c.query(`SET LOCAL ROLE "${rol}"`);
      return await fn(c);
    } finally {
      await c.query("ROLLBACK").catch(() => {});
    }
  });
}

const RUTEO = path.join(PENDIENTES, "N2_integraciones_ruteo.sql");
const MODULO_MP = path.join(PENDIENTES, "N2_modulo_mercadopago.sql");

test("pase N2: módulo mercadopago en todos los negocios + funciones de ruteo", { skip: motivoSalto }, async (t) => {
  await conCliente((c) => c.query(`CREATE DATABASE "${BASE}"`), URL_ADMIN);
  execFileSync(process.execPath, [PRISMA_CLI, "migrate", "deploy"], {
    cwd: RAIZ,
    env: { ...process.env, DATABASE_URL: urlBase(), MIGRATE_DATABASE_URL: "" },
    stdio: "ignore",
  });
  await conCliente(async (c) => {
    await c.query(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='neondb_owner') THEN CREATE ROLE neondb_owner NOLOGIN; END IF; END $$`);
    await c.query(`CREATE ROLE "${OTRO}" NOLOGIN`);
    await c.query(`GRANT USAGE ON SCHEMA public TO "${OTRO}"`);
    await c.query(`INSERT INTO "Tenant"(id, name, slug, "updatedAt", modules) VALUES
      ('n2-a','A','n2-a',now(),ARRAY['whatsapp','mercadopago','pos']),
      ('n2-b','B','n2-b',now(),ARRAY['whatsapp','pos']),
      ('n2-c','C','n2-c',now(),ARRAY[]::text[]),
      ('n2-d','D','n2-d',now(),NULL),
      ('n2-e','E','n2-e',now(),ARRAY['pos',NULL]::text[])`);
  });
  await aplicar(path.join(RAIZ, "prisma/rls/0002_app_role.sql"));
  await aplicar(path.join(RAIZ, "prisma/rls/0001_enable_rls.sql"));

  try {
    await t.test("0 bis: prende mercadopago donde falta, sin duplicar ni reordenar; la 2.ª corrida no toca filas", async () => {
      await aplicar(MODULO_MP);
      const modulos = async () =>
        conCliente(async (c) => (await c.query(`SELECT id, modules, xmin::text AS x FROM "Tenant" WHERE id LIKE 'n2-%' ORDER BY id`)).rows);
      const r1 = await modulos();
      assert.deepEqual(
        r1.map((r) => [r.id, r.modules]),
        [
          ["n2-a", ["whatsapp", "mercadopago", "pos"]],
          ["n2-b", ["whatsapp", "pos", "mercadopago"]],
          ["n2-c", ["mercadopago"]],
          ["n2-d", ["mercadopago"]],
          ["n2-e", ["pos", null, "mercadopago"]],
        ],
      );
      await aplicar(MODULO_MP);
      assert.deepEqual(await modulos(), r1, "idempotente: ni una fila reescrita");
    });

    await t.test("6 bis: se aplica dos veces sin error; search_path blindado (pg_catalog, pg_temp)", async () => {
      await aplicar(RUTEO);
      await aplicar(RUTEO);
      const conf = await conCliente(
        async (c) => (await c.query(`SELECT proname, proconfig, prosecdef FROM pg_proc WHERE proname LIKE 'gsg_conexion%' ORDER BY proname`)).rows,
      );
      assert.equal(conf.length, 2);
      for (const f of conf) {
        assert.equal(f.prosecdef, true, f.proname);
        assert.deepEqual(f.proconfig, ["search_path=pg_catalog, pg_temp"], f.proname);
      }
    });

    await conCliente(async (c) => {
      // n2-c NO tiene whatsapp en modules: su conexión no rutea aunque esté conectada.
      await c.query(`INSERT INTO "IntegracionConexion"(id,"tenantId",conector,"cuentaExterna",estado,"updatedAt",etiqueta,"rutaHash") VALUES
        ('cx-a-wa','n2-a','whatsapp','111','conectada', now(),'secreta-a','hash-a'),
        ('cx-a-mp','n2-a','mercadopago','mp-a','conectada', now(),NULL,NULL),
        ('cx-b-pa','n2-b','whatsapp','222','pausada', now(),NULL,NULL),
        ('cx-b-cp','n2-b','whatsapp','333','con_problemas', now() - interval '1 day',NULL,NULL),
        ('cx-c-wa','n2-c','whatsapp','444','conectada', now(),NULL,NULL)`);
      // Orden como el código (createdAt desc), no por updatedAt: la de B es más NUEVA aunque se tocó antes.
      await c.query(`UPDATE "IntegracionConexion" SET "createdAt" = now() - interval '3 min' WHERE id = 'cx-a-wa'`);
      await c.query(`UPDATE "IntegracionConexion" SET "createdAt" = now() - interval '1 min' WHERE id = 'cx-b-cp'`);
    });

    await t.test("como app_rls sin negocio: la tabla da 0 filas, las funciones rutean", async () => {
      await comoApp("app_rls", async (c) => {
        assert.equal((await c.query(`SELECT count(*)::int AS n FROM "IntegracionConexion"`)).rows[0].n, 0, "RLS: sin GUC no ve nada");
        const una = await c.query(`SELECT * FROM gsg_conexion_por_cuenta('whatsapp','111')`);
        assert.deepEqual(una.fields.map((f) => f.name), ["tenantId", "id"], "sólo tenantId e id");
        assert.deepEqual(una.rows, [{ tenantId: "n2-a", id: "cx-a-wa" }]);
        assert.equal((await c.query(`SELECT * FROM gsg_conexion_por_cuenta('whatsapp','222')`)).rowCount, 0, "pausada no rutea");
        assert.equal((await c.query(`SELECT * FROM gsg_conexion_por_cuenta('whatsapp','444')`)).rowCount, 0, "sin el módulo no rutea");
        assert.deepEqual((await c.query(`SELECT * FROM gsg_conexion_por_cuenta('mercadopago','mp-a')`)).rows, [{ tenantId: "n2-a", id: "cx-a-mp" }]);
        const activas = await c.query(`SELECT * FROM gsg_conexiones_activas('whatsapp', 20)`);
        assert.deepEqual(activas.rows, [
          { tenantId: "n2-b", id: "cx-b-cp" },
          { tenantId: "n2-a", id: "cx-a-wa" },
        ], "más reciente (createdAt) primero; sin pausada ni negocio sin módulo");
        assert.equal((await c.query(`SELECT * FROM gsg_conexiones_activas('whatsapp', 1)`)).rowCount, 2, "tope 1 → 2 filas: se pasó");
        assert.equal((await c.query(`SELECT * FROM gsg_conexiones_activas('whatsapp', 0)`)).rowCount, 1);
        assert.equal((await c.query(`SELECT * FROM gsg_conexiones_activas('whatsapp', NULL)`)).rowCount, 1, "NULL = tope 0");
        assert.equal((await c.query(`SELECT * FROM gsg_conexiones_activas('whatsapp', -5)`)).rowCount, 1, "negativo = tope 0");
        assert.equal((await c.query(`SELECT * FROM gsg_conexiones_activas('whatsapp', 2147483647)`)).rowCount, 2, "tope enorme: sin overflow");
      });
    });

    await t.test("un rol sin GRANT no las ejecuta (REVOKE de PUBLIC)", async () => {
      await assert.rejects(
        comoApp(OTRO, (c) => c.query(`SELECT * FROM gsg_conexion_por_cuenta('whatsapp','111')`)),
        /permission denied/,
      );
    });

    await t.test("3b: dos filas tardías del mismo hecho → completa una, la otra queda listada; idempotente", async () => {
      await aplicar(path.join(PENDIENTES, "N2_hub.sql"));
      await conCliente(async (c) => {
        await c.query(`INSERT INTO "OutboxEvent"(id,"tenantId",type,payload,clave) VALUES ('ev-ok','n2-a','x','{"_clave":"k0"}'::jsonb,'k0')`);
        await c.query(`INSERT INTO "OutboxEvent"(id,"tenantId",type,payload) VALUES
          ('ev-t1','n2-a','x','{"_clave":"k1"}'::jsonb), ('ev-t2','n2-a','x','{"_clave":"k1"}'::jsonb),
          ('ev-t3','n2-b','x','{"_clave":"k1"}'::jsonb), ('ev-t4','n2-a','x','{"_clave":"k0"}'::jsonb),
          ('ev-t5','n2-a','x','{"_clave":"k2"}'::jsonb)`);
      });
      const posterior = path.join(PENDIENTES, "N2_hub_posterior.sql");
      await aplicar(posterior);
      await aplicar(posterior);
      const filas = await conCliente(
        async (c) => (await c.query(`SELECT id, clave FROM "OutboxEvent" WHERE id LIKE 'ev-%' ORDER BY id`)).rows,
      );
      assert.deepEqual(filas, [
        { id: "ev-ok", clave: "k0" },
        { id: "ev-t1", clave: "k1" },
        { id: "ev-t2", clave: null }, // duplicado del mismo hecho en A: queda listado, no se borra
        { id: "ev-t3", clave: "k1" }, // otro negocio: es otro hecho
        { id: "ev-t4", clave: null }, // el hecho k0 ya tenía su fila
        { id: "ev-t5", clave: "k2" },
      ]);
    });

    await t.test("reversa del pie: borra las dos y se vuelven a crear", async () => {
      await conCliente((c) => c.query(reversaDe("N2_integraciones_ruteo.sql")));
      const cuantas = () =>
        conCliente(async (c) => (await c.query(`SELECT count(*)::int AS n FROM pg_proc WHERE proname IN ('gsg_conexion_por_cuenta','gsg_conexiones_activas')`)).rows[0].n);
      assert.equal(await cuantas(), 0);
      await aplicar(RUTEO);
      assert.equal(await cuantas(), 2);
    });
  } finally {
    await conCliente((c) => c.query(`DROP DATABASE IF EXISTS "${BASE}"`), URL_ADMIN).catch(() => {});
  }
});
