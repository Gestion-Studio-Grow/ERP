// ============================================================================
// PRUEBA LOCAL DEL CRM COMERCIAL — todo en esta máquina, sin tocar Neon ni producción (GSG-CRM-011 parte 3).
// ============================================================================
//
// Molde: scripts/proyectos/demo-local.mjs. Levanta un Postgres en memoria (PGlite), aplica TODAS las
// migraciones (incluidas las del CRM, que en producción siguen sin aplicar), siembra el negocio ficticio, prende
// el interruptor «crm-comercial», da de alta Dirección, dos comerciales y un usuario por puesto, carga los leads
// y los clientes activos de la prueba, y arranca la app. Al cerrar (Ctrl+C) la base desaparece.
//
//   node scripts/crm-comercial/prueba-local.mjs            → app en http://mia-producciones.localhost:3219/admin
//   node scripts/crm-comercial/prueba-local.mjs --sin-app  → prepara, informa y sale (para contar lo cargado)
//   node scripts/crm-comercial/prueba-local.mjs --solo-base → prepara y deja la base viva, sin app (operar por comandos)
//   node scripts/crm-comercial/prueba-local.mjs --start    → sirve la compilación (antes, `npx next build`)
//
// Mientras corre, una sesión opera como un puesto con (otra terminal):
//   DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54339/postgres \
//     npx tsx scripts/crm-comercial/operar.ts --como puesto-verificador@crm-prueba.example tomar-tarea
// Usuarios, clave local y comandos: docs/crm-comercial/PRUEBA.md. RLS: PGlite corre como superusuario (sin
// RLS); el aislamiento y las carreras se prueban en Postgres real (src/lib/crm-comercial/*-postgres.test.ts).

import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { spawn } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DB_PORT = Number(process.env.CRM_DB_PORT ?? 54339);
const APP_PORT = Number(process.env.PORT ?? 3219);
const DB_URL = `postgresql://postgres:postgres@127.0.0.1:${DB_PORT}/postgres`;
const SLUG = "mia-producciones";
const isWin = process.platform === "win32";
const log = (m) => process.stderr.write(`[crm-prueba] ${m}\n`);

// Async a propósito: el socket de PGlite vive en ESTE event loop; un spawnSync lo congelaría.
const correr = (cmd, args, env, capturar = false) =>
  new Promise((resolve) => {
    const p = spawn(cmd, args, { cwd: ROOT, stdio: capturar ? ["ignore", "pipe", "inherit"] : "inherit", shell: isWin, env: { ...process.env, ...env } });
    let out = "";
    if (capturar) p.stdout.on("data", (d) => (out += d));
    p.on("exit", (code) => resolve({ code: code ?? 1, out }));
  });

const db = new PGlite();
await db.waitReady;
const server = new PGLiteSocketServer({ db, port: DB_PORT, host: "127.0.0.1", maxConnections: 8 });
await server.start();
log(`base en memoria en 127.0.0.1:${DB_PORT}`);

const dir = path.join(ROOT, "prisma", "migrations");
let n = 0;
for (const m of readdirSync(dir).filter((d) => !d.startsWith("migration_lock")).sort()) {
  let sql;
  try {
    sql = readFileSync(path.join(dir, m, "migration.sql"), "utf8");
  } catch {
    continue;
  }
  await db.exec(sql);
  n++;
}
log(`migraciones aplicadas: ${n}`);
// GSG-CRM-018: la tabla de apoyo de la prueba no es una migración (no va a producción); sólo existe acá.
await db.exec(readFileSync(path.join(ROOT, "scripts", "crm-comercial", "local", "filas-de-prueba.sql"), "utf8"));
log("tabla de apoyo de la prueba: lista (sólo en esta base)");

const fin = async (code) => {
  await server.stop().catch(() => {});
  process.exit(code);
};

const seed = await correr("npx", ["tsx", "prisma/seed-mia-producciones.ts"], { DATABASE_URL: DB_URL, SEED_DB_MAX: "1" });
if (seed.code !== 0) {
  log("❌ falló el seed");
  await fin(1);
}

const prep = await correr("npx", ["tsx", "scripts/crm-comercial/preparar-local.ts", "--negocio", SLUG], { DATABASE_URL: DB_URL, DB_CONNECTION_LIMIT: "1" }, true);
let informe = null;
try {
  informe = JSON.parse(prep.out);
} catch {
  /* se informa abajo */
}
if (prep.code !== 0 || !informe?.ok) {
  log(`❌ no se pudo preparar la prueba: ${informe?.motivo ?? prep.out.slice(0, 500)}`);
  await fin(1);
}
const c = informe.carga;
const porResultado = c.leads.reduce((a, l) => ((a[l.resultado] = (a[l.resultado] ?? 0) + 1), a), {});
log(`usuarios: ${informe.usuarios.map((u) => u.email).join(", ")}`);
log(`clientes activos: ${c.clientes.length} · leads: ${c.leads.length} (${JSON.stringify(porResultado)})`);
log(`oportunidades de prueba: ${c.oportunidadesDePrueba} · por etapa: ${JSON.stringify(c.porEtapa)}`);

if (process.argv.includes("--sin-app")) {
  process.stdout.write(`${JSON.stringify(informe, null, 2)}\n`);
  await fin(0);
}

if (process.argv.includes("--solo-base")) {
  // Sin app: la base queda viva para operar por comandos (scripts/crm-comercial/operar.ts) hasta Ctrl+C.
  log(`base lista para operar: ${DB_URL} (Ctrl+C para cerrarla)`);
  process.on("SIGINT", () => fin(0));
  process.on("SIGTERM", () => fin(0));
  await new Promise(() => {});
}

const modo = process.argv.includes("--start") ? "start" : "dev";
const app = spawn("npx", ["next", modo, "-p", String(APP_PORT)], {
  cwd: ROOT,
  stdio: "inherit",
  shell: isWin,
  env: {
    ...process.env,
    DATABASE_URL: DB_URL,
    DB_CONNECTION_LIMIT: "1",
    APP_BASE_DOMAIN: "localhost",
    AUTH_SECRET: process.env.AUTH_SECRET ?? "prueba-local-del-crm-no-es-un-secreto-real-0123456789",
    OPERATOR_SECRET: process.env.OPERATOR_SECRET ?? "prueba-local-del-crm-operador-no-es-secreto-0123456789",
    MODULE_REGISTRY_ENABLED: "on",
    PORT: String(APP_PORT),
  },
});
log(`app en http://${SLUG}.localhost:${APP_PORT}/admin · base para operar: ${DB_URL}`);

const cerrar = () => {
  if (isWin && app.pid) spawn("taskkill", ["/F", "/T", "/PID", String(app.pid)], { stdio: "ignore", shell: true });
  else app.kill();
  server.stop().finally(() => process.exit(0));
};
process.on("SIGINT", cerrar);
process.on("SIGTERM", cerrar);
app.on("exit", () => server.stop().finally(() => process.exit(0)));
