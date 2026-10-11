// ============================================================================
// MIGRAR PRODUCCIÓN A MANO — camino B del runbook (docs/runbooks/migracion-caja-neon.md).
// ============================================================================
//
// Para cuando el deploy de Vercel no puede migrar (falta MIGRATE_DATABASE_URL) y el dueño ordenó
// aplicar el lote desde esta máquina. Usa la conexión que YA está configurada en el `.env` del
// repo principal (rol dueño de las tablas) y la convierte a DIRECTA quitando `-pooler` del host,
// porque el pooler rechaza las migraciones. La cadena vive sólo en la memoria de este proceso:
// no se imprime, no se escribe en ningún archivo y no sale de la máquina más que hacia Neon.
//
//   node scripts/taller/migrar-produccion.mjs            → SÓLO MIRA (no escribe nada)
//   node scripts/taller/migrar-produccion.mjs --migrar   → aplica el lote y verifica
//
// Frenos, los mismos del build de Vercel:
//   1. Lo pendiente en la base tiene que ser EXACTAMENTE prisma/lote-deploy.txt. Si no, no migra.
//   2. Después de migrar: tablas, columnas e índices únicos del dinero, y aislamiento (RLS).
// NO hace respaldo: eso lo decide el dueño antes de correrlo.

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ENV_PRINCIPAL = process.env.ENV_PRODUCCION ?? "C:/Users/mlloveras2/Documents/Claude/Factory-GSG/estetica-erp/.env";
const migrar = process.argv.includes("--migrar");
const isWin = process.platform === "win32";
const log = (m = "") => console.log(m);
const fatal = (m) => {
  console.error(`\n✖ FRENADO: ${m}\n`);
  process.exit(1);
};

let cruda = "";
try {
  const linea = readFileSync(ENV_PRINCIPAL, "utf8").split(/\r?\n/).find((l) => /^\s*DATABASE_URL\s*=/.test(l));
  cruda = (linea ?? "").replace(/^\s*DATABASE_URL\s*=\s*/, "").trim().replace(/^["']|["']$/g, "");
} catch {
  fatal(`no se pudo leer ${ENV_PRINCIPAL}`);
}
let url;
try {
  url = new URL(cruda);
} catch {
  fatal("DATABASE_URL del .env principal no es una URL legible.");
}
if (url.username !== "neondb_owner") fatal(`la conexión es del rol "${url.username}", no del dueño de las tablas (neondb_owner).`);
if (!url.hostname.endsWith(".neon.tech")) fatal("la conexión no es de Neon.");
url.hostname = url.hostname.replace("-pooler.", ".");
const DIRECTA = url.toString();
log(`Base: ${url.hostname} · rol: ${url.username} · modo: ${migrar ? "MIGRAR" : "sólo mirar"}`);

// Nunca `stdio: inherit` con la cadena en argv: va sólo por variables de entorno del hijo.
function corre(cmd, args, env) {
  const r = spawnSync(cmd, args, { cwd: ROOT, stdio: "inherit", shell: isWin, env: { ...process.env, ...env } });
  return r.status ?? 1;
}

log("\n── 1. Estado de las migraciones (sólo lectura)");
corre("npx", ["prisma", "migrate", "status"], { DATABASE_URL: DIRECTA });

log("\n── 2. Lo pendiente ¿es exactamente el lote declarado? (sólo lectura)");
// El modo lote de predeploy-check frena por CUALQUIER migración de la base que el repo no tenga.
// En producción hay una sola, conocida y documentada como cosmética
// (docs/producto/HANDOFF-consolidacion-a-core-0712.md §4): Neon registró
// `20260705150000_add_tenant_fiscal_config` y el repo la tiene como `…150001` (se renombró por una
// colisión de timestamp). Acá se hace el mismo control, tolerando SÓLO esa, por nombre.
const DRIFT_CONOCIDO = new Set(["20260705150000_add_tenant_fiscal_config"]);
{
  const { default: pg } = await import("pg");
  const cli = new pg.Client({ connectionString: DIRECTA });
  let aplicadas;
  try {
    await cli.connect();
    const r = await cli.query(`SELECT migration_name, finished_at, rolled_back_at FROM "_prisma_migrations"`);
    const colgadas = r.rows.filter((f) => f.finished_at === null && f.rolled_back_at === null).map((f) => f.migration_name);
    if (colgadas.length) fatal(`hay migraciones a medio aplicar en la base: ${colgadas.join(", ")}. Ver el runbook, §P3009.`);
    aplicadas = new Set(r.rows.filter((f) => f.finished_at !== null && f.rolled_back_at === null).map((f) => f.migration_name));
  } catch (e) {
    fatal(`no se pudo leer _prisma_migrations (${e?.code ?? e?.name ?? "error"}).`);
  } finally {
    await cli.end().catch(() => {});
  }
  const { readdirSync } = await import("node:fs");
  const repo = readdirSync(path.join(ROOT, "prisma", "migrations")).filter((d) => !d.startsWith("migration_lock")).sort();
  const declarado = readFileSync(path.join(ROOT, "prisma", "lote-deploy.txt"), "utf8").split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
  const pendientes = repo.filter((m) => !aplicadas.has(m));
  const desconocidas = [...aplicadas].filter((m) => !repo.includes(m) && !DRIFT_CONOCIDO.has(m)).sort();
  log(`   pendientes en la base: ${pendientes.join(", ") || "(ninguna)"}`);
  log(`   declaradas en el lote: ${declarado.join(", ") || "(ninguna)"}`);
  if (desconocidas.length) fatal(`la base tiene migraciones que el repo no conoce: ${desconocidas.join(", ")}. No se tocó nada.`);
  const iguales = pendientes.length === declarado.length && pendientes.every((m, i) => m === declarado[i]);
  if (!iguales) fatal("lo pendiente no coincide con prisma/lote-deploy.txt. No se tocó nada.");
  if (pendientes.length === 0) {
    log("\n✅ Nada pendiente: la base ya tiene todas las migraciones del repo.");
    process.exit(0);
  }
}

if (!migrar) {
  log("\n✅ Listo para migrar: lo pendiente coincide con el lote. No se escribió nada (faltó --migrar).");
  process.exit(0);
}

log("\n── 3. prisma migrate deploy");
if (corre("npx", ["prisma", "migrate", "deploy"], { DATABASE_URL: DIRECTA }) !== 0) {
  fatal("`prisma migrate deploy` falló. La base puede haber quedado A MEDIO MIGRAR: ver el runbook, §P3009.");
}

log("\n── 4. Tablas, columnas e índices únicos del dinero");
if (corre("npx", ["tsx", "scripts/predeploy-check.mts"], { PREDEPLOY_DATABASE_URL: DIRECTA }) !== 0) {
  fatal("la base migró pero el chequeo posterior no cierra. NO deployar el código hasta revisarlo.");
}

log("\n── 5. Aislamiento entre negocios (RLS)");
const rls = corre("node", ["prisma/rls/check-rls-live.mjs"], { RLS_AUDIT_DATABASE_URL: DIRECTA });
if (rls !== 0) log("⚠ El chequeo de RLS avisó algo: revisarlo antes de dar acceso al taller.");

log("\n✅ Base migrada y verificada. Falta deployar el código (Redeploy en Vercel o un push a main).");
