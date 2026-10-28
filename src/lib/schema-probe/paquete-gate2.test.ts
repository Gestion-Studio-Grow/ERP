// ============================================================================
// Paquete Gate 2 nivel 2 contra un Postgres LOCAL efímero (tanda S2, criterios C1, C2, C5, C7)
// ============================================================================
// Corre SÓLO si `GATE2_PG_URL` apunta a un Postgres local (localhost / 127.0.0.1), p. ej.
//   GATE2_PG_URL=postgresql://postgres@localhost:5433/postgres \
//     node --import tsx --test src/lib/schema-probe/paquete-gate2.test.ts
// Sin la variable (CI, `npm test`, la PC del dueño) se SALTEA. Con un host que no sea local se
// niega a correr: NADA de esto va contra Neon (D-01).
//
// Qué hace, en una base propia que crea y borra:
//   1. `prisma migrate deploy` (base = prisma/migrations de hoy) → probes en false (SIN paquete).
//   2. Paso 1 (CarniceriaRubro.sql) → diff de Prisma contra el schema de hoy = LÍNEA DE BASE
//      (CarniceriaRubro no está en schema.prisma por diseño + drift previo ajeno a S2).
//   3. Pasos 2–7 como el runbook (psql, ON_ERROR_STOP, sin --single-transaction) → probes en
//      true; diff contra schema.prisma con `// N2:` y `// N2-enum:` descomentadas == línea de base
//      (el paquete no agrega NINGUNA diferencia: "db pull sin diferencias").
//   4. C2: cada tabla nueva tiene FK a Tenant, índice que empieza por tenantId y la policy; se
//      la sacamos y la re-ejecución de prisma/rls/0001_enable_rls.sql la repone.
//   5. Plata/datos con dos negocios y doble envío, con un rol SIN bypass de RLS.
//   6. Idempotencia: pasos 1–7 otra vez → sin error, mismo diff.
//   7. Reversa de cada archivo (la del pie, tal cual) → probes en false y diff = el de hoy;
//      y de nuevo el paquete → diff = línea de base.
// ============================================================================
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import pg from "pg";
import { crearSchemaProbe, type ConsultaSql } from "./probe";

const URL_ADMIN = process.env.GATE2_PG_URL ?? "";
const RAIZ = process.cwd();
const PENDIENTES = path.join(RAIZ, "prisma/pending-gate2");
const ORDEN = ["CarniceriaRubro.sql", "N2_enums.sql", "N2_hub.sql", "N2_pagos.sql", "N2_retail.sql", "N2_club_indice.sql"];
const RLS_0001 = path.join(RAIZ, "prisma/rls/0001_enable_rls.sql");
const TABLAS_NUEVAS = ["ApiKey", "WebhookSuscripcion", "EntregaWebhook", "PlantillaWhatsapp", "PagoExterno", "ClubReservaIndice"];

