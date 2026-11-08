// node --test scripts/publicar/
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { analizarSql, limpiarComentarios } from "./lib/sql.mjs";

const reglas = (sql) => [...new Set(analizarSql(sql).bloqueos.map((b) => b.regla))].sort();
const bloquea = (sql) => analizarSql(sql).bloqueos.length > 0;

const RLS_LOOP = (tablas) => `
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[${tablas.map((x) => `'${x}'`).join(", ")}]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I '
      || 'USING ("tenantId" = current_setting(''app.current_tenant_id'', true)) '
      || 'WITH CHECK ("tenantId" = current_setting(''app.current_tenant_id'', true))',
      t
    );
  END LOOP;
END $$;`;

const RLS_SUELTO = (t) => `
ALTER TABLE "${t}" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "${t}";
CREATE POLICY tenant_isolation ON "${t}"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));`;

test("aditiva típica de Prisma: tabla nueva, índice, FK, columna con default → pasa", () => {
  const sql = `-- CreateTable
CREATE TABLE "Nueva" ("id" TEXT NOT NULL, "tenantId" TEXT NOT NULL, CONSTRAINT "Nueva_pkey" PRIMARY KEY ("id"));
CREATE INDEX "Nueva_tenantId_idx" ON "Nueva"("tenantId");
ALTER TABLE "Nueva" ADD CONSTRAINT "Nueva_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Client" ADD COLUMN "extra" BOOLEAN NOT NULL DEFAULT false;
CREATE TYPE "Estado" AS ENUM ('A', 'B');`;
  const r = analizarSql(sql);
  assert.deepEqual(r.bloqueos, []);
  assert.equal(r.avisos.length, 0, JSON.stringify(r.avisos));
});

test("las reglas del dueño frenan: DROP, ALTER TYPE (enum), DELETE, RENAME", () => {
  assert.deepEqual(reglas(`ALTER TABLE "A" DROP COLUMN "x";`), ["DROP"]);
  assert.deepEqual(reglas(`DROP TABLE "A";`), ["DROP"]);
  assert.deepEqual(reglas(`ALTER TYPE "Estado" ADD VALUE 'C';`), ["ALTER TYPE"]);
  assert.deepEqual(reglas(`DELETE FROM "A" WHERE true;`), ["DELETE"]);
  assert.deepEqual(reglas(`ALTER TABLE "A" RENAME COLUMN "x" TO "y";`), ["RENAME"]);
  assert.deepEqual(reglas(`ALTER TABLE "A" RENAME TO "B";`), ["RENAME"]);
  assert.deepEqual(reglas(`alter table "A" drop constraint "c";`), ["DROP"], "minúsculas");
});

test("otras no aditivas frenan: TRUNCATE, cambio de tipo, SET NOT NULL, RLS apagado, REVOKE, roles", () => {
  assert.deepEqual(reglas(`TRUNCATE "A";`), ["TRUNCATE"]);
  assert.deepEqual(reglas(`ALTER TABLE "A" ALTER COLUMN "x" TYPE DECIMAL(12,2);`), ["CAMBIO DE TIPO"]);
  assert.deepEqual(reglas(`ALTER TABLE "A" ALTER "x" SET DATA TYPE TEXT;`), ["CAMBIO DE TIPO"]);
  assert.deepEqual(reglas(`ALTER TABLE "A" ALTER COLUMN "x" SET NOT NULL;`), ["SET NOT NULL"]);
  assert.deepEqual(reglas(`ALTER TABLE "A" DISABLE ROW LEVEL SECURITY;`), ["RLS APAGADO"]);
  assert.deepEqual(reglas(`ALTER TABLE "A" NO FORCE ROW LEVEL SECURITY;`), ["RLS APAGADO"]);
  assert.deepEqual(reglas(`REVOKE ALL ON "A" FROM app_rls;`), ["REVOKE"]);
  assert.deepEqual(reglas(`ALTER ROLE app_rls WITH PASSWORD 'x';`), ["ROLES"]);
  assert.deepEqual(reglas(`SET ROLE neondb_owner;`), ["CAMBIO DE ROL"]);
  assert.deepEqual(reglas(`CREATE OR REPLACE FUNCTION f() RETURNS int AS $$ SELECT 1 $$ LANGUAGE sql;`), ["CREATE OR REPLACE"]);
});

