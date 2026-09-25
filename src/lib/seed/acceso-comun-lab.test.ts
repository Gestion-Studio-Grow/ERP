// Acceso común del laboratorio (pedido del dueño, 2026-09-25): un mismo usuario y una misma clave
// entran en todos los negocios de una base LOCAL, y todos los usuarios que ya había vuelven a
// entrar con esa clave. Contra Postgres real (src/test/base-efimera.ts, negocios A y B, rol
// dueño de las tablas). El ingreso se comprueba como lo hace la app: rol `app_rls` con el negocio
// fijado por RLS, la misma búsqueda que `login` (src/lib/auth-actions.ts) y `verifyPassword`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, statSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pg from "pg";
import { baseEfimeraParaElTest, type BaseEfimera } from "@/test/base-efimera";
import { verifyPassword, hashPassword } from "@/lib/auth-password";
import { restaurarAccesoComun, EMAIL_COMUN } from "@/lib/seed/acceso-comun-lab";

const CLAVE = "Laboratorio-2026-comun";
const SCRIPT = "scripts/lab-acceso-comun.mts";

function correrScript(args: string[], env: Record<string, string>) {
  return spawnSync("npx", ["tsx", SCRIPT, ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    timeout: 120_000,
    env: { ...process.env, ...env },
  });
}

/** Lo que ve `login` en ese negocio para ese email: la fila bajo RLS, como `app_rls`. */
async function entra(base: BaseEfimera, tenantId: string, email: string, clave: string): Promise<boolean> {
  const app = new pg.Client({ connectionString: base.urlApp });
  await app.connect();
  try {
    await app.query("BEGIN");
    await app.query("SELECT set_config('app.current_tenant_id', $1, true)", [tenantId]);
    const r = await app.query<{ passwordHash: string }>(
      `SELECT "passwordHash" FROM "User"
        WHERE "tenantId" = $1 AND email = $2 AND active = true AND "deletedAt" IS NULL
        LIMIT 1`,
      [tenantId, email],
    );
    await app.query("COMMIT");
    return r.rows.length === 1 && (await verifyPassword(clave, r.rows[0].passwordHash));
  } finally {
    await app.end();
  }
}

async function fotoDeUsuarios(url: string) {
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  try {
    const r = await c.query(
      `SELECT id, "tenantId", email, role::text AS role, "passwordHash", active,
              "deletedAt", "updatedAt"
         FROM "User" ORDER BY id`,
    );
    return r.rows;
  } finally {
    await c.end();
  }
}

async function conDuenio<T>(base: BaseEfimera, fn: (c: pg.Client) => Promise<T>): Promise<T> {
  const c = new pg.Client({ connectionString: base.urlDuenio });
  await c.connect();
  try {
    return await fn(c);
  } finally {
    await c.end();
  }
}

test("contra una base que no es de esta máquina el script sale con error, sin conectarse ni mostrar la clave", () => {
  const r = correrScript(["--respaldo", join(tmpdir(), "no-se-usa.json")], {
    DATABASE_URL: "postgresql://neondb_owner:clave-secreta@ep-x-123.sa-east-1.aws.neon.tech/neondb?sslmode=require",
    LAB_CLAVE_COMUN: CLAVE,
  });
  assert.notEqual(r.status, 0, "tiene que abortar");
  assert.match(r.stderr, /acceso común: abortado/);
  const salida = `${r.stdout}${r.stderr}`;
  assert.ok(!salida.includes("clave-secreta"), "no muestra la contraseña de la base");
  assert.ok(!salida.includes(CLAVE), "no muestra la clave común");
});

test("una clave común que no cumple la política de contraseñas no se acepta", () => {
  const r = correrScript(["--respaldo", join(tmpdir(), "no-se-usa.json")], {
    DATABASE_URL: "postgresql://postgres@localhost:5433/no_existe?host=/tmp/pgrun",
    LAB_CLAVE_COMUN: "ERP",
  });
  assert.notEqual(r.status, 0, "tiene que abortar");
  assert.match(r.stderr, /acceso común: abortado/);
  assert.match(r.stderr, /10 caracteres/);
});