function esLocal(url: string): boolean {
  try {
    const h = new URL(url).hostname;
    return h === "localhost" || h === "127.0.0.1" || h === "::1";
  } catch {
    return false;
  }
}
function tienePsql(): boolean {
  try {
    execFileSync("psql", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

const motivoSalto = !URL_ADMIN
  ? "sin GATE2_PG_URL (Postgres local efímero)"
  : !esLocal(URL_ADMIN)
    ? "GATE2_PG_URL no es local: este test nunca corre contra Neon"
    : !tienePsql()
      ? "sin psql en el PATH"
      : false;

const sufijo = `${process.pid}_${Date.now().toString(36)}`;
const BASE = `s2_paquete_${sufijo}`;
const ROL = `s2_rls_prueba_${sufijo}`;
const urlBase = () => {
  const u = new URL(URL_ADMIN);
  u.pathname = `/${BASE}`;
  return u.toString();
};
let tmp = "";

function psqlArchivo(archivo: string) {
  execFileSync("psql", ["-q", "-X", "-v", "ON_ERROR_STOP=1", "-d", urlBase(), "-f", archivo], {
    stdio: ["ignore", "ignore", "pipe"],
  });
}
function psqlSql(sql: string) {
  const f = path.join(tmp, `sql-${Math.random().toString(36).slice(2)}.sql`);
  writeFileSync(f, sql);
  psqlArchivo(f);
}
function aplicarPaquete() {
  for (const f of ORDEN) psqlArchivo(path.join(PENDIENTES, f));
  psqlArchivo(RLS_0001); // paso 7
}

/** Bloque de reversa del pie de un archivo, tal cual está escrito (sin el `--   `). */
function reversaDe(archivo: string): string {
  const lineas = readFileSync(path.join(PENDIENTES, archivo), "utf8").split("\n");
  if (archivo === "CarniceriaRubro.sql") {
    const i = lineas.findIndex((l) => l.startsWith("-- ROLLBACK"));
    const out: string[] = [];
    for (const l of lineas.slice(i + 1)) {
      if (!l.startsWith("--   ")) break;
      out.push(l.slice(5));
    }
    return out.join("\n");
  }
  const desde = lineas.map((l) => l.includes("REVERSA")).lastIndexOf(true);
  const ini = lineas.findIndex((l, k) => k > desde && l.trim() === "--   BEGIN;");
  const fin = lineas.findIndex((l, k) => k > ini && l.trim() === "--   COMMIT;");
  assert.ok(ini > 0 && fin > ini, `${archivo}: falta el bloque BEGIN…COMMIT de la reversa`);
  return lineas.slice(ini, fin + 1).map((l) => l.replace(/^--   /, "")).join("\n");
}

/** Diff de Prisma (base → schema). Normalizado: sin líneas vacías ni el aviso de config. */
function diffContra(schema: string): string {
  const out = execFileSync(
    "npx",
    ["prisma", "migrate", "diff", "--from-config-datasource", "--to-schema", schema],
    { cwd: RAIZ, env: { ...process.env, DATABASE_URL: urlBase(), MIGRATE_DATABASE_URL: "" }, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  return out
    .split("\n")
    .filter((l) => l.trim() && !l.startsWith("Loaded Prisma config"))
    .join("\n");
}

const SCHEMA_HOY = path.join(RAIZ, "prisma/schema.prisma");
let schemaN2 = "";
/** Schema de hoy + sólo los valores de enum de N2 (lo que queda tras la reversa). */
let schemaSoloEnums = "";
let schemaHoy = "";

async function conCliente<T>(fn: (c: pg.Client) => Promise<T>, url = urlBase()): Promise<T> {
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  try {
    return await fn(c);
  } finally {
    await c.end();
  }
}
/** Probe NUEVO (caché vacía) sobre la base de prueba. */
async function probes() {
  return conCliente(async (c) => {
    const consultar: ConsultaSql = async (sql, params) => (await c.query(sql, [...params])).rows;
    const p = crearSchemaProbe(consultar);
    return {
      apiKey: await p.hayTabla("ApiKey"),
      clave: await p.hayColumna("OutboxEvent", "clave"),
      tarjeta: await p.hayValorEnum("PaymentMethod", "TARJETA"),
      encargado: await p.hayValorEnum("UserRole", "ENCARGADO"),
      pago: await p.hayTabla("PagoExterno"),
      indice: await p.hayTabla("ClubReservaIndice"),
      limite: await p.hayColumna("Client", "limiteCredito"),
      // controles: lo que ya existe hoy
      outbox: await p.hayTabla("OutboxEvent"),
      efectivo: await p.hayValorEnum("PaymentMethod", "EFECTIVO"),
    };
  });
}

/** Cliente como el rol de la app (sin bypass de RLS) con el negocio seteado. */
async function comoNegocio<T>(tenantId: string, fn: (c: pg.Client) => Promise<T>): Promise<T> {
  return conCliente(async (c) => {
    await c.query(`SET ROLE "${ROL}"`);
    await c.query("SELECT set_config('app.current_tenant_id', $1, false)", [tenantId]);
    return fn(c);
  });
}

let lineaDeBase = "";
let diffDeHoy = "";

test("paquete Gate 2 nivel 2 en Postgres local", { skip: motivoSalto }, async (t) => {
  tmp = mkdtempSync(path.join(tmpdir(), "s2-gate2-"));
  schemaN2 = path.join(tmp, "schema.n2.prisma");
  // Los valores de enum que una tanda ya encendió (`// N2-enum-encendido:`, M1 encendió TARJETA) se
  // vuelven a comentar: la «base de hoy» del paquete es el schema sin ningún valor del paquete.
  const hoy = readFileSync(SCHEMA_HOY, "utf8").replace(/^(\s*)(\w+) \/\/ N2-enum-encendido: .*$/gm, "$1// N2-enum: $2");
  schemaHoy = path.join(tmp, "schema.hoy.prisma");
  writeFileSync(schemaHoy, hoy);
  writeFileSync(schemaN2, hoy.replace(/^(\s*)\/\/ N2(-enum)?: ?/gm, "$1"));
  schemaSoloEnums = path.join(tmp, "schema.enums.prisma");
  writeFileSync(schemaSoloEnums, hoy.replace(/^(\s*)\/\/ N2-enum: /gm, "$1"));

  await conCliente((c) => c.query(`CREATE DATABASE "${BASE}"`), URL_ADMIN);
  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    cwd: RAIZ,
    env: { ...process.env, DATABASE_URL: urlBase(), MIGRATE_DATABASE_URL: "" },
    stdio: "ignore",
  });

  try {
    await t.test("SIN el paquete: los probes contestan false (y true en lo que ya existe)", async () => {
      const p = await probes();
      assert.deepEqual(
        { ...p },
        { apiKey: false, clave: false, tarjeta: false, encargado: false, pago: false, indice: false, limite: false, outbox: true, efectivo: true },
      );
      diffDeHoy = diffContra(schemaHoy);
    });

    await t.test("línea de base: sólo el paso 1 (CarniceriaRubro, fuera de schema.prisma)", async () => {
      psqlArchivo(path.join(PENDIENTES, "CarniceriaRubro.sql"));
      lineaDeBase = diffContra(schemaHoy);
    });

    await t.test("CON el paquete: probes en true y el schema descomentado no agrega diferencias (C5, C7)", async () => {
      aplicarPaquete();
      const p = await probes();
      assert.ok(Object.values(p).every(Boolean), JSON.stringify(p));
      assert.equal(diffContra(schemaN2), lineaDeBase);
    });

    await t.test("C2: FK a Tenant, índice por tenantId y policy repuesta por 0001", async () => {
      await conCliente(async (c) => {
        for (const tabla of TABLAS_NUEVAS) {
          const fk = await c.query(
            `SELECT 1 FROM pg_constraint k JOIN pg_class r ON r.oid = k.conrelid
             WHERE r.relname = $1 AND k.contype = 'f' AND k.confrelid = '"Tenant"'::regclass`,
            [tabla],
          );
          assert.equal(fk.rowCount, 1, `${tabla}: FK a Tenant`);
          const ix = await c.query(
            `SELECT 1 FROM pg_index i JOIN pg_class r ON r.oid = i.indrelid
             JOIN pg_attribute a ON a.attrelid = r.oid AND a.attnum = i.indkey[0]
             WHERE r.relname = $1 AND a.attname = 'tenantId'`,
            [tabla],
          );
          assert.ok((ix.rowCount ?? 0) > 0, `${tabla}: índice por tenantId`);
          await c.query(`DROP POLICY IF EXISTS tenant_isolation ON "${tabla}"`);
          await c.query(`ALTER TABLE "${tabla}" DISABLE ROW LEVEL SECURITY`);
        }
      });
      psqlArchivo(RLS_0001);
      await conCliente(async (c) => {
        const r = await c.query(
          `SELECT c.relname FROM pg_class c JOIN pg_policies p ON p.tablename = c.relname
           WHERE p.policyname = 'tenant_isolation' AND c.relrowsecurity AND c.relname = ANY($1)`,
          [TABLAS_NUEVAS],
        );
        assert.deepEqual(r.rows.map((x) => x.relname).sort(), [...TABLAS_NUEVAS].sort());
      });
    });

    await t.test("plata/datos: dos negocios, doble envío, un solo cobro, RLS", async () => {
      await conCliente(async (c) => {
        await c.query(`INSERT INTO "Tenant"(id, name, slug, "updatedAt") VALUES
          ('s2-a','Negocio A','s2-a', now()), ('s2-b','Negocio B','s2-b', now())`);
        await c.query(`CREATE ROLE "${ROL}" NOLOGIN NOBYPASSRLS`);
        await c.query(`GRANT USAGE ON SCHEMA public TO "${ROL}"`);
        await c.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO "${ROL}"`);
      });
      const altaPago = `INSERT INTO "PagoExterno"(id, "tenantId", proveedor, "idExterno", estado, monto, referencia)
        VALUES ($1, current_setting('app.current_tenant_id'), 'mercadopago', '999', 'approved', 15000.50, 'pedido:1')
        ON CONFLICT ("tenantId", proveedor, "idExterno") DO NOTHING RETURNING id`;
      // Doble envío del webhook (dos procesos, mismo payment_id) → una fila.
      const altas = await Promise.all([
        comoNegocio("s2-a", (c) => c.query(altaPago, ["pa-1"])),
        comoNegocio("s2-a", (c) => c.query(altaPago, ["pa-2"])),
      ]);
      assert.equal(altas.reduce((n, r) => n + (r.rowCount ?? 0), 0), 1, "doble envío = un PagoExterno");
      // El mismo payment_id en OTRO negocio es otro pago (no choca).
      const enB = await comoNegocio("s2-b", (c) => c.query(altaPago, ["pb-1"]));
      assert.equal(enB.rowCount, 1);
      // Aplicar el cobro dos veces a la vez → un solo proceso lo aplica.
      const aplicar = `UPDATE "PagoExterno" SET "aplicadoEn" = now()
        WHERE proveedor = 'mercadopago' AND "idExterno" = '999' AND "aplicadoEn" IS NULL RETURNING id`;
      const aplicados = await Promise.all([
        comoNegocio("s2-a", (c) => c.query(aplicar)),
        comoNegocio("s2-a", (c) => c.query(aplicar)),
      ]);
      assert.equal(aplicados.reduce((n, r) => n + (r.rowCount ?? 0), 0), 1, "un solo cobro aplicado");
      // RLS: A no ve lo de B; no puede escribir a nombre de B; sin negocio no ve nada.
      const vistosA = await comoNegocio("s2-a", (c) => c.query(`SELECT "tenantId" FROM "PagoExterno"`));
      assert.deepEqual(vistosA.rows.map((r) => r.tenantId), ["s2-a"]);
      await assert.rejects(
        comoNegocio("s2-a", (c) =>
          c.query(`INSERT INTO "PagoExterno"(id,"tenantId",proveedor,"idExterno",estado,monto) VALUES ('x','s2-b','mercadopago','1','approved',1)`),
        ),
        /row-level security/,
      );
      const sinNegocio = await comoNegocio("", (c) => c.query(`SELECT count(*)::int AS n FROM "PagoExterno"`));
      assert.equal(sinNegocio.rows[0].n, 0);
      // Monto negativo: lo frena la base.
      await assert.rejects(
        comoNegocio("s2-a", (c) =>
          c.query(`INSERT INTO "PagoExterno"(id,"tenantId",proveedor,"idExterno",estado,monto) VALUES ('neg','s2-a','mercadopago','2','approved',-1)`),
        ),
        /PagoExterno_monto_no_negativo/,
      );
      // Outbox: misma clave dos veces en un negocio = un evento; en otro negocio, otro evento.
      const evento = `INSERT INTO "OutboxEvent"(id,"tenantId",type,payload,clave)
        VALUES ($1, current_setting('app.current_tenant_id'), 'pago.acreditado', '{}'::jsonb, 'pago:999')
        ON CONFLICT ("tenantId", clave) DO NOTHING RETURNING version`;
      const ev = await Promise.all([
        comoNegocio("s2-a", (c) => c.query(evento, ["ev-a1"])),
        comoNegocio("s2-a", (c) => c.query(evento, ["ev-a2"])),
        comoNegocio("s2-b", (c) => c.query(evento, ["ev-b1"])),
      ]);
      assert.equal(ev[2].rowCount, 1, "la misma clave en otro negocio es otro evento");
      assert.equal((ev[0].rowCount ?? 0) + (ev[1].rowCount ?? 0), 1, "clave repetida = un evento");
      assert.equal((ev[2].rows[0] as { version: number }).version, 1, "version por omisión = 1");
      // Proyección del club: doble guardado de la misma reserva = una fila.
      const upsert = `INSERT INTO "ClubReservaIndice"(id,"tenantId","reservaId","canchaId",inicio,fin,estado)
        VALUES ($1, current_setting('app.current_tenant_id'), 'r1', 'c1', now(), now() + interval '90 min', 'confirmada')
        ON CONFLICT ("tenantId","reservaId") DO UPDATE SET estado = EXCLUDED.estado, "actualizadoEn" = now()`;
      await comoNegocio("s2-a", async (c) => {
        await c.query(upsert, ["ci-1"]);
        await c.query(upsert, ["ci-2"]);
        const n = await c.query(`SELECT count(*)::int AS n FROM "ClubReservaIndice"`);
        assert.equal(n.rows[0].n, 1);
      });
      // Limpieza de los datos de prueba (la base se borra igual al final).
      await conCliente(async (c) => {
        for (const tabla of ["ClubReservaIndice", "PagoExterno", "OutboxEvent"]) {
          await c.query(`DELETE FROM "${tabla}" WHERE "tenantId" IN ('s2-a','s2-b')`);
        }
      });
    });

    await t.test("idempotencia: el paquete otra vez no falla ni cambia nada", async () => {
      aplicarPaquete();
      assert.equal(diffContra(schemaN2), lineaDeBase);
    });

    await t.test("reversa de cada archivo (la del pie) y de nuevo el paquete", async () => {
      for (const f of ["N2_club_indice.sql", "N2_retail.sql", "N2_pagos.sql", "N2_hub.sql", "CarniceriaRubro.sql"]) {
        psqlSql(reversaDe(f));
      }
      // N2_enums: la reversa del runbook es DEJAR los valores (Postgres no tiene DROP VALUE).
      const p = await probes();
      assert.deepEqual(
        { apiKey: p.apiKey, clave: p.clave, pago: p.pago, indice: p.indice, limite: p.limite, tarjeta: p.tarjeta },
        { apiKey: false, clave: false, pago: false, indice: false, limite: false, tarjeta: true },
      );
      assert.equal(diffContra(schemaSoloEnums), diffDeHoy, "tras la reversa, la base vuelve a la de hoy (+ los 3 valores de enum)");
      aplicarPaquete();
      assert.equal(diffContra(schemaN2), lineaDeBase, "re-aplicado tras la reversa");
    });
  } finally {
    await conCliente(async (c) => {
      await c.query(`DROP DATABASE IF EXISTS "${BASE}" WITH (FORCE)`);
      await c.query(`DROP ROLE IF EXISTS "${ROL}"`);
    }, URL_ADMIN);
    rmSync(tmp, { recursive: true, force: true });
  }
});
