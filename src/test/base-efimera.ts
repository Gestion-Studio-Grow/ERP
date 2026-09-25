// ============================================================================
// ARNÉS DE INTEGRACIÓN · Postgres efímero (ENG-000, docs/agent/BACKLOG.md)
// ============================================================================
//
// Cada test de integración corre contra una base PROPIA, recién hecha, igual que producción:
//
//   1. `CREATE DATABASE erp_test_<pid>_<aleatorio> OWNER neondb_owner` en un Postgres LOCAL.
//   2. `prisma migrate deploy` como `neondb_owner` (el dueño de las tablas, como en Neon).
//   3. `prisma/rls/0002_app_role.sql` (el rol `app_rls`, sin BYPASSRLS y sin ser dueño de nada) y
//      `prisma/rls/0001_enable_rls.sql` (una política por tabla con `tenantId`), tal cual están.
//   4. Dos negocios, A y B, con datos DISTINTOS en cantidad: si algo de B se cuela en A, se nota.
//   5. Al terminar se borra (`DROP DATABASE … WITH (FORCE)`), aunque el test falle.
//
// NUNCA toca una base existente: crea la suya y la borra. NUNCA sale de esta máquina: la URL del
// servidor pasa por la misma guarda que el seed (`src/lib/seed/guarda-base.ts`) antes de conectar.
//
// ── CÓMO SE USA ───────────────────────────────────────────────────────────────────────────────
//
//   import { test } from "node:test";
//   import { baseEfimeraParaElTest, apuntarLaAppA } from "@/test/base-efimera";
//
//   test("con la sesión de A no se ven filas de B", async (t) => {
//     const base = await baseEfimeraParaElTest(t);   // se borra sola al terminar `t`
//     if (!base) return;                              // sin Postgres local: saltea (en CI, FALLA)
//     apuntarLaAppA(base);                            // ANTES de importar módulos de la app
//     const { prisma } = await import("@/lib/prisma"); // import dinámico: lee el entorno recién puesto
//     ...
//   });
//
// Para varios tests del mismo archivo sobre UNA base (se crea con el primer test que la pide y se
// borra al terminar el archivo), en el nivel superior del archivo:
//
//   const laBase = baseEfimeraDelArchivo();
//   test("…", async (t) => { const base = await laBase(t); if (!base) return; … });
//
// Qué trae la base (`BaseEfimera`):
//   · `urlDuenio`: conexión como `neondb_owner`, dueño de las tablas → EXENTO de RLS (como la
//     consola del operador y las migraciones en producción). Para sembrar y para mirar "desde
//     afuera" lo que la app escribió.
//   · `urlApp`: conexión como `app_rls` → RLS aplicado. Es la de la app (`DATABASE_URL`).
//   · `a` y `b`: los dos negocios (`NegocioDePrueba`), con id, slug, subdominio y `host`
//     (`negocio-a.erp.test`), una dueña (OWNER) y una recepcionista (RECEPTION) con la clave
//     `CLAVE_DE_PRUEBA`, clientes (A: 2, B: 1) y pedidos (A: 3, B: 2). Los ids llevan una parte al
//     azar: ningún test puede depender de un id fijo.
//   · `alBorrar(fn)`: algo que tiene que pasar antes del DROP (cerrar clientes de Prisma).
//
// `apuntarLaAppA(base)` deja el entorno como el de producción con RLS: `DATABASE_URL` = app_rls,
// `OPERATOR_DATABASE_URL` = dueño, `RLS_ENFORCEMENT=on`, y el negocio se resuelve por el HOST del
// pedido (`APP_BASE_DOMAIN=erp.test`; se sacan `FORCE_TENANT_SLUG`, `TENANT_HOST_MAP` y el modo
// demo). Los módulos de la app leen el entorno AL IMPORTARSE (`prisma-base.ts`): por eso se
// importan después, con `await import(...)`. Cada archivo de test es su propio proceso.
// Para ejecutar una Server Action real con la sesión de un usuario: `src/test/accion-de-servidor.ts`.
//
// ── EL SERVIDOR ───────────────────────────────────────────────────────────────────────────────
//
// `ERP_TEST_PG_URL`: la URL de un superusuario en la base de mantenimiento del servidor. Por
// defecto, el Postgres local de esta máquina:
//   postgresql://postgres@localhost:5433/postgres?host=/tmp/pgrun
// En CI (`.github/workflows/gates.yml`, job `tests`) es un servicio Postgres 16 con autenticación
// `trust`. Los roles `neondb_owner` y `app_rls` se conectan SIN contraseña: el servidor de prueba
// tiene que aceptarlos así (socket local o `trust`). Si el servidor no tiene `neondb_owner`, el
// arnés lo crea (LOGIN, sin contraseña ni privilegios especiales); `app_rls` lo crea 0002.
//
// Sin servidor: fuera de CI el test se SALTEA diciendo por qué; con `CI` puesta (GitHub la pone
// siempre) FALLA, porque en CI un test de base salteado es un test que no corrió.
//
// Diferencias con producción, a sabiendas: 0002 y 0001 los aplica el superusuario local (en Neon
// los aplica `neondb_owner`, que allá puede crear roles); el servidor es Postgres 16 local, no el
// pooler de Neon.
//
// Si un proceso de test muere sin borrar su base (lo mataron, se colgó), la próxima creación la
// barre: el nombre lleva el pid del proceso que la creó, y se borran las de procesos que ya no
// existen. Nunca se toca una base que no empiece con `erp_test_`.
// ============================================================================