test("el respaldo y las credenciales no se pueden escribir dentro del repo: la clave en claro no se commitea", () => {
  const adentro = join(process.cwd(), ".qa", "credenciales-que-no-debe-existir.md");
  const r = correrScript(["--respaldo", join(tmpdir(), "no-se-usa.json"), "--credenciales", adentro], {
    DATABASE_URL: "postgresql://postgres@localhost:5433/no_existe?host=/tmp/pgrun",
    LAB_CLAVE_COMUN: CLAVE,
  });
  assert.notEqual(r.status, 0, "tiene que abortar");
  assert.match(r.stderr, /fuera del repo/);
  assert.ok(!existsSync(adentro));
  const r2 = correrScript(["--respaldo", join(process.cwd(), "respaldo-que-no-debe-existir.json")], {
    DATABASE_URL: "postgresql://postgres@localhost:5433/no_existe?host=/tmp/pgrun",
    LAB_CLAVE_COMUN: CLAVE,
  });
  assert.notEqual(r2.status, 0, "tiene que abortar");
  assert.match(r2.stderr, /fuera del repo/);
});

test("después de restaurar, el usuario común entra en cada negocio y todos los que había vuelven a entrar con la misma clave, incluso los dados de baja", async (t) => {
  const base = await baseEfimeraParaElTest(t);
  if (!base) return;
  // La recepción de B está dada de baja y la dueña de A, desactivada: "restaurar todos" las trae.
  await conDuenio(base, async (c) => {
    await c.query(`UPDATE "User" SET "deletedAt" = now() WHERE id = $1`, [base.b.recepcion.id]);
    await c.query(`UPDATE "User" SET active = false WHERE id = $1`, [base.a.duenia.id]);
  });
  assert.equal(await entra(base, base.b.recepcion.tenantId, base.b.recepcion.email, CLAVE), false, "antes no entra");

  const hash = await hashPassword(CLAVE);
  const negocios = await conDuenio(base, (c) =>
    restaurarAccesoComun(c, { email: EMAIL_COMUN, nombre: "GSG laboratorio", hashDeLaClave: hash, guardarRespaldo: () => {} }),
  );

  assert.deepEqual(negocios.map((n) => n.slug).sort(), [base.a.slug, base.b.slug].sort());
  for (const negocio of [base.a, base.b]) {
    assert.ok(await entra(base, negocio.id, EMAIL_COMUN, CLAVE), `el usuario común entra en ${negocio.slug}`);
    assert.ok(await entra(base, negocio.id, negocio.duenia.email, CLAVE), `la dueña de ${negocio.slug} entra`);
    assert.ok(await entra(base, negocio.id, negocio.recepcion.email, CLAVE), `la recepción de ${negocio.slug} entra`);
    assert.equal(await entra(base, negocio.id, EMAIL_COMUN, "otra-clave-123"), false, "con otra clave no entra");
  }
  // El usuario común es dueño en cada negocio y no ve otro negocio: en A no aparece la fila de B.
  const roles = await conDuenio(base, (c) =>
    c.query<{ tenantId: string; role: string }>(`SELECT "tenantId", role::text AS role FROM "User" WHERE email = $1`, [EMAIL_COMUN]),
  );
  assert.equal(roles.rows.length, 2);
  assert.ok(roles.rows.every((r) => r.role === "OWNER"));

  // Correrlo otra vez no duplica al usuario común.
  await conDuenio(base, (c) =>
    restaurarAccesoComun(c, { email: EMAIL_COMUN, nombre: "GSG laboratorio", hashDeLaClave: hash, guardarRespaldo: () => {} }),
  );
  const otraVez = await conDuenio(base, (c) => c.query(`SELECT 1 FROM "User" WHERE email = $1`, [EMAIL_COMUN]));
  assert.equal(otraVez.rows.length, 2, "uno por negocio, no dos");
});

test("si no se puede guardar el respaldo, no cambia ninguna contraseña", async (t) => {
  const base = await baseEfimeraParaElTest(t);
  if (!base) return;
  const antes = await fotoDeUsuarios(base.urlDuenio);
  const hash = await hashPassword(CLAVE);
  await assert.rejects(
    conDuenio(base, (c) =>
      restaurarAccesoComun(c, {
        email: EMAIL_COMUN,
        nombre: "GSG laboratorio",
        hashDeLaClave: hash,
        guardarRespaldo: () => {
          throw new Error("disco lleno");
        },
      }),
    ),
    /disco lleno/,
  );
  assert.deepEqual(await fotoDeUsuarios(base.urlDuenio), antes);
});

