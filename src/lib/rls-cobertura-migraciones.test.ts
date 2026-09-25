// R0-F1 · RLS viaja con la migración. Desde 20260925120000_lanzamiento_base, toda migración que
// crea una tabla con "tenantId" tiene que prenderle RLS y crearle la política `tenant_isolation`
// ella misma; `prisma/rls/check-coverage.mjs` (la valla "RLS estático" de verify y de CI) lo exige.
//
// Estos tests CORREN la valla real (el mismo archivo, como proceso) sobre el repo y sobre carpetas
// de migraciones armadas a propósito: una tabla de negocio sin RLS la hace fallar; el bucle de la
// migración de lanzamiento con una tabla de menos, también.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const RAIZ = process.cwd();
const VALLA = path.join(RAIZ, "prisma", "rls", "check-coverage.mjs");
const SCHEMA = path.join(RAIZ, "prisma", "schema.prisma");
const LANZAMIENTO = path.join(RAIZ, "prisma", "migrations", "20260925120000_lanzamiento_base", "migration.sql");

function correrValla(migraciones?: string): { codigo: number; salida: string } {
  const env: NodeJS.ProcessEnv = { ...process.env, RLS_SCHEMA_PATH: SCHEMA };
  if (migraciones) env.RLS_MIGRATIONS_DIR = migraciones;
  else delete env.RLS_MIGRATIONS_DIR;
  const r = spawnSync(process.execPath, [VALLA], { env, encoding: "utf8" });
  return { codigo: r.status ?? 1, salida: `${r.stdout}\n${r.stderr}` };
}

/** Una carpeta de migraciones de mentira: { "20260930120000_x": "<sql>" }. Se borra al terminar. */
function carpeta(t: { after: (fn: () => void) => void }, migraciones: Record<string, string>): string {
  const dir = mkdtempSync(path.join(tmpdir(), "rls-cobertura-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  for (const [nombre, sql] of Object.entries(migraciones)) {
    mkdirSync(path.join(dir, nombre));
    writeFileSync(path.join(dir, nombre, "migration.sql"), sql);
  }
  return dir;
}

const TABLA_DE_NEGOCIO = `CREATE TABLE "Cosa" (\n    "id" TEXT NOT NULL,\n    "tenantId" TEXT NOT NULL,\n    CONSTRAINT "Cosa_pkey" PRIMARY KEY ("id")\n);`;
const TABLA_SIN_NEGOCIO = `CREATE TABLE "Catalogo" (\n    "id" TEXT NOT NULL,\n    CONSTRAINT "Catalogo_pkey" PRIMARY KEY ("id")\n);`;
const RLS_LITERAL =
  `ALTER TABLE "Cosa" ENABLE ROW LEVEL SECURITY;\n` +
  `CREATE POLICY tenant_isolation ON "Cosa" USING ("tenantId" = current_setting('app.current_tenant_id', true)) ` +
  `WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));`;

test("el repo pasa la valla: las tablas de la migración de lanzamiento nacen con RLS", () => {
  const { codigo, salida } = correrValla();
  assert.equal(codigo, 0, salida);
  assert.match(salida, /revisadas \(RLS adentro de la migración\): [1-9]/);
  assert.match(salida, /ninguna tabla nueva nace sin RLS/);
});

test("una migración nueva que crea una tabla con tenantId sin RLS hace fallar la valla y la nombra", (t) => {
  const dir = carpeta(t, { "20260930120000_cosa": TABLA_DE_NEGOCIO });
  const { codigo, salida } = correrValla(dir);
  assert.equal(codigo, 1, salida);
  assert.match(salida, /20260930120000_cosa: Cosa/);
});

test("prender RLS sin la política (o la política sin RLS) no alcanza", (t) => {
  const soloRls = carpeta(t, { "20260930120000_cosa": `${TABLA_DE_NEGOCIO}\nALTER TABLE "Cosa" ENABLE ROW LEVEL SECURITY;` });
  assert.equal(correrValla(soloRls).codigo, 1);
  const soloPolitica = carpeta(t, {
    "20260930120000_cosa": `${TABLA_DE_NEGOCIO}\nCREATE POLICY tenant_isolation ON "Cosa" USING (true);`,
  });
  assert.equal(correrValla(soloPolitica).codigo, 1);
});

test("con RLS y política en la misma migración pasa; una tabla sin tenantId no pide RLS", (t) => {
  const dir = carpeta(t, { "20260930120000_cosa": `${TABLA_DE_NEGOCIO}\n${TABLA_SIN_NEGOCIO}\n${RLS_LITERAL}` });
  const { codigo, salida } = correrValla(dir);
  assert.equal(codigo, 0, salida);
});

test("las migraciones anteriores al corte no se exigen: las cubre 0001, como siempre", (t) => {
  const dir = carpeta(t, { "20260911120000_vieja": TABLA_DE_NEGOCIO });
  const { codigo, salida } = correrValla(dir);
  assert.equal(codigo, 0, salida);
  assert.match(salida, /revisadas \(RLS adentro de la migración\): 0/);
});

test("la migración de lanzamiento con una tabla de menos en su bucle de RLS hace fallar la valla", (t) => {
  const real = readFileSync(LANZAMIENTO, "utf8");
  assert.match(real, /'EnvioComprobante', 'ArcaAuthTicket'/, "el bucle de RLS nombra las tablas nuevas");
  const mutada = real.replace("'EnvioComprobante', 'ArcaAuthTicket'", "'ArcaAuthTicket'");
  const dir = carpeta(t, { "20260925120000_lanzamiento_base": mutada });
  const { codigo, salida } = correrValla(dir);
  assert.equal(codigo, 1, salida);
  assert.match(salida, /20260925120000_lanzamiento_base: EnvioComprobante/);
  // Y la original, sola, pasa: son 13 tablas y las 13 están en el bucle.
  const original = carpeta(t, { "20260925120000_lanzamiento_base": real });
  assert.equal(correrValla(original).codigo, 0);
  assert.equal((real.match(/^CREATE TABLE "/gm) ?? []).length, 13);
});