import { after, type TestContext } from "node:test";
import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";
import { baseLocalParaSeed } from "@/lib/seed/guarda-base";
import { hashPassword } from "@/lib/auth-password";

export const URL_POR_DEFECTO = "postgresql://postgres@localhost:5433/postgres?host=/tmp/pgrun";
export const DOMINIO_DE_PRUEBA = "erp.test";
export const CLAVE_DE_PRUEBA = "clave-de-prueba-1234";
export const ROL_DUENIO = "neondb_owner";
export const ROL_APP = "app_rls";

const RAIZ = path.resolve(__dirname, "..", "..");
const PRISMA_CLI = path.join(RAIZ, "node_modules", "prisma", "build", "index.js");
const PREFIJO = "erp_test_";
const NOMBRE_DE_BASE = /^erp_test_(\d+)_[0-9a-f]+$/;
/** Candado entre procesos para crear roles del servidor (dos archivos de test a la vez). */
const CANDADO_DE_ROLES = 7_300_000_001;

export interface UsuarioDePrueba {
  id: string;
  tenantId: string;
  nombre: string;
  email: string;
  rol: "OWNER" | "RECEPTION";
}

export interface NegocioDePrueba {
  id: string;
  slug: string;
  nombre: string;
  subdominio: string;
  /** El host con el que la app resuelve este negocio (`APP_BASE_DOMAIN` = erp.test). */
  host: string;
  duenia: UsuarioDePrueba;
  recepcion: UsuarioDePrueba;
  /** Ids de sus clientes (A: 2, B: 1). */
  clientes: string[];
  /** Ids de sus pedidos (A: 3, B: 2). */
  pedidos: string[];
}

export interface BaseEfimera {
  nombre: string;
  /** Como `neondb_owner`: dueño de las tablas, exento de RLS. */
  urlDuenio: string;
  /** Como `app_rls`: sin BYPASSRLS, con RLS aplicado. */
  urlApp: string;
  a: NegocioDePrueba;
  b: NegocioDePrueba;
  /** Algo que tiene que pasar antes de borrar la base (cerrar conexiones propias). */
  alBorrar(fn: () => unknown): void;
  /** Borra la base. Idempotente. */
  borrar(): Promise<void>;
}

/** No hay un Postgres local al que conectarse. */
export class SinPostgres extends Error {
  constructor(motivo: string) {
    super(motivo);
    this.name = "SinPostgres";
  }
}

// ── Piezas puras ─────────────────────────────────────────────────────────────

/** La URL del servidor: `ERP_TEST_PG_URL` o el Postgres local por defecto. */
export function urlDelServidor(env: Record<string, string | undefined> = process.env): string {
  return env.ERP_TEST_PG_URL?.trim() || URL_POR_DEFECTO;
}

/** La misma conexión, con otro rol (sin contraseña) y otra base. Conserva `?host=` y el puerto. */
export function urlDeRol(urlServidor: string, rol: string | null, base: string): string {
  const u = new URL(urlServidor);
  if (rol) {
    u.username = rol;
    u.password = "";
  }
  u.pathname = `/${base}`;
  return u.toString();
}