test("el script deja el respaldo sólo legible por su dueño, no muestra la clave, y la reversa deja cada usuario exactamente como estaba", async (t) => {
  const base = await baseEfimeraParaElTest(t);
  if (!base) return;
  await conDuenio(base, (c) => c.query(`UPDATE "User" SET "deletedAt" = now() WHERE id = $1`, [base.b.recepcion.id]));
  const antes = await fotoDeUsuarios(base.urlDuenio);
  const carpeta = mkdtempSync(join(tmpdir(), "acceso-comun-"));
  t.after(() => rmSync(carpeta, { recursive: true, force: true }));
  const respaldo = join(carpeta, "respaldo.json");
  const credenciales = join(carpeta, "credenciales.md");

  const r = correrScript(["--respaldo", respaldo, "--credenciales", credenciales], {
    DATABASE_URL: base.urlDuenio,
    LAB_CLAVE_COMUN: CLAVE,
  });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(!`${r.stdout}${r.stderr}`.includes(CLAVE), "la clave no sale por pantalla");
  assert.match(r.stdout, new RegExp(base.a.slug));
  assert.equal(statSync(respaldo).mode & 0o777, 0o600, "respaldo con permisos 600");
  assert.ok(!readFileSync(respaldo, "utf8").includes(CLAVE), "el respaldo no guarda la clave en claro");
  assert.ok(await entra(base, base.a.id, EMAIL_COMUN, CLAVE));

  // El archivo de credenciales: sólo legible por su dueño, con el usuario común, la clave que
  // de verdad entra, cada negocio y cada usuario que quedó habilitado.
  assert.equal(statSync(credenciales).mode & 0o777, 0o600, "credenciales con permisos 600");
  const md = readFileSync(credenciales, "utf8");
  for (const esperado of [EMAIL_COMUN, CLAVE, base.a.slug, base.b.slug, base.a.duenia.email, base.b.recepcion.email]) {
    assert.ok(md.includes(esperado), `el archivo nombra ${esperado}`);
  }
  assert.match(md, /--revertir/, "dice cómo volver atrás");

  // Un segundo respaldo sobre el mismo archivo no lo pisa: el primero es el único que vuelve atrás.
  // Y como no se aplicó, tampoco deja un archivo de credenciales nuevo.
  const otroMd = join(carpeta, "credenciales-2.md");
  const pisar = correrScript(["--respaldo", respaldo, "--credenciales", otroMd], {
    DATABASE_URL: base.urlDuenio,
    LAB_CLAVE_COMUN: "Otra-clave-2026-lab",
  });
  assert.notEqual(pisar.status, 0, "no pisa un respaldo existente");
  assert.ok(!existsSync(otroMd), "sin cambio no hay credenciales nuevas");
  assert.ok(await entra(base, base.a.id, EMAIL_COMUN, CLAVE), "la clave aplicada sigue siendo la del archivo");

  // Si el archivo de credenciales ya existe, no cambia nada y no deja un respaldo a medias.
  const respaldo3 = join(carpeta, "respaldo-3.json");
  const mdExistente = correrScript(["--respaldo", respaldo3, "--credenciales", credenciales], {
    DATABASE_URL: base.urlDuenio,
    LAB_CLAVE_COMUN: "Otra-clave-2026-lab",
  });
  assert.notEqual(mdExistente.status, 0, "no pisa un archivo de credenciales existente");
  assert.ok(!existsSync(respaldo3), "no queda un respaldo de un cambio que no se hizo");
  assert.ok(await entra(base, base.a.id, EMAIL_COMUN, CLAVE));

  const rev = correrScript(["--revertir", respaldo], { DATABASE_URL: base.urlDuenio });
  assert.equal(rev.status, 0, rev.stderr);
  assert.deepEqual(await fotoDeUsuarios(base.urlDuenio), antes, "cada usuario como estaba, y el común creado ya no está");
  assert.equal(await entra(base, base.a.id, EMAIL_COMUN, CLAVE), false);
  assert.ok(existsSync(respaldo), "el respaldo queda para auditar");
});
