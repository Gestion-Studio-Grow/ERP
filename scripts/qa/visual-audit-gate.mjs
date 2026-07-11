// ============================================================================
// GATE VISUAL · AUDITORÍA DE CALIDAD DB-BACKED — orquestador  ·  npm run gate:visual:aa
// ============================================================================
// Sube el listón del gate visual: además del smoke de layout (visual-smoke), MIDE
// contraste WCAG AA, touch targets y overflow (scripts/qa/visual-audit.mjs) sobre
// las rutas de /admin, el flujo de reserva/compra y la vidriera, EN LOS 4 TEMAS DE
// COLOR (un tenant por rubro), desktop + mobile. Si algo rompe AA → gate rojo.
//
// Self-contained y a costo cero (igual que `npm run demo`): levanta una base
// EFÍMERA en RAM (PGlite = Postgres en WASM, sin servidor ni Neon), aplica las
// migraciones, siembra los 4 tenants demo (estetica/servicios · magra/carnicería ·
// velas · padel) con sus subdominios, arranca `next start` con ruteo por subdominio
// (*.localhost) y secretos fijos para poder inyectar sesión de admin, corre la
// auditoría y baja todo. NO toca Neon ni prod, no deja residuo.
//
// Requisitos: `next build` ya corrido (lo hace la valla `build` antes de esta en
// `npm run gates`) y Chromium de Playwright (`npx playwright install chromium`).
// ============================================================================

import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { readFileSync, readdirSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import net from "node:net";
import http from "node:http";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const isWin = process.platform === "win32";
const DB_PORT = Number(process.env.AA_DB_PORT ?? 54330);
const APP_PORT = Number(process.env.AA_PORT ?? 3211);
const DB_URL = `postgresql://postgres:postgres@127.0.0.1:${DB_PORT}/postgres`;
const AUTH_SECRET = "visual-aa-auth-secret";
const OPERATOR_SECRET = "visual-aa-operator-secret";
const BASE_URL = `http://127.0.0.1:${APP_PORT}`;

const log = (m) => process.stdout.write(`\x1b[36m[gate:aa]\x1b[0m ${m}\n`);

function portInUse(port) {
  return new Promise((resolve) => {
    const s = net.connect(port, "127.0.0.1");
    s.setTimeout(800);
    s.once("connect", () => { s.destroy(); resolve(true); });
    s.once("timeout", () => { s.destroy(); resolve(false); });
    s.once("error", () => { s.destroy(); resolve(false); });
  });
}
function httpGet(p) {
  return new Promise((resolve) => {
    const req = http.get(`${BASE_URL}${p}`, { headers: { host: `estetica.localhost:${APP_PORT}` } }, (res) => {
      let b = ""; res.on("data", (c) => (b += c)); res.on("end", () => resolve({ status: res.statusCode, body: b }));
    });
    req.on("error", () => resolve(null));
    req.setTimeout(4000, () => { req.destroy(); resolve(null); });
  });
}
async function waitHealthy(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const r = await httpGet("/admin/login");
    if (r && r.status === 200 && /<link[^>]+rel="stylesheet"|\.css/i.test(r.body)) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}
async function applyMigrations(pg) {
  const dir = path.join(ROOT, "prisma", "migrations");
  const migs = readdirSync(dir).filter((d) => !d.startsWith("migration_lock")).sort();
  let n = 0;
  for (const m of migs) {
    let sql;
    try { sql = readFileSync(path.join(dir, m, "migration.sql"), "utf8"); } catch { continue; }
    await pg.exec(sql); n++;
  }
  log(`migraciones aplicadas in-process: ${n}`);
}
// Subproceso ASÍNCRONO (spawn + await, NO spawnSync): el PGLiteSocketServer corre en
// ESTE mismo event loop; con spawnSync el loop se congela y el socket no puede
// responder las queries del hijo → deadlock. Con spawn async el loop sigue vivo.
// useShell: npx/npm en Windows resuelven a .cmd → necesitan shell. node.exe (execPath)
// tiene espacio en la ruta ("C:\Program Files\…") → con shell:true se parte; va sin shell.
function runAsync(cmd, args, env, useShell = isWin) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { cwd: ROOT, stdio: "inherit", shell: useShell, env: { ...process.env, ...env } });
    p.on("exit", (code) => resolve(code ?? 1));
    p.on("error", reject);
  });
}
async function seed(script) {
  // Seeds serializados (SEED_DB_MAX=1): PGlite (WASM) no tolera queries concurrentes.
  const code = await runAsync("npx", ["tsx", `prisma/${script}`], { DATABASE_URL: DB_URL, SEED_DB_MAX: "1" });
  if (code !== 0) throw new Error(`seed ${script} falló (exit ${code})`);
}
function killTree(child) {
  if (!child || child.killed) return;
  if (isWin && child.pid) spawnSync("taskkill", ["/F", "/T", "/PID", String(child.pid)], { stdio: "ignore", shell: true });
  else child.kill("SIGTERM");
}