test("ON DELETE / ON UPDATE de una FK y triggers BEFORE DELETE no son borrado de datos", () => {
  const sql = `CREATE TABLE "B" ("id" TEXT);
ALTER TABLE "B" ADD CONSTRAINT "f" FOREIGN KEY ("id") REFERENCES "A"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE TRIGGER "t" BEFORE INSERT OR UPDATE OR DELETE ON "B" FOR EACH ROW EXECUTE FUNCTION g();`;
  assert.deepEqual(analizarSql(sql).bloqueos, []);
});

test("comentarios no frenan, pero un DROP escondido después de un string con -- adentro sí", () => {
  assert.equal(bloquea(`-- acá antes se hacía DROP TABLE\n/* DROP /* anidado */ COLUMN */\nCREATE TABLE "A" ("id" TEXT);`), false);
  assert.equal(bloquea(`SELECT '--'; DROP TABLE "A";`), true);
  assert.equal(bloquea(`SELECT 'it''s -- not a comment'; DROP TABLE "A";`), true);
  assert.equal(bloquea(`SELECT E'\\' -- '; DROP TABLE "A";`), true, "E-string con \\'");
  assert.equal(bloquea(`SELECT "col--x" FROM t; DROP TABLE "A";`), true, "-- dentro de un identificador");
  assert.equal(bloquea(`SELECT $x$ -- $x$; DROP TABLE "A";`), true, "-- dentro de $x$");
});

test("un DROP dentro de un string ejecutado (EXECUTE) frena", () => {
  assert.ok(reglas(`DO $$ BEGIN EXECUTE 'DROP TABLE "A"'; END $$;`).includes("DROP"));
  // Concatenado para esquivar la palabra: igual frena por SQL dinámico.
  assert.ok(reglas(`DO $$ BEGIN EXECUTE 'DR' || 'OP TABLE "A"'; END $$;`).includes("SQL DINÁMICO"));
  assert.ok(reglas(`DO $$ BEGIN EXECUTE format('%s TABLE "A"', 'DR'||'OP'); END $$;`).includes("SQL DINÁMICO"));
  assert.ok(reglas(`DO $$ BEGIN EXECUTE chr(68)||'ROP TABLE x'; END $$;`).includes("SQL OFUSCADO / FUERA DE BANDA"));
  assert.ok(reglas(`SELECT U&'\\0044ROP';`).includes("SQL OFUSCADO / FUERA DE BANDA"));
});

test("SQL ilegible (string o comentario sin cerrar) frena", () => {
  assert.deepEqual(reglas(`CREATE TABLE "A" ('x);`), ["ILEGIBLE"]);
  assert.deepEqual(reglas(`/* sin cerrar`), ["ILEGIBLE"]);
  assert.deepEqual(reglas(`DO $$ BEGIN`), ["ILEGIBLE"]);
});

test("idioma RLS en loop sobre tablas NUEVAS → pasa (y se informa)", () => {
  const sql = `CREATE TABLE "PadelClub" ("id" TEXT);\nCREATE TABLE "PadelSerie" ("id" TEXT);\n${RLS_LOOP(["PadelClub", "PadelSerie"])}`;
  const r = analizarSql(sql);
  assert.deepEqual(r.bloqueos, []);
  assert.deepEqual(r.rlsNuevas.sort(), ["PadelClub", "PadelSerie"]);
});

test("idioma RLS en loop que incluye una tabla EXISTENTE → frena", () => {
  const sql = `CREATE TABLE "PadelClub" ("id" TEXT);\n${RLS_LOOP(["PadelClub", "Tenant"])}`;
  assert.ok(bloquea(sql));
  assert.ok(reglas(sql).includes("SQL DINÁMICO"));
});

test("idioma RLS: mayúsculas de identificador importan (\"tenant\" ≠ \"Tenant\")", () => {
  const sql = `CREATE TABLE "tenant" ("id" TEXT);\n${RLS_SUELTO("Tenant")}`;
  assert.ok(bloquea(sql));
});

test("idioma RLS suelto sobre tabla nueva → pasa; sobre tabla existente → frena", () => {
  assert.deepEqual(analizarSql(`CREATE TABLE "Voucher" ("id" TEXT);${RLS_SUELTO("Voucher")}`).bloqueos, []);
  const r = reglas(RLS_SUELTO("Client"));
  assert.ok(r.includes("DROP"));
  assert.ok(r.includes("RLS EN TABLA EXISTENTE"));
  assert.ok(r.includes("POLÍTICA EN TABLA EXISTENTE"));
});

