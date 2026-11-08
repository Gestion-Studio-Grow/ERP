// node --test scripts/publicar/
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { analizarSql, limpiarComentarios } from "./lib/sql.mjs";

const reglas = (sql) => [...new Set(analizarSql(sql).bloqueos.map((b) => b.regla))].sort();
const bloquea = (sql) => analizarSql(sql).bloqueos.length > 0;
const frenaCon = (sql, regla) => assert.ok(reglas(sql).includes(regla), `${regla} ∉ ${reglas(sql)} — ${sql}`);
const pasa = (sql) => assert.deepEqual(analizarSql(sql).bloqueos, [], sql);

const PRED = `("tenantId" = current_setting('app.current_tenant_id', true))`;
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
  USING ${PRED}
  WITH CHECK ${PRED};`;

// ── Lo que pasa solo ────────────────────────────────────────────────────────
test("aditiva típica de Prisma: tabla nueva, índice, FK sobre la tabla nueva, columna con default → pasa", () => {
  const sql = `-- CreateTable
CREATE TABLE "Nueva" ("id" TEXT NOT NULL, "tenantId" TEXT NOT NULL, "creado" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "tags" TEXT[] DEFAULT ARRAY[]::TEXT[], "monto" DECIMAL(12,2), "estado" "Estado" NOT NULL DEFAULT 'A', "n" INTEGER DEFAULT -1,
  CONSTRAINT "Nueva_pkey" PRIMARY KEY ("id"));