async function main() {
  if (await portInUse(APP_PORT)) { process.stderr.write(`❌ Puerto ${APP_PORT} ocupado. Pasá AA_PORT=<otro>.\n`); process.exit(1); }

  const db = new PGlite();
  await db.waitReady;
  const server = new PGLiteSocketServer({ db, port: DB_PORT, host: "127.0.0.1" });
  await server.start();
  log(`PGlite en 127.0.0.1:${DB_PORT}`);
  await applyMigrations(db);
  log("seed: tenants QA + magra …");
  await seed("seed-qa-tenants.ts");
  await seed("seed-magra.ts");

  // Fixture (tenant→ownerUserId) para que la auditoría firme la cookie de admin.
  // Query cruda sobre la MISMA instancia PGlite in-process (evita importar el cliente
  // Prisma generado, que es .ts y no se puede importar desde un .mjs de node).
  const { rows } = await db.query(
    `SELECT t.subdomain, t.slug, t."blueprintId", u.id AS "userId"
     FROM "Tenant" t
     LEFT JOIN "User" u ON u."tenantId" = t.id AND u.role = 'OWNER' AND u.active = true
     WHERE t.subdomain IS NOT NULL
     ORDER BY t.subdomain`,
  );
  const fixture = {
    authSecret: AUTH_SECRET, operatorSecret: OPERATOR_SECRET, appPort: APP_PORT,
    tenants: rows.map((t) => ({ subdomain: t.subdomain, slug: t.slug, blueprintId: t.blueprintId, userId: t.userId ?? null })),
  };
  const fxDir = mkdtempSync(path.join(tmpdir(), "aa-gate-"));
  const fxPath = path.join(fxDir, "qa-tenants.json");
  writeFileSync(fxPath, JSON.stringify(fixture, null, 2));
  log(`fixture: ${fixture.tenants.length} tenants (${fixture.tenants.map((t) => t.subdomain).join(", ")})`);

  const appEnv = {
    ...process.env,
    DATABASE_URL: DB_URL, DB_CONNECTION_LIMIT: "1",
    APP_BASE_DOMAIN: "localhost", AUTH_SECRET, OPERATOR_SECRET,
    OPERATOR_PASSWORD: process.env.OPERATOR_PASSWORD ?? "operador",
    PORT: String(APP_PORT), NODE_ENV: "production",
  };
  log(`next start en ${BASE_URL} …`);
  const app = spawn("npx", ["next", "start", "-p", String(APP_PORT)], { cwd: ROOT, env: appEnv, stdio: "inherit", shell: isWin });

  let code = 1;
  try {
    if (!(await waitHealthy(60000))) { process.stderr.write("❌ server no quedó sano en 60s (¿falta next build?).\n"); code = 1; }
    else {
      // Async (no spawnSync): `next start` sirve páginas que consultan el socket
      // PGlite in-process durante el render → el event loop debe quedar libre.
      code = await runAsync(process.execPath, [path.join(ROOT, "scripts/qa/visual-audit.mjs")], {
        BASE_HOST: "localhost", PORT: String(APP_PORT), FIXTURE: fxPath, OUT_DIR: path.join(ROOT, "qa-shots/audit"),
      }, false);
    }
  } finally {
    killTree(app);
    try { await server.stop(); } catch {}
    try { await db.close(); } catch {}
  }
  process.exit(code);
}

main().catch((e) => { console.error(e); process.exit(1); });