test("DROP POLICY sin recrear la política → frena aunque la tabla sea nueva", () => {
  const sql = `CREATE TABLE "N" ("id" TEXT);\nDROP POLICY IF EXISTS tenant_isolation ON "N";`;
  assert.deepEqual(reglas(sql), ["DROP"]);
});

test("política con predicado distinto al del tenant (p. ej. USING (true)) → no es el idioma, frena", () => {
  const sql = `CREATE TABLE "N" ("id" TEXT);
DROP POLICY IF EXISTS tenant_isolation ON "N";
CREATE POLICY tenant_isolation ON "N" USING (true) WITH CHECK (true);`;
  assert.ok(reglas(sql).includes("DROP"));
});

test("CREATE TABLE dentro de un string no cuenta como tabla nueva", () => {
  const sql = `SELECT 'x; CREATE TABLE "Client"';\n${RLS_SUELTO("Client")}`;
  assert.ok(bloquea(sql));
});

test("loop RLS con un FOREACH extra que reutiliza la variable con una tabla existente → frena", () => {
  const sql = `CREATE TABLE "N" ("id" TEXT);
${RLS_LOOP(["N"])}
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['Client'] LOOP NULL; END LOOP; END $$;`;
  assert.ok(bloquea(sql));
});

test("avisos (no frenan): UPDATE de backfill, índice único y NOT NULL sin default en tabla existente", () => {
  const r = analizarSql(`ALTER TABLE "Client" ADD COLUMN "n" INTEGER;
UPDATE "Client" SET "n" = 0;
CREATE UNIQUE INDEX "u" ON "Client"("n");
ALTER TABLE "Order" ADD COLUMN "z" TEXT NOT NULL;`);
  assert.deepEqual(r.bloqueos, []);
  const a = r.avisos.map((x) => x.regla).sort();
  assert.deepEqual(a, ["NOT NULL SIN DEFAULT", "UPDATE", "ÚNICO EN TABLA EXISTENTE"]);
});

test("limpiarComentarios conserva largo y líneas", () => {
  const sql = "A -- x\n/* y\n z */B 'c -- d'";
  const { texto, error } = limpiarComentarios(sql);
  assert.equal(error, null);
  assert.equal(texto.length, sql.length);
  assert.equal(texto.split("\n").length, sql.split("\n").length);
  assert.ok(texto.includes("'c -- d'"));
  assert.ok(!texto.includes("x"));
});

test("los hallazgos traen la línea real", () => {
  const r = analizarSql(`-- uno\nCREATE TABLE "A" ("id" TEXT);\n\nDROP TABLE "B";`);
  assert.equal(r.bloqueos[0].linea, 4);
});

// Calibración contra el historial real del repo: las migraciones aditivas recientes pasan y las
// que de verdad no eran aditivas frenan.
const DIR = new URL("../../prisma/migrations/", import.meta.url).pathname;
test("historial real: aditivas pasan, no aditivas frenan", { skip: !existsSync(DIR) }, () => {
  const pasan = [
    "20261008120000_modulo_taller",
    "20261013120000_modulo_inmobiliaria",
    "20261105122000_vouchers",
    "20261106120000_support_ticket",
    "20261108120000_profeturnos_clubes_serie_grupal",
    "20260815120000_lead_campania",
  ];
  const frenan = {
    "20261030120000_m1_enums_caja": "ALTER TYPE",
    "20260708120000_invoice_money_decimal": "CAMBIO DE TIPO",
    "20260710120000_invoice_origin_idempotency_unique": "DROP",
  };
  const hay = new Set(readdirSync(DIR));
  for (const m of pasan) {
    if (!hay.has(m)) continue;
    const r = analizarSql(readFileSync(`${DIR}${m}/migration.sql`, "utf8"));
    assert.deepEqual(r.bloqueos, [], `${m}: ${JSON.stringify(r.bloqueos)}`);
  }
  for (const [m, regla] of Object.entries(frenan)) {
    if (!hay.has(m)) continue;
    assert.ok(reglas(readFileSync(`${DIR}${m}/migration.sql`, "utf8")).includes(regla), m);
  }
});