CREATE INDEX "Nueva_tenantId_idx" ON "Nueva"("tenantId");
CREATE UNIQUE INDEX "Nueva_n_key" ON "Nueva"("tenantId", "n" DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Client_x_idx" ON "Client" USING GIN ("tags") WHERE "tags" IS NOT NULL;
ALTER TABLE "Nueva" ADD CONSTRAINT "Nueva_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Nueva" ADD CONSTRAINT "Nueva_n_check" CHECK ("n" IS NULL OR ("n" >= 0 AND "estado" IN ('A', 'B')));
ALTER TABLE "Client" ADD COLUMN "extra" BOOLEAN NOT NULL DEFAULT false, ADD COLUMN "nota" TEXT, ADD COLUMN "uid" TEXT DEFAULT gen_random_uuid();
CREATE TYPE "Estado2" AS ENUM ('A', 'B');
ALTER TYPE "Estado" ADD VALUE IF NOT EXISTS 'C' AFTER 'B';`;
  const r = analizarSql(sql);
  assert.deepEqual(r.bloqueos, []);
  assert.deepEqual(r.avisos, []);
});

test("RLS por tenant sobre tabla nueva (molde suelto) → pasa y se informa", () => {
  const r = analizarSql(`CREATE TABLE "Voucher" ("id" TEXT, "tenantId" TEXT);${RLS_SUELTO("Voucher")}\nALTER TABLE "Voucher" FORCE ROW LEVEL SECURITY;`);
  assert.deepEqual(r.bloqueos, []);
  assert.deepEqual(r.rlsNuevas, ["Voucher"]);
});

test("cert2: los controles legítimos siguen pasando (enum nuevo, RLS ok, DEFAULT literal)", () => {
  pasa(`CREATE TYPE "E" AS ENUM ('a','b');`);
  pasa(`CREATE TABLE "N" (id int, "tenantId" text);\nALTER TABLE "N" ENABLE ROW LEVEL SECURITY;\nALTER TABLE "N" FORCE ROW LEVEL SECURITY;\nCREATE POLICY p ON "N" USING ${PRED} WITH CHECK ${PRED};`);
  pasa(`ALTER TABLE "Venta" ADD COLUMN "x" text DEFAULT 'a';`);
});

// ── Reglas del dueño ────────────────────────────────────────────────────────
test("las reglas del dueño frenan: DROP, enum cambiado, DELETE, RENAME", () => {
  assert.deepEqual(reglas(`ALTER TABLE "A" DROP COLUMN "x";`), ["DROP"]);
  assert.deepEqual(reglas(`DROP TABLE "A";`), ["DROP"]);
  frenaCon(`ALTER TYPE "Estado" RENAME VALUE 'A' TO 'B';`, "ALTER TYPE");
  frenaCon(`DELETE FROM "A" WHERE true;`, "DELETE");
  frenaCon(`ALTER TABLE "A" RENAME COLUMN "x" TO "y";`, "RENAME");
  frenaCon(`ALTER TABLE "A" RENAME TO "B";`, "RENAME");
  frenaCon(`alter table "A" drop constraint "c";`, "DROP");
});

test("otras no aditivas frenan: TRUNCATE, cambio de tipo, SET NOT NULL, RLS apagado, REVOKE, roles", () => {
  frenaCon(`TRUNCATE "A";`, "TRUNCATE");
  frenaCon(`ALTER TABLE "A" ALTER COLUMN "x" TYPE DECIMAL(12,2);`, "CAMBIO DE TIPO");
  frenaCon(`ALTER TABLE "A" ALTER "x" SET DATA TYPE TEXT;`, "CAMBIO DE TIPO");
  frenaCon(`ALTER TABLE "A" ALTER COLUMN "x" SET NOT NULL;`, "SET NOT NULL");
  frenaCon(`ALTER TABLE "A" DISABLE ROW LEVEL SECURITY;`, "RLS APAGADO");
  frenaCon(`ALTER TABLE "A" NO FORCE ROW LEVEL SECURITY;`, "RLS APAGADO");
  frenaCon(`REVOKE ALL ON "A" FROM app_rls;`, "REVOKE");
  frenaCon(`ALTER ROLE app_rls WITH PASSWORD 'x';`, "ROLES");
  frenaCon(`SET ROLE neondb_owner;`, "CAMBIO DE ROL");
  frenaCon(`CREATE OR REPLACE FUNCTION f() RETURNS int AS $$ SELECT 1 $$ LANGUAGE sql;`, "CREATE OR REPLACE");
});

test("cada freno dice REQUIERE REVISIÓN DEL DUEÑO y trae la línea real", () => {
  const r = analizarSql(`-- uno\nCREATE TABLE "A" ("id" TEXT);\n\nDROP TABLE "B";`);
  assert.equal(r.bloqueos[0].linea, 4);
  assert.match(r.bloqueos[0].motivo, /REQUIERE REVISIÓN DEL DUEÑO/);
  assert.deepEqual(reglas(`LOCK TABLE "Venta";`), ["REQUIERE REVISIÓN DEL DUEÑO"]);
});

// ── Falla cerrada: lo que antes pasaba (con o sin aviso) y ahora frena ─────
test("INSERT/UPDATE/DELETE/COPY frenan siempre, también sobre tablas nuevas", () => {
  const N = `CREATE TABLE "N" ("id" TEXT, "tenantId" TEXT);\n`;
  frenaCon(N + `INSERT INTO "N" ("id") VALUES ('a');`, "ESCRIBE DATOS");
  frenaCon(`INSERT INTO "Venta" (id) VALUES ('a') ON CONFLICT DO NOTHING;`, "ESCRIBE DATOS");
  frenaCon(`ALTER TABLE "InmoPago" ADD COLUMN "numero" INTEGER;\nUPDATE "InmoPago" SET "numero" = 1 WHERE "numero" IS NULL;`, "ESCRIBE DATOS");
  frenaCon(N + `UPDATE "N" SET "id" = 'x';`, "ESCRIBE DATOS");
  frenaCon(`UPDATE"Venta"SET "monto" = 0;`, "ESCRIBE DATOS");
  frenaCon(`WITH x AS (UPDATE"Venta"SET monto = 0 RETURNING 1) SELECT 1;`, "ESCRIBE DATOS");
  frenaCon(N + `DELETE FROM "N";`, "DELETE");
  frenaCon(`COPY "Venta" TO STDOUT;`, "ESCRIBE DATOS");
  frenaCon(`MERGE INTO "Client" c USING x ON true WHEN MATCHED THEN DELETE;`, "MERGE");
});

test("CREATE TRIGGER y CREATE RULE frenan siempre (también sobre tablas nuevas)", () => {
  const N = `CREATE TABLE "B" ("id" TEXT);\n`;
  frenaCon(N + `CREATE TRIGGER "t" BEFORE INSERT OR UPDATE OR DELETE ON "B" FOR EACH ROW EXECUTE FUNCTION g();`, "TRIGGER");
  frenaCon(N + `CREATE CONSTRAINT TRIGGER "t" AFTER INSERT ON "B" FOR EACH ROW EXECUTE FUNCTION g();`, "TRIGGER");
  frenaCon(`CREATE TRIGGER t BEFORE INSERT ON"Venta" FOR EACH ROW EXECUTE FUNCTION g();`, "TRIGGER");
  frenaCon(`CREATE RULE r AS ON INSERT TO "Order" DO INSTEAD NOTHING;`, "RULE");
  frenaCon(N + `CREATE RULE r AS ON INSERT TO "B" DO INSTEAD NOTHING;`, "RULE");
});

test("restricciones, únicos, SET DEFAULT y políticas sobre tablas EXISTENTES frenan", () => {
  frenaCon(`ALTER TABLE "Venta" ADD CONSTRAINT c CHECK ("x" > 0) NOT VALID;`, "RESTRICCIÓN EN TABLA EXISTENTE");
  frenaCon(`ALTER TABLE "Venta" ADD CONSTRAINT f FOREIGN KEY ("a") REFERENCES "T"("id") NOT VALID;`, "RESTRICCIÓN EN TABLA EXISTENTE");
  frenaCon(`ALTER TABLE "Venta" ADD COLUMN "n" TEXT REFERENCES "N"("id");`, "RESTRICCIÓN EN TABLA EXISTENTE");
  frenaCon(`ALTER TABLE "Usuario" ALTER COLUMN "rol" SET DEFAULT 'ADMIN';`, "DEFAULT CAMBIADO");
  frenaCon(`ALTER TABLE "Venta" ALTER COLUMN "tenantId" SET DEFAULT 't1';`, "DEFAULT EN tenantId");
  frenaCon(RLS_SUELTO("Client"), "RLS EN TABLA EXISTENTE");
  frenaCon(RLS_SUELTO("Client"), "DROP");
  frenaCon(RLS_SUELTO("Client"), "POLÍTICA EN TABLA EXISTENTE");
  frenaCon(`CREATE POLICY "p"ON"Venta" USING (true);`, "POLÍTICA EN TABLA EXISTENTE");
  // una FK que se agrega ANTES de crear la tabla no cuenta como tabla nueva
  frenaCon(`ALTER TABLE "N" ADD CONSTRAINT f FOREIGN KEY ("a") REFERENCES "X"("id");\nCREATE TABLE "N" ("a" TEXT);`, "RESTRICCIÓN EN TABLA EXISTENTE");
});

test("FK y UNIQUE sobre tablas existentes: pasan sólo en la forma permitida", () => {
  const COL = `ALTER TABLE "Venta" ADD COLUMN "pagoId" TEXT;\n`;
  const FK = `ALTER TABLE "Venta" ADD CONSTRAINT "Venta_pagoId_fkey" FOREIGN KEY ("pagoId") REFERENCES "Pago"("id")`;
  pasa(COL + FK + ";");
  pasa(COL + FK + " ON DELETE RESTRICT ON UPDATE CASCADE;");
  pasa(COL + FK + " ON DELETE RESTRICT ON UPDATE NO ACTION NOT VALID;");
  pasa(`ALTER TABLE "Venta" ADD COLUMN "pagoId" TEXT, ADD CONSTRAINT f FOREIGN KEY ("pagoId", "tenantId") REFERENCES "Pago"("id", "tenantId") ON DELETE NO ACTION;`);
  pasa(COL + `ALTER TABLE "Venta" ADD CONSTRAINT "Venta_a_key" UNIQUE ("tenantId", "pagoId");`);
  pasa(`ALTER TABLE "Client" ADD COLUMN "n" VARCHAR(20);\nCREATE UNIQUE INDEX "u" ON "Client"("tenantId", "n");`);
  pasa(`ALTER TABLE "Client" ADD COLUMN "n" NUMERIC(12,2);\nCREATE UNIQUE INDEX "u" ON "Client"("n") WHERE "n" IS NOT NULL;`);
  // tipos de la lista blanca y enum creado en la misma migración → columna vacía
  for (const tipo of ["INTEGER", "BIGINT", "BOOLEAN", "TIMESTAMP(3)", "TIMESTAMPTZ", "TIMESTAMP(3) WITH TIME ZONE", "UUID", "JSONB", "character varying(40)", "DECIMAL(10,2)"])
    pasa(`ALTER TABLE "Venta" ADD COLUMN "pagoId" ${tipo};\n${FK};`);
  pasa(`CREATE TYPE "Est" AS ENUM ('A');\nALTER TABLE "Venta" ADD COLUMN "pagoId" "Est";\n${FK};`);
  // FK con cuerpo raro → frena
  const raro = (cola) => assert.ok(bloquea(COL + FK + cola), cola);
  for (const cola of [" MATCH FULL;", " DEFERRABLE INITIALLY DEFERRED;", " ON DELETE SET DEFAULT;", " ON DELETE SET NULL (\"pagoId\");",
    " NOT VALID ON DELETE CASCADE;", " ON DELETE CASCADE, ALTER COLUMN \"x\" TYPE int;", " NOT DEFERRABLE;", ", INHERIT \"Otra\";"]) raro(cola);
  assert.ok(bloquea(COL + `ALTER TABLE "Venta" ADD CONSTRAINT f FOREIGN KEY ("pagoId") REFERENCES otro."Pago"("id");`));
  assert.ok(bloquea(COL + `ALTER TABLE "Venta" ADD CONSTRAINT f FOREIGN KEY ("pagoId") REFERENCES "Pago";`));
  assert.ok(bloquea(COL + `ALTER TABLE "Venta" ADD FOREIGN KEY ("pagoId") REFERENCES "Pago"("id");`));
  // FK sólo sobre columnas que ya tienen datos, o sobre una columna nueva con default / IF NOT EXISTS → frena
  frenaCon(FK.replace(/"pagoId"\)/, '"tenantId")') + ";", "RESTRICCIÓN EN TABLA EXISTENTE");
  frenaCon(`ALTER TABLE "Venta" ADD COLUMN "pagoId" TEXT DEFAULT 'p1';\n${FK};`, "RESTRICCIÓN EN TABLA EXISTENTE");
  frenaCon(`ALTER TABLE "Venta" ADD COLUMN IF NOT EXISTS "pagoId" TEXT;\n${FK};`, "RESTRICCIÓN EN TABLA EXISTENTE");
  frenaCon(`ALTER TABLE "Otra" ADD COLUMN "pagoId" TEXT;\n${FK};`, "RESTRICCIÓN EN TABLA EXISTENTE");
  // cert3: tipos que se rellenan solos (serial, identity…) o fuera de la lista blanca no cuentan como vacía
  for (const tipo of ["serial", "bigserial", "smallserial", "serial4", "serial8", "serial2", '"serial"', '"bigserial"', "INT[]", "TEXT[]",
    "public.text", '"text"', '"Est"', "citext", "dominio", "money", "pg_catalog.int4", "INTEGER GENERATED ALWAYS AS IDENTITY",
    "TEXT GENERATED ALWAYS AS ('x') STORED", "TEXT COLLATE \"C\""])
    assert.ok(bloquea(`ALTER TABLE "Venta" ADD COLUMN "pagoId" ${tipo};\n${FK};`), tipo);
  frenaCon(`CREATE TYPE serial AS ENUM ('A');\nALTER TABLE "Venta" ADD COLUMN "pagoId" serial;\n${FK};`, "RESTRICCIÓN EN TABLA EXISTENTE");
  frenaCon(`ALTER TABLE "Venta" ADD COLUMN "x" serial;\nALTER TABLE "Venta" ADD CONSTRAINT f FOREIGN KEY ("x") REFERENCES "Cliente"("numero") ON DELETE CASCADE NOT VALID;`, "RESTRICCIÓN EN TABLA EXISTENTE");
  frenaCon(`ALTER TABLE "Venta" ADD COLUMN "x" bigserial;\nALTER TABLE "Venta" ADD CONSTRAINT f FOREIGN KEY ("x") REFERENCES "Cliente"("numero");`, "RESTRICCIÓN EN TABLA EXISTENTE");
  frenaCon(`ALTER TABLE "Venta" ADD COLUMN "x" serial;\nCREATE UNIQUE INDEX u ON "Venta" ("x");`, "ÚNICO EN TABLA EXISTENTE");
  // cert3: ON DELETE CASCADE / SET DEFAULT sobre tabla existente → frena aunque la columna sea nueva y vacía
  for (const cola of [" ON DELETE CASCADE;", " ON UPDATE CASCADE ON DELETE CASCADE;", " ON DELETE SET DEFAULT;", " ON UPDATE SET NULL;",
    " ON UPDATE SET DEFAULT;", " ON DELETE CASCADE NOT VALID;", " ON DELETE SET NULL ON DELETE CASCADE;", " ON DELETE SET NULL (\"pagoId\");"])
    assert.ok(bloquea(COL + FK + cola), cola);
  // ON DELETE SET NULL pasa sólo si TODAS las columnas de la FK son nuevas y vacías (anula sólo la columna nueva)
  pasa(COL + FK + " ON DELETE SET NULL;");
  pasa(COL + FK + " ON DELETE SET NULL ON UPDATE CASCADE;");
  pasa(COL + FK + " ON UPDATE CASCADE ON DELETE SET NULL NOT VALID;");
  pasa(`ALTER TABLE "Venta" ADD COLUMN "a" TEXT, ADD COLUMN "b" UUID;\nALTER TABLE "Venta" ADD CONSTRAINT f FOREIGN KEY ("a","b") REFERENCES "Pago"("id","x") ON DELETE SET NULL;`);
  // SET NULL con una columna existente en la FK → anularía un dato previo → frena
  frenaCon(COL + `ALTER TABLE "Venta" ADD CONSTRAINT f FOREIGN KEY ("pagoId","tenantId") REFERENCES "Pago"("id","tenantId") ON DELETE SET NULL;`, "RESTRICCIÓN EN TABLA EXISTENTE");
  frenaCon(COL + `ALTER TABLE "Venta" ADD CONSTRAINT f FOREIGN KEY ("tenantId","pagoId") REFERENCES "Pago"("tenantId","id") ON DELETE SET NULL ON UPDATE CASCADE;`, "RESTRICCIÓN EN TABLA EXISTENTE");
  // SET NULL con columna nueva con DEFAULT (o mezclada con una vacía) → frena
  frenaCon(`ALTER TABLE "Venta" ADD COLUMN "pagoId" TEXT DEFAULT 'p1';\n${FK} ON DELETE SET NULL;`, "RESTRICCIÓN EN TABLA EXISTENTE");
  frenaCon(`ALTER TABLE "Venta" ADD COLUMN "a" TEXT, ADD COLUMN "b" TEXT DEFAULT 'x';\nALTER TABLE "Venta" ADD CONSTRAINT f FOREIGN KEY ("a","b") REFERENCES "Pago"("id","x") ON DELETE SET NULL;`, "RESTRICCIÓN EN TABLA EXISTENTE");
  frenaCon(`ALTER TABLE "Venta" ADD COLUMN "pagoId" serial;\n${FK} ON DELETE SET NULL;`, "RESTRICCIÓN EN TABLA EXISTENTE");
  frenaCon(COL + FK + " ON DELETE CASCADE;", "RESTRICCIÓN EN TABLA EXISTENTE");
  frenaCon(`ALTER TABLE "Venta" ADD COLUMN "x" text;\nALTER TABLE "Venta" ADD CONSTRAINT f FOREIGN KEY ("x","clienteId") REFERENCES "Cliente"("id","tenantId") ON DELETE SET NULL;`, "RESTRICCIÓN EN TABLA EXISTENTE");
  frenaCon(`CREATE TABLE "Nueva" ("id" text PRIMARY KEY, "tenantId" text NOT NULL);\nALTER TABLE "Venta" ADD COLUMN "x" text;\nALTER TABLE "Venta" ADD CONSTRAINT f FOREIGN KEY ("x") REFERENCES "Nueva"("id") ON DELETE CASCADE;`, "RESTRICCIÓN EN TABLA EXISTENTE");
  // en una tabla NUEVA el CASCADE sigue pasando
  pasa(`CREATE TABLE "N" ("id" TEXT, "v" TEXT, CONSTRAINT f FOREIGN KEY ("v") REFERENCES "Venta"("id") ON DELETE CASCADE);`);
  // cert3: UNIQUE / UNIQUE INDEX sobre columnas existentes sin columna nueva vacía → frena
  for (const sql of [
    `ALTER TABLE "Cliente" ADD CONSTRAINT u UNIQUE ("email");`,
    `ALTER TABLE "Venta" ADD CONSTRAINT u UNIQUE ("tenantId");`,
    `CREATE UNIQUE INDEX u ON "Venta" ("tenantId");`,
    `CREATE UNIQUE INDEX u ON "Venta" ("tenantId") WHERE "total" > 0;`,
    `CREATE UNIQUE INDEX CONCURRENTLY u ON "Venta" ("tenantId");`,
    `CREATE UNIQUE INDEX u ON "Venta" ("tenantId") INCLUDE ("x");`,
    `ALTER TABLE "Venta" ADD COLUMN "x" TEXT DEFAULT 'a';\nCREATE UNIQUE INDEX u ON "Venta" ("tenantId", "x");`,
    `ALTER TABLE "Venta" ADD COLUMN IF NOT EXISTS "x" TEXT;\nALTER TABLE "Venta" ADD CONSTRAINT u UNIQUE ("tenantId", "x");`,
    `ALTER TABLE "Otra" ADD COLUMN "x" TEXT;\nCREATE UNIQUE INDEX u ON "Venta" ("tenantId", "x");`,
  ]) frenaCon(sql, "ÚNICO EN TABLA EXISTENTE");
  // índice NO único sobre existente sigue pasando
  pasa(`CREATE INDEX i ON "Venta" ("tenantId");`);
  // UNIQUE raro, CHECK, PK, EXCLUDE sobre existente → frena
  assert.ok(bloquea(`ALTER TABLE "Venta" ADD CONSTRAINT u UNIQUE NULLS NOT DISTINCT ("a");`));
  assert.ok(bloquea(`ALTER TABLE "Venta" ADD CONSTRAINT u UNIQUE ("a") DEFERRABLE;`));
  assert.ok(bloquea(`ALTER TABLE "Venta" ADD UNIQUE ("a");`));
  frenaCon(`CREATE UNIQUE INDEX "u" ON "Client"("n") NULLS NOT DISTINCT;`, "ÚNICO EN TABLA EXISTENTE");
  frenaCon(`ALTER TABLE "Venta" ADD CONSTRAINT p PRIMARY KEY ("a");`, "RESTRICCIÓN EN TABLA EXISTENTE");
  frenaCon(`ALTER TABLE "Venta" ADD CONSTRAINT c CHECK (borrar("a"));`, "RESTRICCIÓN EN TABLA EXISTENTE");
  frenaCon(`ALTER TABLE "Venta" ADD CONSTRAINT c CHECK ("a" > 0);`, "RESTRICCIÓN EN TABLA EXISTENTE");
});

test("políticas sobre tablas nuevas: sólo la de aislamiento por tenant", () => {
  const N = `CREATE TABLE "N" ("id" TEXT, "tenantId" TEXT);\n`;
  frenaCon(N + `CREATE POLICY abierta ON "N" USING (true);`, "POLÍTICA DISTINTA");
  frenaCon(N + `CREATE POLICY p ON "N" USING ("tenantId" = current_setting('app.current_tenant_id', true) OR true);`, "POLÍTICA DISTINTA");
  frenaCon(N + `CREATE POLICY p ON "N" USING (borrar());`, "POLÍTICA DISTINTA");
  assert.ok(bloquea(N + `CREATE POLICY p ON "N" TO public USING ${PRED};`));
  assert.ok(bloquea(N + `CREATE POLICY p ON "N" AS RESTRICTIVE FOR SELECT USING ${PRED};`));
  frenaCon(N + `DROP POLICY IF EXISTS tenant_isolation ON "N";\nCREATE POLICY tenant_isolation ON "N" USING (true) WITH CHECK (true);`, "POLÍTICA DISTINTA");
  // mayúsculas de identificador importan ("tenant" ≠ "Tenant")
  assert.ok(bloquea(`CREATE TABLE "tenant" ("id" TEXT);\n${RLS_SUELTO("Tenant")}`));
  // CREATE TABLE IF NOT EXISTS / dentro de un string / dentro de un DO no cuentan como tabla nueva
  assert.ok(bloquea(`CREATE TABLE IF NOT EXISTS "Client" ("id" TEXT);${RLS_SUELTO("Client")}`));
  assert.ok(bloquea(`SELECT 'x; CREATE TABLE "Client"';\n${RLS_SUELTO("Client")}`));
  assert.ok(bloquea(`DO $$ BEGIN IF false THEN NULL; CREATE TABLE "Client" ("id" TEXT); END IF; END $$;\n${RLS_SUELTO("Client")}`));
});

test("DO: pasa sólo el molde RLS exacto sobre tablas creadas en la misma migración", () => {
  const N = `CREATE TABLE "PadelClub" ("id" TEXT);\nCREATE TABLE "PadelSerie" ("id" TEXT);\n`;
  const r = analizarSql(N + RLS_LOOP(["PadelClub", "PadelSerie"]));
  assert.deepEqual(r.bloqueos, []);
  assert.deepEqual(r.rlsNuevas, ["PadelClub", "PadelSerie"]);
  const una = `DO $$\nBEGIN\n  EXECUTE 'ALTER TABLE "PadelClub" ENABLE ROW LEVEL SECURITY';\n  EXECUTE 'DROP POLICY IF EXISTS tenant_isolation ON "PadelClub"';\n  EXECUTE 'CREATE POLICY tenant_isolation ON "PadelClub" '\n    || 'USING ("tenantId" = current_setting(''app.current_tenant_id'', true)) '\n    || 'WITH CHECK ("tenantId" = current_setting(''app.current_tenant_id'', true))';\nEND $$;`;
  pasa(N + una);
  // tabla existente en el array / tabla creada DESPUÉS del DO
  frenaCon(N + RLS_LOOP(["PadelClub", "Tenant"]), "RLS EN TABLA EXISTENTE");
  frenaCon(N + RLS_LOOP(["PadelClub", "Tenant"]), "SQL DINÁMICO");
  frenaCon(RLS_LOOP(["PadelClub"]) + N, "RLS EN TABLA EXISTENTE");
  frenaCon(N + una.replace(/"PadelClub"';\n  EXECUTE 'CREATE/, `"Tenant"';\n  EXECUTE 'CREATE`), "BLOQUE DO");
  frenaCon(N + una.replaceAll("PadelClub", "Tenant"), "RLS EN TABLA EXISTENTE");
  // sentencia extra, policy distinta, FORCE agregado, NO FORCE, otro tag, LANGUAGE, array vacío/expresión
  const loop = RLS_LOOP(["PadelClub"]);
  for (const [nombre, sql] of Object.entries({
    extra: loop.replace("END LOOP;", "END LOOP;\n  PERFORM borrar();"),
    "extra en el loop": loop.replace("LOOP\n", "LOOP\n    EXECUTE format('ALTER TABLE %I NO FORCE ROW LEVEL SECURITY', t);\n"),
    "USING (true)": loop.replace(`'USING ("tenantId" = current_setting(''app.current_tenant_id'', true)) '`, `'USING (true) '`),
    "WITH CHECK (true)": loop.replace(`'WITH CHECK ("tenantId" = current_setting(''app.current_tenant_id'', true))'`, `'WITH CHECK (true)'`),
    "otra variable de tenant": loop.replaceAll("app.current_tenant_id", "app.tenant"),
    "FOR SELECT": loop.replace("tenant_isolation ON %I '", "tenant_isolation ON %I FOR SELECT '"),
    "ENABLE → DISABLE": loop.replace("ENABLE ROW", "DISABLE ROW"),
    "otro tag": loop.replace("DO $$", "DO $x$").replace("END $$", "END $x$"),
    LANGUAGE: loop.replace("DO $$", "DO LANGUAGE plpgsql $$"),
    "array vacío": loop.replace("ARRAY['PadelClub']", "ARRAY[]::text[]"),
    "array con expresión": loop.replace("ARRAY['PadelClub']", "ARRAY['PadelClub' || '']"),
    "array con escape": loop.replace("ARRAY['PadelClub']", "ARRAY[E'PadelClub']"),
    "nombre con comillas": loop.replace("'PadelClub'", `'Padel"Club'`),
    "variable distinta": loop.replace("FOREACH t IN", "FOREACH u IN"),
    "punto y coma de más": loop.replace("END $$", "END; $$"),
  })) assert.ok(bloquea(N + sql), nombre);
  frenaCon(`DO $$ BEGIN END $$;`, "BLOQUE DO");
  frenaCon(`DO $$ BEGIN EXECUTE 'DROP TABLE "A"'; END $$;`, "DROP");
  frenaCon(`DO $$ BEGIN EXECUTE 'DR' || 'OP TABLE "A"'; END $$;`, "SQL DINÁMICO");
  frenaCon(`DO $$ BEGIN EXECUTE chr(68)||'ROP TABLE x'; END $$;`, "SQL OFUSCADO / FUERA DE BANDA");
  frenaCon(`DO $$ BEGIN UPDATE "Client" SET "email" = NULL; END $$;`, "ESCRIBE DATOS");
});

test("funciones: sólo now(), gen_random_uuid() y CURRENT_TIMESTAMP", () => {
  frenaCon(`ALTER TABLE "Venta" ADD COLUMN "x" INT DEFAULT borrar_todo();`, "FUNCIÓN NO RECONOCIDA");
  frenaCon(`ALTER TABLE "Venta" ADD COLUMN "x" TEXT DEFAULT lower('A');`, "FUNCIÓN NO RECONOCIDA");
  frenaCon(`ALTER TABLE "Venta" ADD COLUMN "x" TIMESTAMP DEFAULT clock_timestamp();`, "FUNCIÓN NO RECONOCIDA");
  frenaCon(`ALTER TABLE "Venta" ADD COLUMN x int DEFAULT pg_catalog.pg_sleep(1000);`, "REQUIERE REVISIÓN DEL DUEÑO");
  frenaCon(`CREATE INDEX "i" ON "Venta" (borrar_todo("x"));`, "FUNCIÓN NO RECONOCIDA");
  frenaCon(`CREATE INDEX "i" ON "Venta" ("x") WHERE borrar("x");`, "FUNCIÓN NO RECONOCIDA");
  frenaCon(`CREATE TABLE "N" ("x" TEXT CHECK (char_length("x") < 5));`, "FUNCIÓN NO RECONOCIDA");
  pasa(`ALTER TABLE "Venta" ADD COLUMN "id2" TEXT NOT NULL DEFAULT gen_random_uuid(), ADD COLUMN "t" TIMESTAMP(3) DEFAULT now(), ADD COLUMN "m" DECIMAL(12,2);`);
});

test("columna obligatoria sin default en tabla existente frena (en tabla nueva no)", () => {
  frenaCon(`ALTER TABLE "Order" ADD COLUMN "z" TEXT NOT NULL;`, "NOT NULL SIN DEFAULT");
  pasa(`CREATE TABLE "N" ("id" TEXT);\nALTER TABLE "N" ADD COLUMN "z" TEXT NOT NULL;`);
});

test("lo que no es una forma conocida frena", () => {
  for (const sql of [
    `SELECT borrar_todo();`,
    `LOCK TABLE "Venta" IN ACCESS EXCLUSIVE MODE;`,
    `ALTER TABLE "Venta" INHERIT "Otra";`,
    `ALTER TABLE "Venta" OWNER TO x;`,
    `ALTER TABLE "Venta" VALIDATE CONSTRAINT c;`,
    `CREATE TABLE otro."Venta" (id int); ALTER TABLE otro ENABLE ROW LEVEL SECURITY;`,
    `CREATE FUNCTION f() RETURNS int LANGUAGE sql AS $$ SELECT 1 $$;`,
    `SELECT 1 /* a /* b */ DROP TABLE x; -- */`,
    `COMMENT ON TABLE "Venta" IS 'x';`,
    `CREATE EXTENSION pg_trgm;`,
    `CALL limpiar_todo();`,
    `ALTER TABLE "Client" SET SCHEMA archivo;`,
    `SELECT setval('"Order_id_seq"', 1);`,
    `ALTER TABLE "Invoice" DISABLE TRIGGER ALL;`,
    `SET search_path TO otro;`,
    `GRANT SELECT ON "Client" TO PUBLIC;`,
    `ALTER FUNCTION f() SECURITY DEFINER;`,
    `CREATE EVENT TRIGGER et ON ddl_command_start EXECUTE FUNCTION f();`,
    `CREATE TABLE "N" ("a" INT GENERATED ALWAYS AS (1) STORED);`,
    `CREATE TABLE "N" ("a" INT) INHERITS ("Venta");`,
    `CREATE INDEX i ON "Venta" ("a" text_pattern_ops);`,
    `CREATE INDEX i ON "Venta" ("a") WHERE "a" IN (SELECT 1);`,
  ])
    assert.ok(bloquea(sql), sql);
});

test("comentarios no frenan; lo escondido tras strings/identificadores con -- sí", () => {
  assert.equal(bloquea(`-- acá antes se hacía DROP TABLE\n/* DROP /* anidado */ COLUMN */\nCREATE TABLE "A" ("id" TEXT);`), false);
  assert.equal(bloquea(`SELECT '--'; DROP TABLE "A";`), true);
  assert.equal(bloquea(`SELECT 'it''s -- not a comment'; DROP TABLE "A";`), true);
  assert.equal(bloquea(`SELECT E'\\' -- '; DROP TABLE "A";`), true, "E-string con \\'");
  assert.equal(bloquea(`SELECT "col--x" FROM t; DROP TABLE "A";`), true, "-- dentro de un identificador");
  assert.equal(bloquea(`SELECT $x$ -- $x$; DROP TABLE "A";`), true, "-- dentro de $x$");
  frenaCon(`SELECT U&'\\0044ROP';`, "SQL OFUSCADO / FUERA DE BANDA");
});