/** Sin Postgres: en CI se falla (un test de base que no corre no prueba nada); fuera, se saltea. */
export function queHacerSinPostgres(env: Record<string, string | undefined> = process.env): "fallar" | "saltear" {
  const ci = env.CI?.trim().toLowerCase();
  return ci && ci !== "false" && ci !== "0" ? "fallar" : "saltear";
}

/** El pid que creó una base del arnés, o null si el nombre no es de una base del arnés. */
export function pidDeLaBase(nombre: string): number | null {
  const m = NOMBRE_DE_BASE.exec(nombre);
  return m ? Number(m[1]) : null;
}

function procesoVivo(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // EPERM: existe, pero es de otro usuario.
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}

const idDe = (prefijo: string) => `${prefijo}_${randomBytes(5).toString("hex")}`;
const ident = (nombre: string) => `"${nombre.replace(/"/g, '""')}"`;

// ── Creación ─────────────────────────────────────────────────────────────────

/**
 * Crea la base, la migra, le aplica RLS y siembra A y B. Tira `SinPostgres` si el servidor no
 * responde. Quien la crea la borra (`borrar()`); los envoltorios de abajo lo hacen solos.
 */
export async function crearBaseEfimera(env: Record<string, string | undefined> = process.env): Promise<BaseEfimera> {
  const servidor = urlDelServidor(env);
  const guarda = baseLocalParaSeed(servidor);
  if (!guarda.ok) {
    const host = (() => {
      try {
        const u = new URL(servidor);
        return u.searchParams.get("host") || u.hostname || "(sin host)";
      } catch {
        return "(URL ilegible)";
      }
    })();
    throw new Error(
      `ERP_TEST_PG_URL apunta a ${host}, que no es un Postgres de esta máquina. El arnés crea y ` +
        "borra bases: sólo corre contra un servidor local.",
    );
  }

  const admin = new pg.Client({ connectionString: servidor, connectionTimeoutMillis: 3000 });
  try {
    await admin.connect();
  } catch (err) {
    await admin.end().catch(() => {});
    throw new SinPostgres(`sin Postgres en ${urlDeRol(servidor, null, "postgres")}: ${(err as Error).message}`);
  }

  const nombre = `${PREFIJO}${process.pid}_${randomBytes(4).toString("hex")}`;
  const urlDuenio = urlDeRol(servidor, ROL_DUENIO, nombre);
  const urlApp = urlDeRol(servidor, ROL_APP, nombre);
  const alBorrarse: Array<() => unknown> = [];
  let creada = false;
  let borrada = false;

  const borrar = async () => {
    if (borrada) return;
    borrada = true;
    try {
      for (const fn of alBorrarse.splice(0).reverse()) {
        await Promise.race([Promise.resolve().then(fn), new Promise((ok) => setTimeout(ok, 5000).unref())]).catch(() => {});
      }
      if (creada) await admin.query(`DROP DATABASE IF EXISTS ${ident(nombre)} WITH (FORCE)`);
    } finally {
      await admin.end().catch(() => {});
    }
  };

  // Los roles son del SERVIDOR, no de la base: dos archivos de test que los crean a la vez chocan
  // ("role already exists"). Lo que crea roles o barre bases de otros procesos va con un candado
  // entre procesos.
  const conCandado = async (fn: () => Promise<void>) => {
    await admin.query("SELECT pg_advisory_lock($1)", [CANDADO_DE_ROLES]);
    try {
      await fn();
    } finally {
      await admin.query("SELECT pg_advisory_unlock($1)", [CANDADO_DE_ROLES]).catch(() => {});
    }
  };

  try {
    await conCandado(async () => {
      await barrerHuerfanas(admin);
      // El dueño de las tablas en producción. En el Postgres local ya existe; en el de CI no.
      await admin.query(`DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${ROL_DUENIO}') THEN
          CREATE ROLE ${ROL_DUENIO} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
        END IF;
      END $$`);
    });
    await admin.query(`CREATE DATABASE ${ident(nombre)} OWNER ${ROL_DUENIO}`);
    creada = true;

    const migracion = await correr(process.execPath, [PRISMA_CLI, "migrate", "deploy"], {
      ...process.env,
      ...env,
      DATABASE_URL: urlDuenio,
      MIGRATE_DATABASE_URL: urlDuenio,
    });
    if (migracion.codigo !== 0) throw new Error(`prisma migrate deploy falló en ${nombre}:\n${migracion.salida}`);

    const comoAdmin = urlDeRol(servidor, null, nombre);
    // 0002 crea `app_rls` si no existe.
    await conCandado(() => aplicarSql(comoAdmin, "prisma/rls/0002_app_role.sql"));
    await aplicarSql(comoAdmin, "prisma/rls/0001_enable_rls.sql");

    const [a, b] = await sembrarNegocios(urlDuenio);
    return {
      nombre,
      urlDuenio,
      urlApp,
      a,
      b,
      alBorrar: (fn) => {
        alBorrarse.push(fn);
      },
      borrar,
    };
  } catch (err) {
    await borrar().catch(() => {});
    throw err;
  }
}

