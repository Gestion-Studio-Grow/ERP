// ============================================================================
// DEMO LOCAL DEL TALLER — todo en esta máquina, sin tocar Neon ni producción.
// ============================================================================
//
// Levanta un Postgres en memoria (PGlite), aplica TODAS las migraciones (incluida la del
// módulo taller), siembra Taller Mecánico AGR con datos de ejemplo y arranca la app.
// Al cerrar (Ctrl+C) la base desaparece: no queda nada instalado.
//
//   node scripts/taller/demo-local.mjs
//   → http://taller-agr.localhost:3217          (página pública)
//   → http://taller-agr.localhost:3217/admin    (ingreso: ver prisma/seed-taller-agr.ts)

import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { spawn } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DB_PORT = Number(process.env.TALLER_DB_PORT ?? 54337);
const APP_PORT = Number(process.env.PORT ?? 3217);
const DB_URL = `postgresql://postgres:postgres@127.0.0.1:${DB_PORT}/postgres`;
const isWin = process.platform === "win32";
const log = (m) => process.stdout.write(`[taller-demo] ${m}\n`);

// Async a propósito: el socket de PGlite vive en ESTE event loop; un spawnSync lo congelaría.
const correr = (cmd, args, env) =>
  new Promise((resolve) => {
    const p = spawn(cmd, args, { cwd: ROOT, stdio: "inherit", shell: isWin, env: { ...process.env, ...env } });
    p.on("exit", (code) => resolve(code ?? 1));
  });

const db = new PGlite();
await db.waitReady;
const server = new PGLiteSocketServer({ db, port: DB_PORT, host: "127.0.0.1" });
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

const code = await correr("npx", ["tsx", "prisma/seed-taller-agr.ts"], { DATABASE_URL: DB_URL, SEED_DB_MAX: "1" });
if (code !== 0) {
  log("❌ falló el seed");
  process.exit(1);
}

// Nota: el Inicio por apps ("Trabaja por apps") se prende desde la consola de GSG, en la ficha del
// negocio. Este script no lo toca a propósito: sólo la consola escribe ese interruptor.
// Sin prenderlo, al taller se entra por /admin/taller (o instalando la app en el celular).

const app = spawn("npx", ["next", "dev", "-p", String(APP_PORT)], {
  cwd: ROOT,
  stdio: "inherit",
  shell: isWin,
  env: {
    ...process.env,
    DATABASE_URL: DB_URL,
    DB_CONNECTION_LIMIT: "1",
    APP_BASE_DOMAIN: "localhost",
    AUTH_SECRET: process.env.AUTH_SECRET ?? "demo-local-del-taller-no-es-un-secreto-real-0123456789",
    OPERATOR_SECRET: process.env.OPERATOR_SECRET ?? "demo-local-del-taller-operador-no-es-secreto-0123456789",
    MODULE_REGISTRY_ENABLED: "on",
    PORT: String(APP_PORT),
  },
});
log(`app en http://taller-agr.localhost:${APP_PORT}  (panel: /admin)`);

const cerrar = () => {
  if (isWin && app.pid) spawn("taskkill", ["/F", "/T", "/PID", String(app.pid)], { stdio: "ignore", shell: true });
  else app.kill();
  server.stop().finally(() => process.exit(0));
};
process.on("SIGINT", cerrar);
process.on("SIGTERM", cerrar);
app.on("exit", () => server.stop().finally(() => process.exit(0)));