test("SQL ilegible (string o comentario sin cerrar) frena", () => {
  assert.deepEqual(reglas(`CREATE TABLE "A" ('x);`), ["ILEGIBLE"]);
  assert.deepEqual(reglas(`/* sin cerrar`), ["ILEGIBLE"]);
  assert.deepEqual(reglas(`DO $$ BEGIN`), ["ILEGIBLE"]);
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

// ── Certificación adversarial 2 (sobre 9eaf86f7): todos los ataques frenan ─────
const N2 = `CREATE TABLE "N" (id int, "tenantId" text);\n`;
const ATAQUES_CERT2 = {
  "anidado /* /* */ */ esconde": `SELECT 1; /* a /* b */ c */ LOCK TABLE "Venta";`,
  "anidado mal cerrado": `/* /* */ LOCK TABLE "Venta";`,
  "dollar tag": `COMMENT ON TABLE "N" IS $x$ ; LOCK TABLE "Venta"; $x$;`,
  "dollar tag anidado": `DO $a$ BEGIN PERFORM $b$ x $b$; END $a$;`,
  "E string escape": N2 + `COMMENT ON TABLE "N" IS E'\\' ; LOCK TABLE "Venta"; --';`,
  "E string escape 2": N2 + `COMMENT ON TABLE "N" IS E'a\\\\'; LOCK TABLE "Venta";`,
  "string con ;": N2 + `COMMENT ON TABLE "N" IS 'a; DROP TABLE x'; LOCK TABLE "Venta";`,
  "U& ident": `ALTER TABLE U&"\\0056enta" ADD COLUMN x int;`,
  "U& string": N2 + `INSERT INTO "N" VALUES (U&'\\0041');`,
  "unicode nbsp": `CREATE TABLE "N" (id int); LOCK TABLE "Venta";`,
  "multi por línea": N2 + `CREATE INDEX i ON "N"(id); LOCK TABLE "Venta"; CREATE INDEX j ON "N"(id);`,
  "BEGIN/COMMIT": `BEGIN; CREATE TABLE "N" (id int); COMMIT;`,
  "SET ROLE": `SET ROLE postgres;`,
  "SET row_security": `SET row_security = off;`,
  "RESET ROLE": `RESET ROLE;`,
  "CREATE OR REPLACE FUNCTION": `CREATE OR REPLACE FUNCTION f() RETURNS int LANGUAGE sql AS $$ SELECT 1 $$;`,
  "CREATE FUNCTION": `CREATE FUNCTION f() RETURNS int LANGUAGE sql AS $$ SELECT 1 $$;`,
  "CREATE OR REPLACE VIEW": `CREATE OR REPLACE VIEW v AS SELECT * FROM "Venta";`,
  "CREATE VIEW (bypassa RLS)": `CREATE VIEW v AS SELECT * FROM "Venta";`,
  "CREATE MATERIALIZED VIEW": `CREATE MATERIALIZED VIEW v AS SELECT * FROM "Venta";`,
  "CREATE TABLE AS": `CREATE TABLE "Copia" AS SELECT * FROM "Venta";`,
  "SELECT INTO": `SELECT * INTO "Copia" FROM "Venta";`,
  GRANT: `GRANT ALL ON "Venta" TO public;`,
  REVOKE: `REVOKE ALL ON "Venta" FROM app;`,
  "DISABLE RLS": `ALTER TABLE "Venta" DISABLE ROW LEVEL SECURITY;`,
  "NO FORCE RLS": `ALTER TABLE "Venta" NO FORCE ROW LEVEL SECURITY;`,
  "NO FORCE comentado": `ALTER TABLE "Venta" NO/**/FORCE ROW LEVEL SECURITY;`,
  "ALTER POLICY": `ALTER POLICY p ON "Venta" USING (true);`,
  "ALTER POLICY comentario": `ALTER/* */POLICY p ON "Venta" USING (true);`,
  COPY: `COPY "Venta" FROM PROGRAM 'curl x';`,
  "DO $$ PERFORM": `DO $$ BEGIN PERFORM borrar(); END $$;`,
  "DO $$ vacío": `DO $$ BEGIN END $$;`,
  "DO LANGUAGE plpythonu": `DO LANGUAGE plpython3u $$ import os $$;`,
  "INDEX esconde LOCK (sin ;)": N2 + `CREATE INDEX i ON "N" (id) WHERE true LOCK TABLE "Venta";`,
  "INDEX USING func": N2 + `CREATE INDEX i ON "Venta" (borrar(id));`,
  "INDEX operador": `CREATE INDEX i ON "Venta" ((id === 1));`,
  "ADD COLUMN esconde": `ALTER TABLE "Venta" ADD COLUMN x int, INHERIT "Otra";`,
  "ADD COLUMN default func": `ALTER TABLE "Venta" ADD COLUMN x int DEFAULT borrar();`,
  "ADD COLUMN generated func": `ALTER TABLE "Venta" ADD COLUMN x int GENERATED ALWAYS AS (borrar(id)) STORED;`,
  "ADD CONSTRAINT CHECK false NOT VALID": `ALTER TABLE "Venta" ADD CONSTRAINT c CHECK (false) NOT VALID;`,
  "ADD FK cascade": N2 + `ALTER TABLE "Venta" ADD CONSTRAINT fk FOREIGN KEY ("tenantId") REFERENCES "N"(id) ON DELETE CASCADE NOT VALID;`,
  "SET DEFAULT rol existente": `ALTER TABLE "Usuario" ALTER COLUMN "rol" SET DEFAULT 'ADMIN';`,
  "SET DEFAULT tenantid quoted lower": `ALTER TABLE "Venta" ALTER COLUMN "tenantid" SET DEFAULT 'x';`,
  "SET DEFAULT tenant via U&": `ALTER TABLE "Venta" ALTER COLUMN U&"tenant\\0049d" SET DEFAULT 'x';`,
  "TRIGGER tabla nueva func existente + INSERT": N2 + `CREATE TRIGGER t AFTER INSERT ON "N" FOR EACH ROW EXECUTE FUNCTION borrar_todo();\nINSERT INTO "N" VALUES (1, 'a');`,
  "TRIGGER tabla nueva EXECUTE PROCEDURE": N2 + `CREATE TRIGGER t AFTER INSERT ON "N" FOR EACH STATEMENT EXECUTE PROCEDURE public.borrar_todo();`,
  "POLICY tabla nueva func": N2 + `CREATE POLICY p ON "N" USING (borrar());`,
  "INSERT SELECT de otra tabla": N2 + `INSERT INTO "N" SELECT id, "tenantId" FROM "Venta";`,
  "INSERT con funcion notation": N2 + `INSERT INTO "N" SELECT v.borrar_todo, 'a' FROM "Venta" v;`,
  "INSERT CTE DELETE": N2 + `INSERT INTO "N" WITH d AS (DELETE FROM "Venta" RETURNING id) SELECT id, 'a' FROM d;`,
  "INSERT CTE UPDATE": N2 + `INSERT INTO "N" WITH d AS (UPDATE "Venta" SET monto=0 RETURNING id) SELECT id, 'a' FROM d;`,
  "UPDATE nueva con subq update": N2 + `UPDATE "N" SET id = (SELECT 1 FROM (UPDATE "Venta" SET monto = 0 RETURNING 1) x);`,
  "COMMENT ON con func": `COMMENT ON TABLE "Venta" IS borrar();`,
  "CREATE TYPE composite": `CREATE TYPE "E" AS (a int);`,
  "CREATE SCHEMA": `CREATE SCHEMA x;`,
  "CREATE TABLE otro schema shadow": `CREATE TABLE "$user"."Venta" (id int);`,
  LOAD: `LOAD 'x';`,
  NOTIFY: `NOTIFY x;`,
  CLUSTER: `CLUSTER "Venta";`,
  VACUUM: `VACUUM FULL "Venta";`,
  "ENABLE RULE": `ALTER TABLE "Venta" ENABLE RULE r;`,
  "REPLICA IDENTITY": `ALTER TABLE "Venta" REPLICA IDENTITY NOTHING;`,
  "ALTER COLUMN SET STORAGE": `ALTER TABLE "Venta" ALTER COLUMN x SET STORAGE PLAIN;`,
  "RLS idioma suelto + merge": N2 + `ALTER TABLE "N" ENABLE ROW LEVEL SECURITY;\nCREATE POLICY p ON "N" USING ${PRED} WITH CHECK ${PRED};\nLOCK TABLE "Venta";`,
  "CREATE POLICY en string, EXECUTE fake": N2 + `COMMENT ON TABLE "N" IS 'BEGIN CREATE POLICY p ON "N" USING ${PRED.replace(/'/g, "''")} WITH CHECK ${PRED.replace(/'/g, "''")};'; LOCK TABLE "Venta";`,
  "quoted ident THEN + policy": N2 + `CREATE INDEX "THEN" ON "N"(id) WHERE id > 0 CREATE POLICY p ON "N" USING ${PRED} WITH CHECK ${PRED};\nLOCK TABLE "Venta";`,
  "EXECUTE dentro string": N2 + `COMMENT ON TABLE "N" IS 'EXECUTE ';  LOCK TABLE "Venta";`,
  "DO idioma + extra": N2 + `DO $$ BEGIN EXECUTE 'ALTER TABLE "N" ENABLE ROW LEVEL SECURITY'; PERFORM borrar(); END $$;`,
  "DO idioma format": N2 + `DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['N'] LOOP EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t); END LOOP; END $$;`,
  "DO idioma format var tabla existente": N2 + `DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['Venta'] LOOP EXECUTE format('ALTER TABLE %I NO FORCE ROW LEVEL SECURITY', t); END LOOP; END $$;`,
  "pg_catalog call": `ALTER TABLE "Venta" ADD COLUMN x int DEFAULT pg_catalog.pg_sleep(1000);`,
  "TRUNCATE ident case": `trUncAte "Venta";`,
  "ALTER TABLE SET ACCESS METHOD": `ALTER TABLE "Venta" SET ACCESS METHOD heap;`,
  "SECURITY LABEL": `SECURITY LABEL ON TABLE "Venta" IS 'x';`,
  "DECLARE CURSOR": `DECLARE c CURSOR FOR SELECT 1;`,
  "PREPARE/EXECUTE": `PREPARE p AS DELETE FROM "Venta"; EXECUTE p;`,
  // ataques3: exfiltración entre negocios
  "exfil INSERT SELECT reasigna tenant": `CREATE TABLE "Espejo" (id text, "tenantId" text);\nINSERT INTO "Espejo" SELECT id, 'tenant-atacante' FROM "Cliente";`,
  "exfil backfill string_agg": `ALTER TABLE "Venta" ADD COLUMN "nota2" text;\nUPDATE "Venta" SET "nota2" = (SELECT string_agg("email", ',') FROM "Usuario");`,
};
for (const [nombre, sql] of Object.entries(ATAQUES_CERT2))
  test(`cert2 frena: ${nombre}`, () => {
    const r = analizarSql(sql);
    assert.ok(r.bloqueos.length > 0, sql);
    assert.deepEqual(r.avisos, []);
    for (const b of r.bloqueos) assert.match(b.motivo, /REQUIERE REVISIÓN DEL DUEÑO/);
  });

// ── Calibración contra el historial real del repo ──────────────────────────
// Con la falla cerrada, varias migraciones históricas (que se aplicaron a mano o con revisión)
// hoy FRENARÍAN: no se tocan, se documentan acá y en docs/operacion/publicar-por-actions.md.
const DIR = new URL("../../prisma/migrations/", import.meta.url).pathname;
test("historial real: aditivas pasan, lo demás frena", { skip: !existsSync(DIR) }, () => {
  const pasan = [
    "20260701054003_init",
    "20261105122000_vouchers",
    "20261106120000_support_ticket",
    "20261102120000_consultas",
    "20261105121000_user_permission_override",
    "20261030120000_m1_enums_caja", // ALTER TYPE … ADD VALUE IF NOT EXISTS
    // molde RLS en DO (loop y tabla suelta)
    "20260815120000_lead_campania",
    "20261008120000_modulo_taller",
    "20261013120000_modulo_inmobiliaria",
    "20261015120000_modulo_padel_clases",
    // FK sobre columna nueva vacía (ON DELETE RESTRICT) sobre tablas existentes
    "20260705120000_control_plane_tenant",
    "20261101140000_proyecto_entregables",
    // FK con ON DELETE SET NULL cuyas columnas son todas nuevas y vacías (default de Prisma en relaciones opcionales)
    "20260702180447_add_tenant_nullable",
    "20260702221903_add_service_category",
    "20260704130000_add_commission_payouts",
    "20260708230000_add_supplier_master",
    "20260708230200_add_invoice_origin",
    "20260907120000_add_cash_movement_payment_id",
    "20260907180000_add_appointment_partial_collections",
    "20261009120000_taller_caja",
    "20261101120000_modulo_proyectos",
    "20261101130000_proyecto_gastos",
    "20261101150000_proyecto_gestion_eventos",
    "20261108120000_profeturnos_clubes_serie_grupal",
  ];
  const frenan = {
    "20260708120000_invoice_money_decimal": "CAMBIO DE TIPO",
    "20260710120000_invoice_origin_idempotency_unique": "DROP",
    "20261013180000_inmobiliaria_ajustes": "ESCRIBE DATOS",
    "20260925120000_lanzamiento_base": "RESTRICCIÓN EN TABLA EXISTENTE", // CHECK sobre tablas existentes
    "20261104123000_servicio_completo": "FUNCIÓN NO RECONOCIDA",
    "20261104122000_contabilidad_ola1": "TRIGGER",
    "20260702215616_tenant_not_null_indexed": "SET NOT NULL",
    "20260906120000_add_cash_method_libro_caja": "ESCRIBE DATOS",
    "20260925150000_comprobante_autorizado_inmutable": "TRIGGER",
    "20261013210000_inmobiliaria_recibos": "ESCRIBE DATOS",
    // cert3: UNIQUE sobre columnas que ya tenían datos
    "20260705150002_fiscal_invoice_align": "ÚNICO EN TABLA EXISTENTE",
    "20260712120000_sprint_entregable_concurrency_guards": "ÚNICO EN TABLA EXISTENTE",
    "20261104121000_rendiciones": "ÚNICO EN TABLA EXISTENTE",
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
  // Frenan EXACTAMENTE éstas (13 de 69 al 08/11/2026); una nueva que frene se mira y se agrega acá.
  const frenanHoy = [...hay].filter((m) => existsSync(`${DIR}${m}/migration.sql`) && bloquea(readFileSync(`${DIR}${m}/migration.sql`, "utf8")));
  assert.deepEqual(frenanHoy.filter((m) => m < "20261109").sort(), Object.keys(frenan).sort());
});
