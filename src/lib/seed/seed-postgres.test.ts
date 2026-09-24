// ENG-001, criterio 3: el seed REAL (prisma/seed.ts) contra Postgres con el ROL DUEÑO, que es el
// caso peligroso (sin RLS de por medio). Base propia `erp_seed_*` creada por el test, con todas las
// migraciones; dos negocios: el de muestra y otro con datos. Después del seed, el otro negocio
// tiene exactamente las mismas filas. Además: contra una URL de Neon el seed sale con error antes
// de conectarse. Sin el Postgres local (/tmp/pgrun), la parte de base se SALTEA diciéndolo.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import pg from "pg";

const SOCKET = "/tmp/pgrun";
const PUERTO = 5433;
const urlDe = (db: string) => `postgresql://postgres@localhost:${PUERTO}/${db}?host=${SOCKET}`;

function correr(cmd: string, args: string[], databaseUrl: string) {
  return spawnSync(cmd, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    timeout: 180_000,
    env: { ...process.env, DATABASE_URL: databaseUrl, MIGRATE_DATABASE_URL: databaseUrl },
  });
}

test("el seed contra una base de Neon sale con error y no se conecta", () => {
  const r = correr("npx", ["tsx", "prisma/seed.ts"], "postgresql://neondb_owner:clave-secreta@ep-x-123.sa-east-1.aws.neon.tech/neondb?sslmode=require");
  assert.notEqual(r.status, 0, "tiene que abortar");
  assert.match(r.stderr, /seed: abortado/);
  assert.ok(!`${r.stdout}${r.stderr}`.includes("clave-secreta"), "no muestra la contraseña");
});

test("el seed con el rol dueño recarga sólo el negocio de muestra: el otro negocio queda igual", async (t) => {
  const admin = new pg.Client({ connectionString: urlDe("postgres"), connectionTimeoutMillis: 3000 });
  try {
    await admin.connect();
  } catch {
    return t.skip(`sin Postgres local (${SOCKET}:${PUERTO}): el seed contra la base queda SIN verificar`);
  }
  const db = `erp_seed_${process.pid}_${Math.floor(Math.random() * 1e6)}`;
  await admin.query(`CREATE DATABASE ${db}`);
  const base = new pg.Client({ connectionString: urlDe(db) });
  try {
    const mig = correr("npx", ["prisma", "migrate", "deploy"], urlDe(db));
    assert.equal(mig.status, 0, `migrate deploy: ${mig.stderr}`);

    await base.connect();
    await base.query(`
      INSERT INTO "Tenant" (id, name, slug, "updatedAt") VALUES
        ('t-muestra', 'Beauty & Spa', 'beauty-spa', now()),
        ('t-otro', 'Otro negocio', 'otro-negocio', now());
      INSERT INTO "Box" (id, "tenantId", name, "updatedAt") VALUES ('b-otro', 't-otro', 'Box del otro', now());
      INSERT INTO "Client" (id, "tenantId", name, phone, "updatedAt") VALUES
        ('c-otro-1', 't-otro', 'Clienta del otro', '1100000001', now()),
        ('c-otro-2', 't-otro', 'Cliente del otro', '1100000002', now()),
        ('c-vieja', 't-muestra', 'Ficha vieja de muestra', '1100000003', now());
    `);
    const filasDe = async (tenantId: string) => {
      const r = await base.query<{ tabla: string; n: string }>(
        `SELECT 'Box' AS tabla, count(*) AS n FROM "Box" WHERE "tenantId" = $1
         UNION ALL SELECT 'Client', count(*) FROM "Client" WHERE "tenantId" = $1
         UNION ALL SELECT 'Service', count(*) FROM "Service" WHERE "tenantId" = $1
         UNION ALL SELECT 'Professional', count(*) FROM "Professional" WHERE "tenantId" = $1`,
        [tenantId],
      );
      return Object.fromEntries(r.rows.map((x) => [x.tabla, Number(x.n)]));
    };
    const otroAntes = await filasDe("t-otro");

    const seed = correr("npx", ["tsx", "prisma/seed.ts"], urlDe(db));
    assert.equal(seed.status, 0, `seed: ${seed.stderr}`);

    assert.deepEqual(await filasDe("t-otro"), otroAntes, "el otro negocio no pierde ni gana filas");
    assert.deepEqual(await filasDe("t-muestra"), { Box: 3, Client: 1, Service: 5, Professional: 3 });
    const vieja = await base.query(`SELECT 1 FROM "Client" WHERE id = 'c-vieja'`);
    assert.equal(vieja.rowCount, 0, "la ficha vieja del negocio de muestra se reemplaza");
  } finally {
    await base.end().catch(() => {});
    await admin.query(`DROP DATABASE IF EXISTS ${db} WITH (FORCE)`);
    await admin.end();
  }
});