/** Borra las bases del arnés cuyo proceso creador ya no existe. */
async function barrerHuerfanas(admin: pg.Client): Promise<string[]> {
  const { rows } = await admin.query<{ datname: string }>(
    `SELECT datname FROM pg_database WHERE datname LIKE 'erp\\_test\\_%'`,
  );
  const barridas: string[] = [];
  for (const { datname } of rows) {
    const pid = pidDeLaBase(datname);
    if (pid === null || pid === process.pid || procesoVivo(pid)) continue;
    await admin.query(`DROP DATABASE IF EXISTS ${ident(datname)} WITH (FORCE)`);
    barridas.push(datname);
  }
  return barridas;
}

async function aplicarSql(url: string, archivo: string): Promise<void> {
  const sql = readFileSync(path.join(RAIZ, archivo), "utf8");
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  try {
    await c.query(sql);
  } catch (err) {
    throw new Error(`${archivo} falló: ${(err as Error).message}`);
  } finally {
    await c.end();
  }
}

function correr(cmd: string, args: string[], env: Record<string, string | undefined>): Promise<{ codigo: number; salida: string }> {
  return new Promise((ok) => {
    execFile(cmd, args, { cwd: RAIZ, env: env as NodeJS.ProcessEnv, timeout: 180_000, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      const codigo = err ? (typeof err.code === "number" ? err.code : 1) : 0;
      ok({ codigo, salida: `${stdout}${stderr}${err && !stderr ? String(err) : ""}` });
    });
  });
}

// ── Siembra ──────────────────────────────────────────────────────────────────

async function sembrarNegocios(urlDuenio: string): Promise<[NegocioDePrueba, NegocioDePrueba]> {
  const hash = await hashPassword(CLAVE_DE_PRUEBA);
  const armar = (letra: "a" | "b", clientes: number, pedidos: number): NegocioDePrueba => {
    const id = idDe(`tnt_${letra}`);
    const subdominio = `negocio-${letra}`;
    const L = letra.toUpperCase();
    const usuario = (rol: UsuarioDePrueba["rol"], quien: string): UsuarioDePrueba => ({
      id: idDe(`usr_${letra}`),
      tenantId: id,
      nombre: `${quien} ${L}`,
      email: `${quien.toLowerCase()}@${subdominio}.${DOMINIO_DE_PRUEBA}`,
      rol,
    });
    return {
      id,
      slug: subdominio,
      nombre: `Negocio ${L} (prueba)`,
      subdominio,
      host: `${subdominio}.${DOMINIO_DE_PRUEBA}`,
      duenia: usuario("OWNER", "Duenia"),
      recepcion: usuario("RECEPTION", "Recepcion"),
      clientes: Array.from({ length: clientes }, () => idDe(`cli_${letra}`)),
      pedidos: Array.from({ length: pedidos }, () => idDe(`ped_${letra}`)),
    };
  };
  const negocios: [NegocioDePrueba, NegocioDePrueba] = [armar("a", 2, 3), armar("b", 1, 2)];

  const c = new pg.Client({ connectionString: urlDuenio });
  await c.connect();
  try {
    await c.query("BEGIN");
    for (const n of negocios) {
      await c.query(`INSERT INTO "Tenant" (id, name, slug, subdomain, "updatedAt") VALUES ($1, $2, $3, $4, now())`, [
        n.id,
        n.nombre,
        n.slug,
        n.subdominio,
      ]);
      for (const u of [n.duenia, n.recepcion]) {
        await c.query(
          `INSERT INTO "User" (id, "tenantId", name, email, "passwordHash", role, "updatedAt")
           VALUES ($1, $2, $3, $4, $5, $6::"UserRole", now())`,
          [u.id, n.id, u.nombre, u.email, hash, u.rol],
        );
      }
      for (const [i, id] of n.clientes.entries()) {
        await c.query(`INSERT INTO "Client" (id, "tenantId", name, phone, "updatedAt") VALUES ($1, $2, $3, $4, now())`, [
          id,
          n.id,
          `Cliente ${i + 1} de ${n.nombre}`,
          `11${n.subdominio === "negocio-a" ? "1" : "2"}000000${i}`,
        ]);
      }
      for (const [i, id] of n.pedidos.entries()) {
        await c.query(
          `INSERT INTO "Order" (id, "tenantId", code, "customerName", "customerPhone", "updatedAt")
           VALUES ($1, $2, $3, $4, '', now())`,
          [id, n.id, i + 1, `Mostrador ${n.nombre}`],
        );
      }
    }
    await c.query("COMMIT");
  } catch (err) {
    await c.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    await c.end();
  }
  return negocios;
}

