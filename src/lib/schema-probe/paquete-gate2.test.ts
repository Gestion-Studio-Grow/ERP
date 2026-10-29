// ============================================================================
// Paquete Gate 2 nivel 2 contra un Postgres LOCAL efímero (tanda S2, criterios C1, C2, C5, C7
// + los casos adversariales de la certificación S2)
// ============================================================================
// Corre SÓLO si `GATE2_PG_URL` apunta a un Postgres local (localhost / 127.0.0.1), p. ej.
//   GATE2_PG_URL=postgresql://postgres@localhost:5433/postgres \
//     node --import tsx --test src/lib/schema-probe/paquete-gate2.test.ts
// o, sin Postgres instalado, sobre PGlite (WASM, en memoria):
//   node scripts/qa/gate2-pglite.mjs
// Sin la variable (CI, `npm test`, la PC del dueño) se SALTEA. Con un host que no sea local se
// niega a correr: NADA de esto va contra Neon (D-01).
//
// Qué hace, en una base propia que crea y borra:
//   1. `prisma migrate deploy` (base = prisma/migrations de hoy) → probes en false (SIN paquete);
//      dos negocios y un evento del outbox "de antes".
//   2. Paso 1 (CarniceriaRubro.sql) → diff de Prisma contra el schema de hoy = LÍNEA DE BASE
//      (CarniceriaRubro no está en schema.prisma por diseño + drift previo ajeno a S2).
//   3. Pasos 2–7 como el runbook (psql, ON_ERROR_STOP, sin --single-transaction) → probes en
//      true; diff contra schema.prisma con `// N2:` y `// N2-enum:` descomentadas == línea de base
//      (el paquete no agrega NINGUNA diferencia: C7, ver runbook §6 «Cómo se mide»).
//   4. El evento de antes queda con version=1 y clave NULL.
//   5. C2: cada tabla nueva tiene FK a Tenant, índice que empieza por tenantId y la policy; se
//      la sacamos y la re-ejecución de prisma/rls/0001_enable_rls.sql la repone; check-rls-live
//      sale con 0 (paso 3 del runbook).
//   6. FK compuestas: nada apunta a la conexión, al evento o a la suscripción de OTRO negocio.
//   7. RLS con un rol SIN bypass en las 6 tablas: sin negocio no ve nada; A no ve ni escribe B.
//   8. Plata: 8 envíos del mismo payment_id = 1 fila; 8 aplicaciones = 1 cobro; monto ≥ 0.
//   9. La reversa de N2_enums nombra TODAS las columnas de esos tipos (según pg_attribute).
//  10. Idempotencia: pasos 1–7 otra vez, CON datos → sin error, mismo diff, ninguna fila tocada.
//  11. Vecino: el reseteo de go-live REAL (src/lib/reset-golive-db.ts) y una purga del outbox
//      pasan con entregas de webhook colgando del evento (FK CASCADE, falla baja de la vuelta 1).
//  12. Reversa de cada archivo (la del pie, tal cual) → probes en false y diff = el de hoy;
//      y de nuevo el paquete → diff = línea de base.
//
// Sin `psql` en el PATH, cada .sql se ejecuta sentencia por sentencia en autocommit con `pg`,
// igual que `psql -v ON_ERROR_STOP=1 -f` (sin --single-transaction).
// En PGlite (GATE2_MOTOR=pglite) la concurrencia se serializa: se prueba el resultado, no la
// carrera. Por eso los roles y el negocio se ponen con SET LOCAL dentro de una transacción
// (PGlite comparte el estado de sesión entre conexiones; en Postgres real da lo mismo).
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
const PRISMA_CLI = path.join(RAIZ, "node_modules", "prisma", "build", "index.js");
const ES_PGLITE = process.env.GATE2_MOTOR === "pglite";