// ── Envoltorios para node:test ───────────────────────────────────────────────

function sinPostgres(t: TestContext, err: SinPostgres, env: Record<string, string | undefined>): null {
  if (queHacerSinPostgres(env) === "fallar") {
    throw new Error(`${err.message}. En CI el job tiene que levantar Postgres (ERP_TEST_PG_URL): el test de base no puede saltearse.`);
  }
  t.skip(`${err.message}: la parte de base queda SIN verificar`);
  return null;
}

/** Una base para este test: se borra al terminar `t`, aunque falle. Sin Postgres: `null` (y `t` salteado; en CI, falla). */
export async function baseEfimeraParaElTest(t: TestContext, env: Record<string, string | undefined> = process.env): Promise<BaseEfimera | null> {
  let base: BaseEfimera;
  try {
    base = await crearBaseEfimera(env);
  } catch (err) {
    if (err instanceof SinPostgres) return sinPostgres(t, err, env);
    throw err;
  }
  t.after(() => base.borrar());
  return base;
}

/**
 * Una base compartida por los tests de UN archivo: se crea la primera vez que un test la pide y se
 * borra al terminar el archivo. Se llama en el nivel superior del archivo (registra el `after`).
 */
export function baseEfimeraDelArchivo(env: Record<string, string | undefined> = process.env): (t: TestContext) => Promise<BaseEfimera | null> {
  let creando: Promise<BaseEfimera> | null = null;
  after(async () => {
    const base = await creando?.catch(() => null);
    await base?.borrar();
  });
  return async (t) => {
    creando ??= crearBaseEfimera(env);
    try {
      return await creando;
    } catch (err) {
      if (err instanceof SinPostgres) return sinPostgres(t, err, env);
      throw err;
    }
  };
}

// ── La app contra la base ────────────────────────────────────────────────────

/**
 * Deja el entorno del proceso como el de producción con RLS, contra esta base. Llamala ANTES de
 * importar módulos de la app. Al borrar la base se cierran los clientes de Prisma de la app.
 */
export function apuntarLaAppA(base: BaseEfimera, env: Record<string, string | undefined> = process.env): void {
  Object.assign(env, {
    DATABASE_URL: base.urlApp,
    OPERATOR_DATABASE_URL: base.urlDuenio,
    MIGRATE_DATABASE_URL: base.urlDuenio,
    RLS_ENFORCEMENT: "on",
    APP_BASE_DOMAIN: DOMINIO_DE_PRUEBA,
  });
  for (const v of ["FORCE_TENANT_SLUG", "TENANT_HOST_MAP", "DEMO_MODE_ENABLED"]) delete env[v];
  base.alBorrar(async () => {
    const [{ basePrisma }, { operatorPrisma }] = await Promise.all([import("@/lib/prisma-base"), import("@/lib/operator-db")]);
    await Promise.all([basePrisma.$disconnect(), operatorPrisma.$disconnect()]);
  });
}