function esLocal(url: string): boolean {
  try {
    const h = new URL(url).hostname;
    return h === "localhost" || h === "127.0.0.1" || h === "::1" || h === "[::1]";
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
const CON_PSQL = !ES_PGLITE && tienePsql();

const motivoSalto = !URL_ADMIN
  ? "sin GATE2_PG_URL (Postgres local efímero)"
  : !esLocal(URL_ADMIN)
    ? "GATE2_PG_URL no es local: este test nunca corre contra Neon"
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

/**
 * Parte un .sql en sentencias como psql: respeta comentarios `--` y `/* *\/`, comillas simples y
 * dobles (con la comilla duplicada como escape) y bloques `$tag$ … $tag$`.
 */
function sentenciasSql(texto: string): string[] {
  const out: string[] = [];
  let actual = "";
  let i = 0;
  const n = texto.length;
  while (i < n) {
    const c = texto[i];
    const d = texto[i + 1];
    if (c === "-" && d === "-") {
      const fin = texto.indexOf("\n", i);
      i = fin < 0 ? n : fin;
      continue;
    }
    if (c === "/" && d === "*") {
      const fin = texto.indexOf("*/", i + 2);
      i = fin < 0 ? n : fin + 2;
      continue;
    }
    if (c === "'" || c === '"') {
      let j = i + 1;
      while (j < n) {
        if (texto[j] === c) {
          if (texto[j + 1] === c) {
            j += 2;
            continue;
          }
          break;
        }
        j++;
      }
      actual += texto.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    if (c === "$") {
      const m = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(texto.slice(i, i + 64));
      if (m) {
        const fin = texto.indexOf(m[0], i + m[0].length);
        const hasta = fin < 0 ? n : fin + m[0].length;
        actual += texto.slice(i, hasta);
        i = hasta;
        continue;
      }
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

/** Como `psql -v ON_ERROR_STOP=1 -f`: una conexión, autocommit, frena en el primer error. */
async function ejecutarComoPsql(archivo: string) {
  const c = new pg.Client({ connectionString: urlBase() });
  await c.connect();
  try {
    for (const s of sentenciasSql(readFileSync(archivo, "utf8"))) {
      try {
        await c.query(s);
      } catch (e) {
        throw new Error(`${path.basename(archivo)}: ${(e as Error).message}\n  en: ${s.slice(0, 160)}`);
      }
    }
  } finally {
    await c.end(); // con una transacción abierta (falló a mitad), el servidor la vuelve atrás
  }
}

async function psqlArchivo(archivo: string) {
  if (!CON_PSQL) return ejecutarComoPsql(archivo);
  execFileSync("psql", ["-q", "-X", "-v", "ON_ERROR_STOP=1", "-d", urlBase(), "-f", archivo], {
    stdio: ["ignore", "ignore", "pipe"],
  });
}
async function psqlSql(sql: string) {
  const f = path.join(tmp, `sql-${Math.random().toString(36).slice(2)}.sql`);
  writeFileSync(f, sql);
  await psqlArchivo(f);
}
async function aplicarPaquete() {
  for (const f of ORDEN) await psqlArchivo(path.join(PENDIENTES, f));
  await psqlArchivo(RLS_0001); // paso 7
}

/** Bloque de reversa del pie de un archivo, tal cual está escrito (sin el `--   `). */
function reversaDe(archivo: string): string {
  const lineas = readFileSync(path.join(PENDIENTES, archivo), "utf8").split(/\r?\n/);
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

const envPrisma = () => ({ ...process.env, DATABASE_URL: urlBase(), MIGRATE_DATABASE_URL: "" });

/** Diff de Prisma (base → schema). Normalizado: sin líneas vacías ni el aviso de config. */
function diffContra(schema: string): string {
  const out = execFileSync(
    process.execPath,
    [PRISMA_CLI, "migrate", "diff", "--from-config-datasource", "--to-schema", schema],
    { cwd: RAIZ, env: envPrisma(), encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  return out
    .split(/\r?\n/)
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
      debito: await p.hayValorEnum("PaymentMethod", "DEBITO"),
      credito: await p.hayValorEnum("PaymentMethod", "CREDITO"),
      encargado: await p.hayValorEnum("UserRole", "ENCARGADO"),
      transferenciaEnLibro: await p.hayValorEnum("CashMethod", "TRANSFERENCIA"),
      pago: await p.hayTabla("PagoExterno"),
      indice: await p.hayTabla("ClubReservaIndice"),
      limite: await p.hayColumna("Client", "limiteCredito"),
      // controles: lo que ya existe hoy
      outbox: await p.hayTabla("OutboxEvent"),
      efectivo: await p.hayValorEnum("PaymentMethod", "EFECTIVO"),
    };
  });
}

/**
 * Cliente como el rol de la app (sin bypass de RLS) con el negocio seteado, en UNA transacción
 * (SET LOCAL: no deja el rol puesto en la conexión; en PGlite la sesión es compartida).
 */
async function comoNegocio<T>(tenantId: string, fn: (c: pg.Client) => Promise<T>): Promise<T> {
  return conCliente(async (c) => {
    await c.query("BEGIN");
    try {
      await c.query(`SET LOCAL ROLE "${ROL}"`);
      await c.query("SELECT set_config('app.current_tenant_id', $1, true)", [tenantId]);
      const r = await fn(c);
      await c.query("COMMIT");
      return r;
    } catch (e) {
      await c.query("ROLLBACK").catch(() => {});
      throw e;
    }
  });
}

/**
 * Un INSERT mínimo por tabla nueva, a nombre de `tenantId`, con sus padres del mismo negocio.
 * Con literales (protocolo simple), no con $1: PGlite-socket desordena los mensajes cuando una
 * consulta PARAMETRIZADA falla (los "intrusos" de la prueba de RLS fallan a propósito). Los
 * valores son ids fijos de este test, sin comillas.
 */
function altaMinima(tabla: string, id: string, tenantId: string, padres: { conexion: string; suscripcion: string }): string {
  for (const v of [id, tenantId, padres.conexion, padres.suscripcion]) assert.match(v, /^[\w-]+$/);
  switch (tabla) {
    case "ApiKey":
      return `INSERT INTO "ApiKey"(id,"tenantId",nombre,prefijo,hash) VALUES ('${id}','${tenantId}','k','p-${id}','h-${id}')`;
    case "WebhookSuscripcion":
      return `INSERT INTO "WebhookSuscripcion"(id,"tenantId","conexionId",url) VALUES ('${id}','${tenantId}','${padres.conexion}','https://x.test/h')`;
    case "EntregaWebhook":
      return `INSERT INTO "EntregaWebhook"(id,"tenantId","suscripcionId",evento) VALUES ('${id}','${tenantId}','${padres.suscripcion}','prueba')`;
    case "PlantillaWhatsapp":
      return `INSERT INTO "PlantillaWhatsapp"(id,"tenantId","conexionId",clave,"nombreMeta") VALUES ('${id}','${tenantId}','${padres.conexion}','c-${id}','m')`;
    case "PagoExterno":
      return `INSERT INTO "PagoExterno"(id,"tenantId",proveedor,"idExterno",estado,monto) VALUES ('${id}','${tenantId}','mercadopago','x-${id}','approved',1)`;
    case "ClubReservaIndice":
      return `INSERT INTO "ClubReservaIndice"(id,"tenantId","reservaId","canchaId",inicio,fin,estado) VALUES ('${id}','${tenantId}','r-${id}','c1',now(),now(),'confirmada')`;
    default:
      throw new Error(tabla);
  }
}

/** xmin + ctid de cada fila: si un re-aplicado la reescribe o la actualiza, cambia. */
async function fotoDeFilas(): Promise<string> {
  return conCliente(async (c) => {
    const out: Record<string, unknown> = {};
    for (const t of [...TABLAS_NUEVAS, "OutboxEvent", "Tenant", "IntegracionConexion"]) {
      out[t] = (await c.query(`SELECT id, xmin::text AS x, ctid::text AS ct FROM "${t}" ORDER BY id`)).rows;
    }
    return JSON.stringify(out);
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
  execFileSync(process.execPath, [PRISMA_CLI, "migrate", "deploy"], { cwd: RAIZ, env: envPrisma(), stdio: "ignore" });

  try {
    await t.test("SIN el paquete: los probes contestan false (y true en lo que ya existe)", async () => {
      const p = await probes();
      assert.deepEqual(
        { ...p },
        { apiKey: false, clave: false, debito: false, credito: false, encargado: false, transferenciaEnLibro: false, pago: false, indice: false, limite: false, outbox: true, efectivo: true },
      );
      diffDeHoy = diffContra(schemaHoy);
      // Dos negocios y un evento del outbox de ANTES del paquete (como los de ARCA de hoy).
      await conCliente(async (c) => {
        await c.query(`INSERT INTO "Tenant"(id, name, slug, "updatedAt") VALUES
          ('s2-a','Negocio A','s2-a', now()), ('s2-b','Negocio B','s2-b', now())`);
        await c.query(`INSERT INTO "OutboxEvent"(id,"tenantId",type,payload) VALUES ('ev-viejo','s2-a','InvoiceCreated','{}'::jsonb)`);
      });
    });

    await t.test("línea de base: sólo el paso 1 (CarniceriaRubro, fuera de schema.prisma)", async () => {
      await psqlArchivo(path.join(PENDIENTES, "CarniceriaRubro.sql"));
      lineaDeBase = diffContra(schemaHoy);
    });

    await t.test("CON el paquete: probes en true y el schema descomentado no agrega diferencias (C5, C7)", async () => {
      await aplicarPaquete();
      const p = await probes();
      assert.ok(Object.values(p).every(Boolean), JSON.stringify(p));
      assert.equal(diffContra(schemaN2), lineaDeBase);
    });

    await t.test("D-C01: PaymentMethod queda con DEBITO y CREDITO separados, sin TARJETA", async () => {
      const r = await conCliente((c) =>
        c.query(`SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
                 WHERE t.typname = 'PaymentMethod' ORDER BY e.enumsortorder`),
      );
      assert.deepEqual(r.rows.map((x) => x.enumlabel), ["MERCADOPAGO", "EFECTIVO", "TRANSFERENCIA", "DEBITO", "CREDITO"]);
    });

    await t.test("OutboxEvent de antes del paquete: version=1 y clave NULL", async () => {
      const r = await conCliente((c) => c.query(`SELECT version, clave FROM "OutboxEvent" WHERE id = 'ev-viejo'`));
      assert.deepEqual(r.rows, [{ version: 1, clave: null }]);
    });

    await t.test("C2: FK a Tenant, índice por tenantId y policy repuesta por 0001; check-rls-live = 0", async () => {
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
      await psqlArchivo(RLS_0001);
      await conCliente(async (c) => {
        const r = await c.query(
          `SELECT c.relname FROM pg_class c JOIN pg_policies p ON p.tablename = c.relname
           WHERE p.policyname = 'tenant_isolation' AND c.relrowsecurity AND c.relname = ANY($1)`,
          [TABLAS_NUEVAS],
        );
        assert.deepEqual(r.rows.map((x) => x.relname).sort(), [...TABLAS_NUEVAS].sort());
      });
      // Paso 3 del runbook, tal cual (sólo lectura). Sale con 1 si hay drift → execFileSync tira.
      execFileSync(process.execPath, [path.join(RAIZ, "prisma/rls/check-rls-live.mjs")], {
        env: { ...process.env, RLS_AUDIT_DATABASE_URL: urlBase() },
        stdio: "ignore",
      });
    });

    await t.test("FK compuestas: nada apunta a la conexión, al evento o a la suscripción de OTRO negocio", async () => {
      await conCliente(async (c) => {
        await c.query(`CREATE ROLE "${ROL}" NOLOGIN NOBYPASSRLS`);
        await c.query(`GRANT USAGE ON SCHEMA public TO "${ROL}"`);
        await c.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO "${ROL}"`);
        await c.query(`INSERT INTO "IntegracionConexion"(id,"tenantId",conector,"updatedAt") VALUES
          ('conn-a','s2-a','webhook',now()), ('conn-b','s2-b','webhook',now())`);
        await c.query(`INSERT INTO "OutboxEvent"(id,"tenantId",type,payload) VALUES ('ev-b','s2-b','pedido.creado','{}'::jsonb)`);
        for (const [tenant, sufijoId, conexion] of [["s2-a", "a", "conn-a"], ["s2-b", "b", "conn-b"]] as const) {
          for (const tabla of TABLAS_NUEVAS) {
            await c.query(altaMinima(tabla, `${tabla}-${sufijoId}`, tenant, { conexion, suscripcion: `WebhookSuscripcion-${sufijoId}` }));
          }
        }
        const cruces: Array<[string, string, unknown[]]> = [
          ["suscripción → conexión de B", `INSERT INTO "WebhookSuscripcion"(id,"tenantId","conexionId",url) VALUES ('x1','s2-a','conn-b','https://x.test')`, []],
          ["plantilla → conexión de B", `INSERT INTO "PlantillaWhatsapp"(id,"tenantId","conexionId",clave,"nombreMeta") VALUES ('x2','s2-a','conn-b','k','m')`, []],
          ["PagoExterno → conexión de B", `INSERT INTO "PagoExterno"(id,"tenantId","conexionId",proveedor,"idExterno",estado,monto) VALUES ('x3','s2-a','conn-b','mercadopago','77','approved',1)`, []],
          ["entrega → evento de B", `INSERT INTO "EntregaWebhook"(id,"tenantId","suscripcionId","outboxEventId",evento) VALUES ('x4','s2-a','WebhookSuscripcion-a','ev-b','e')`, []],
          ["entrega → suscripción de B", `INSERT INTO "EntregaWebhook"(id,"tenantId","suscripcionId",evento) VALUES ('x5','s2-a','WebhookSuscripcion-b','e')`, []],
        ];
        for (const [que, sql, params] of cruces) {
          await assert.rejects(c.query(sql, params), /foreign key/, que);
        }
      });
    });

    await t.test("RLS con un rol sin bypass en las 6 tablas: sin negocio nada; A no ve ni escribe B", async () => {
      for (const tabla of TABLAS_NUEVAS) {
        const sin = await comoNegocio("", (c) => c.query(`SELECT count(*)::int AS n FROM "${tabla}"`));
        assert.equal(sin.rows[0].n, 0, `${tabla}: sin negocio no se ve nada`);
        const vistos = await comoNegocio("s2-a", (c) => c.query(`SELECT DISTINCT "tenantId" FROM "${tabla}"`));
        assert.deepEqual(vistos.rows.map((r) => r.tenantId), ["s2-a"], `${tabla}: A ve sólo lo suyo`);
        const sql = altaMinima(tabla, `${tabla}-intruso`, "s2-b", { conexion: "conn-b", suscripcion: "WebhookSuscripcion-b" });
        await assert.rejects(comoNegocio("s2-a", (c) => c.query(sql)), /row-level security/, `${tabla}: A no escribe en B`);
      }
    });

    await t.test("plata/datos: 8 envíos a la vez, un solo cobro, monto ≥ 0, dedupe del outbox", async () => {
      const altaPago = `INSERT INTO "PagoExterno"(id, "tenantId", proveedor, "idExterno", estado, monto, referencia)
        VALUES ($1, current_setting('app.current_tenant_id'), 'mercadopago', '999', 'approved', 15000.50, 'pedido:1')
        ON CONFLICT ("tenantId", proveedor, "idExterno") DO NOTHING RETURNING id`;
      const ocho = <T>(f: (k: number) => Promise<T>) => Promise.all(Array.from({ length: 8 }, (_, k) => f(k)));
      // Webhook repetido (8 procesos, mismo payment_id) → una fila.
      const altas = await ocho((k) => comoNegocio("s2-a", (c) => c.query(altaPago, [`pa-${k}`])));
      assert.equal(altas.reduce((n, r) => n + (r.rowCount ?? 0), 0), 1, "8 envíos = un PagoExterno");
      // El mismo payment_id en OTRO negocio es otro pago (no choca).
      const enB = await comoNegocio("s2-b", (c) => c.query(altaPago, ["pb-1"]));
      assert.equal(enB.rowCount, 1);
      // Aplicar el cobro 8 veces a la vez → un solo proceso lo aplica.
      const aplicar = `UPDATE "PagoExterno" SET "aplicadoEn" = now()
        WHERE proveedor = 'mercadopago' AND "idExterno" = '999' AND "aplicadoEn" IS NULL RETURNING id`;
      const aplicados = await ocho(() => comoNegocio("s2-a", (c) => c.query(aplicar)));
      assert.equal(aplicados.reduce((n, r) => n + (r.rowCount ?? 0), 0), 1, "un solo cobro aplicado");
      // El de B sigue sin aplicar: el UPDATE de A no lo alcanzó.
      const deB = await comoNegocio("s2-b", (c) => c.query(`SELECT "aplicadoEn" FROM "PagoExterno" WHERE "idExterno" = '999'`));
      assert.equal(deB.rows[0].aplicadoEn, null);
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
        const n = await c.query(`SELECT count(*)::int AS n FROM "ClubReservaIndice" WHERE "reservaId" = 'r1'`);
        assert.equal(n.rows[0].n, 1);
      });
    });

    await t.test("la reversa de N2_enums nombra TODAS las columnas de PaymentMethod/UserRole/CashMethod (pg_attribute)", async () => {
      const texto = readFileSync(path.join(PENDIENTES, "N2_enums.sql"), "utf8");
      const cols = await conCliente((c) =>
        c.query(`SELECT c.relname AS tabla, a.attname AS col, t.typname AS tipo
                 FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid
                 JOIN pg_namespace n ON n.oid = c.relnamespace JOIN pg_type t ON t.oid = a.atttypid
                 WHERE n.nspname = current_schema() AND c.relkind IN ('r','p') AND a.attnum > 0
                   AND NOT a.attisdropped
                   AND t.typname IN ('PaymentMethod','UserRole','CashMethod','_PaymentMethod','_UserRole','_CashMethod')
                 ORDER BY 1, 2`),
      );
      assert.ok(cols.rowCount && cols.rowCount >= 5, "hay columnas de esos tipos");
      for (const { tabla, col, tipo } of cols.rows as Array<{ tabla: string; col: string; tipo: string }>) {
        assert.ok(!tipo.startsWith("_"), `${tabla}.${col}: columna ARRAY de ${tipo}, la reversa no la contempla`);
        const c = /^[a-z_]+$/.test(col) ? `(?:"${col}"|${col})` : `"${col}"`;
        assert.match(texto, new RegExp(`FROM "${tabla}"\\s+WHERE ${c}::text IN`), `${tabla}.${col}: falta en el chequeo de uso`);
        assert.match(texto, new RegExp(`ALTER TABLE "${tabla}"\\s+ALTER COLUMN ${c} TYPE "${tipo}"`), `${tabla}.${col}: falta en la recreación`);
      }
      // El tipo que recrea la reversa = los valores de hoy, en su orden (sin los del paquete).
      for (const [tipo, nuevos] of [["PaymentMethod", ["DEBITO", "CREDITO"]], ["UserRole", ["REPARTIDOR", "ENCARGADO"]], ["CashMethod", ["TRANSFERENCIA"]]] as const) {
        const r = await conCliente((c) =>
          c.query(`SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = $1 ORDER BY e.enumsortorder`, [tipo]),
        );
        const deHoy = r.rows.map((x) => x.enumlabel as string).filter((v) => !(nuevos as readonly string[]).includes(v));
        assert.ok(texto.includes(`CREATE TYPE "${tipo}" AS ENUM (${deHoy.map((v) => `'${v}'`).join(",")});`), `${tipo}: CREATE TYPE de la reversa`);
      }
    });

    await t.test("idempotencia: el paquete otra vez, con datos, no falla, no cambia el diff ni toca filas", async () => {
      const antes = await fotoDeFilas();
      await aplicarPaquete();
      assert.equal(await fotoDeFilas(), antes, "ninguna fila reescrita ni actualizada");
      assert.equal(diffContra(schemaN2), lineaDeBase);
    });

    await t.test("vecino: el reseteo de go-live y la purga del outbox pasan con entregas colgando (FK CASCADE)", async () => {
      await conCliente(async (c) => {
        const fk = await c.query(`SELECT confdeltype FROM pg_constraint WHERE conname = 'EntregaWebhook_tenantId_outboxEventId_fkey'`);
        assert.deepEqual(fk.rows, [{ confdeltype: "c" }], "EntregaWebhook → OutboxEvent es ON DELETE CASCADE");
        await c.query(`INSERT INTO "OutboxEvent"(id,"tenantId",type,payload) VALUES ('ev-r','s2-a','pedido.creado','{}'::jsonb)`);
        await c.query(`INSERT INTO "EntregaWebhook"(id,"tenantId","suscripcionId","outboxEventId",evento,intento) VALUES
          ('ent-a','s2-a','WebhookSuscripcion-a','ev-r','pedido.creado',1),
          ('ent-a2','s2-a','WebhookSuscripcion-a','ev-viejo','InvoiceCreated',1),
          ('ent-b','s2-b','WebhookSuscripcion-b','ev-b','pedido.creado',1)`);
      });
      // El reseteo REAL (la misma secuencia que scripts/reset-golive.ts), como dueño de las tablas.
      process.env.DATABASE_URL = urlBase(); // módulos de la app que leen el entorno al importarse: base local
      const { PrismaPg } = await import("@prisma/adapter-pg");
      const { PrismaClient } = await import("@/generated/prisma/client");
      const { planificarReseteo } = await import("@/lib/reset-golive");
      const { aplicarPlan, leerFoto, tablasExistentes, verificarVacio } = await import("@/lib/reset-golive-db");
      const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: urlBase() }) });
      try {
        const opciones = { clientesCreadosDesde: null, conservarFuturo: false };
        const ahora = new Date();
        const r = await prisma.$transaction(
          async (tx) => {
            const tablas = await tablasExistentes(tx);
            const foto = await leerFoto(tx, "s2-a", tablas, ahora);
            const plan = planificarReseteo(foto, opciones);
            const res = await aplicarPlan(tx, "s2-a", plan, { opciones, frontera: foto.frontera, ahora });
            await verificarVacio(tx, "s2-a", tablas, opciones, ahora);
            return res;
          },
          { timeout: 120_000, maxWait: 60_000 },
        );
        assert.ok((r.borradas.OutboxEvent ?? 0) >= 3, JSON.stringify(r.borradas));
      } finally {
        await prisma.$disconnect();
      }
      await conCliente(async (c) => {
        const q = async (sql: string) => (await c.query(sql)).rows[0].n as number;
        assert.equal(await q(`SELECT count(*)::int AS n FROM "OutboxEvent" WHERE "tenantId" = 's2-a'`), 0);
        assert.equal(await q(`SELECT count(*)::int AS n FROM "EntregaWebhook" WHERE "tenantId" = 's2-a' AND "outboxEventId" IS NOT NULL`), 0);
        // La entrega de "probar envío" (sin evento) y las de B no se tocan.
        assert.equal(await q(`SELECT count(*)::int AS n FROM "EntregaWebhook" WHERE "tenantId" = 's2-a' AND "outboxEventId" IS NULL`), 1);
        assert.equal(await q(`SELECT count(*)::int AS n FROM "EntregaWebhook" WHERE "tenantId" = 's2-b'`), 2);
        // Purga del outbox (por antigüedad / operador): borra el evento y se lleva sus intentos.
        const purga = await c.query(`DELETE FROM "OutboxEvent" WHERE "tenantId" = 's2-b' AND id = 'ev-b'`);
        assert.equal(purga.rowCount, 1);
        assert.equal(await q(`SELECT count(*)::int AS n FROM "EntregaWebhook" WHERE id = 'ent-b'`), 0);
        assert.equal(await q(`SELECT count(*)::int AS n FROM "EntregaWebhook" WHERE "tenantId" = 's2-b'`), 1);
      });
    });

    await t.test("reversa de cada archivo (la del pie) y de nuevo el paquete", async () => {
      for (const f of ["N2_club_indice.sql", "N2_retail.sql", "N2_pagos.sql", "N2_hub.sql", "CarniceriaRubro.sql"]) {
        await psqlSql(reversaDe(f));
      }
      // N2_enums: la reversa del runbook es DEJAR los valores (Postgres no tiene DROP VALUE).
      const p = await probes();
      assert.deepEqual(
        { apiKey: p.apiKey, clave: p.clave, pago: p.pago, indice: p.indice, limite: p.limite, debito: p.debito, credito: p.credito },
        { apiKey: false, clave: false, pago: false, indice: false, limite: false, debito: true, credito: true },
      );
      assert.equal(diffContra(schemaSoloEnums), diffDeHoy, "tras la reversa, la base vuelve a la de hoy (+ los 4 valores de enum)");
      await aplicarPaquete();
      assert.equal(diffContra(schemaN2), lineaDeBase, "re-aplicado tras la reversa");
    });
  } finally {
    await conCliente(async (c) => {
      // En PGlite la "base" es la misma y el DROP puede no aplicar: lo que importa es no dejar nada
      // en un Postgres real; PGlite se va con su proceso.
      await c.query(`DROP DATABASE IF EXISTS "${BASE}" WITH (FORCE)`).catch((e) => {
        if (!ES_PGLITE) throw e;
      });
      await c.query(`DROP OWNED BY "${ROL}"`).catch(() => {});
      await c.query(`DROP ROLE IF EXISTS "${ROL}"`).catch((e) => {
        if (!ES_PGLITE) throw e;
      });
    }, URL_ADMIN);
    rmSync(tmp, { recursive: true, force: true });
  }
});
