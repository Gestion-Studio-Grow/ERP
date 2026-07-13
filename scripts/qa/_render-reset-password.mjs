// ============================================================================
// RENDER REAL — reset de contraseña con revelado único (evidencia visual)
// ============================================================================
// Levanta la app buildeada sobre una base EFÍMERA en RAM (PGlite), aplica migraciones
// + la migración Gate-2 `MustChangePassword.sql` (para que la columna exista), siembra
// los tenants QA, arranca `next start` con secretos fijos e inyecta sesión, y captura
// con Playwright las DOS pantallas nuevas + el flujo completo:
//   01  ficha del tenant (operador) — tarjeta "Contraseña del OWNER", estado inicial
//   02  ficha tras resetear — REVELADO ÚNICO de la temporal + copiar
//   03  /admin/cambiar-password — el portón de cambio forzado (redirigido desde /admin)
// NO toca Neon ni prod. Modelado sobre scripts/qa/visual-audit-gate.mjs. Prefijo "_"
// para que NO lo levante el test-runner. Uso: node scripts/qa/_render-reset-password.mjs
// ============================================================================

import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { chromium } from "playwright";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { readFileSync, readdirSync, mkdirSync } from "node:fs";
import { createHmac } from "node:crypto";
import net from "node:net";
import http from "node:http";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const isWin = process.platform === "win32";
const DB_PORT = Number(process.env.RP_DB_PORT ?? 54331);
const APP_PORT = Number(process.env.RP_PORT ?? 3212);
const DB_URL = `postgresql://postgres:postgres@127.0.0.1:${DB_PORT}/postgres`;
const AUTH_SECRET = "render-rp-auth-secret";
const OPERATOR_SECRET = "render-rp-operator-secret";
const BASE = `http://estetica.localhost:${APP_PORT}`;
const OUT = path.join(ROOT, "qa-shots", "reset-password");
const log = (m) => process.stdout.write(`\x1b[36m[render-rp]\x1b[0m ${m}\n`);

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
    // Conectamos a 127.0.0.1 (Node no resuelve *.localhost en Windows) con Host header del
    // subdominio. Chromium/Playwright sí resuelve *.localhost → la navegación usa BASE.
    const req = http.get(`http://127.0.0.1:${APP_PORT}${p}`, { headers: { host: `estetica.localhost:${APP_PORT}` } }, (res) => {
      let b = ""; res.on("data", (c) => (b += c)); res.on("end", () => resolve({ status: res.statusCode, body: b }));
    });
    req.on("error", () => resolve(null));
    req.setTimeout(4000, () => { req.destroy(); resolve(null); });
  });
}
// MODO: 'operador' (ficha + reveal, usa solo operatorPrisma) o 'admin' (cambiar-password, usa
// solo el prisma de la app). Se corre en DOS pasadas porque PGLiteSocketServer sirve UNA sola
// conexión: mezclar los dos pools (app + operador) en una pasada tira P1017.
const MODE = process.env.RP_MODE === "admin" ? "admin" : "operador";
const HEALTH_PATH = MODE === "admin" ? "/admin/login" : "/operador/login";

async function waitHealthy(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const r = await httpGet(HEALTH_PATH);
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
  // Gate-2: la columna del flag (fuera de prisma/migrations, se aplica a mano acá).
  await pg.exec(readFileSync(path.join(ROOT, "prisma", "pending-gate2", "MustChangePassword.sql"), "utf8"));
  log(`migraciones aplicadas: ${n} + MustChangePassword (Gate-2)`);
}
function runAsync(cmd, args, env, useShell = isWin) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { cwd: ROOT, stdio: "inherit", shell: useShell, env: { ...process.env, ...env } });
    p.on("exit", (code) => resolve(code ?? 1));
    p.on("error", reject);
  });
}
async function seed(script) {
  const code = await runAsync("npx", ["tsx", `prisma/${script}`], { DATABASE_URL: DB_URL, SEED_DB_MAX: "1" });
  if (code !== 0) throw new Error(`seed ${script} falló (exit ${code})`);
}
function killTree(child) {
  if (!child || child.killed) return;
  if (isWin && child.pid) spawnSync("taskkill", ["/F", "/T", "/PID", String(child.pid)], { stdio: "ignore", shell: true });
  else child.kill("SIGTERM");
}
const adminCookie = (userId) => `${userId}.${createHmac("sha256", AUTH_SECRET).update(userId).digest("hex")}`;
const operatorCookie = () => `operator.${createHmac("sha256", OPERATOR_SECRET).update("operator").digest("hex")}`;

async function main() {
  mkdirSync(OUT, { recursive: true });
  if (await portInUse(APP_PORT)) { process.stderr.write(`❌ Puerto ${APP_PORT} ocupado.\n`); process.exit(1); }

  const db = new PGlite();
  await db.waitReady;
  // DOS socket servers sobre la MISMA base en RAM: cada PGLiteSocketServer sirve UNA conexión,
  // y la ficha del operador usa DOS pools (app-prisma del root layout + operatorPrisma del page).
  // Uno para DATABASE_URL, otro para OPERATOR_DATABASE_URL → sin P1017.
  const server = new PGLiteSocketServer({ db, port: DB_PORT, host: "127.0.0.1" });
  await server.start();
  const server2 = new PGLiteSocketServer({ db, port: DB_PORT + 1, host: "127.0.0.1" });
  await server2.start();
  const OP_DB_URL = `postgresql://postgres:postgres@127.0.0.1:${DB_PORT + 1}/postgres`;
  log(`PGlite en 127.0.0.1:${DB_PORT} (+ operador ${DB_PORT + 1})`);
  await applyMigrations(db);
  await seed("seed-qa-tenants.ts");

  const { rows } = await db.query(
    `SELECT t.id, t.subdomain, u.id AS "userId", u.email
     FROM "Tenant" t JOIN "User" u ON u."tenantId" = t.id AND u.role='OWNER' AND u.active=true
     WHERE t.subdomain = 'estetica' LIMIT 1`,
  );
  if (!rows.length) throw new Error("no encontré el tenant estetica con OWNER");
  const tenant = rows[0];
  log(`tenant estetica: id=${tenant.id} owner=${tenant.email}`);

  const appEnv = {
    ...process.env,
    DATABASE_URL: DB_URL, OPERATOR_DATABASE_URL: OP_DB_URL, DB_CONNECTION_LIMIT: "1",
    APP_BASE_DOMAIN: "localhost", AUTH_SECRET, OPERATOR_SECRET,
    OPERATOR_PASSWORD: "operador", PORT: String(APP_PORT), NODE_ENV: "production",
  };
  log(`next start en ${BASE} …`);
  const app = spawn("npx", ["next", "start", "-p", String(APP_PORT)], { cwd: ROOT, env: appEnv, stdio: "inherit", shell: isWin });

  let ok = false;
  try {
    if (!(await waitHealthy(60000))) throw new Error("server no quedó sano en 60s (¿falta next build?)");
    const browser = await chromium.launch();
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();

    if (MODE === "operador") {
      await ctx.addCookies([{ url: BASE, name: "operator_session", value: operatorCookie() }]);

      // 01 — ficha del tenant (estado inicial: contraseña definitiva)
      await page.goto(`${BASE}/operador/tenants/${tenant.id}`, { waitUntil: "networkidle" });
      await page.getByRole("heading", { name: "Contraseña del OWNER" }).scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(OUT, "01-ficha-antes.png"), fullPage: true });
      log("01-ficha-antes.png");

      // 02 — resetear → revelado único
      await page.getByRole("button", { name: "Resetear contraseña del OWNER" }).click();
      await page.getByRole("button", { name: "Sí, resetear" }).click();
      await page.getByText("se muestra", { exact: false }).first().waitFor({ timeout: 15000 });
      await page.getByRole("heading", { name: "Contraseña del OWNER" }).scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(OUT, "02-ficha-revelado.png"), fullPage: true });
      log("02-ficha-revelado.png");

      // 04 — reset MASIVO (todos los OWNER) → tabla revelada una sola vez + copiar todo
      await page.goto(`${BASE}/operador`, { waitUntil: "networkidle" });
      await page.getByRole("button", { name: "Resetear TODOS los OWNER (primer uso)" }).click();
      await page.getByRole("button", { name: /Sí, resetear los/ }).click();
      await page.getByText("se muestran", { exact: false }).first().waitFor({ timeout: 20000 });
      await page.getByRole("button", { name: "Copiar todo" }).scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(OUT, "04-reset-todos.png"), fullPage: true });
      log("04-reset-todos.png");
    } else {
      // Marca el flag directo en la DB (en la pasada admin no usamos operatorPrisma) y entra a
      // /admin como el OWNER → el portón de cambio forzado redirige a /admin/cambiar-password.
      await db.query(`UPDATE "User" SET "mustChangePassword" = true WHERE id = $1`, [tenant.userId]);
      await ctx.addCookies([{ url: BASE, name: "admin_session", value: adminCookie(tenant.userId) }]);
      await page.goto(`${BASE}/admin`, { waitUntil: "networkidle" });
      await page.getByRole("heading", { name: "Definí tu contraseña" }).waitFor({ timeout: 15000 });
      const finalUrl = page.url();
      if (!finalUrl.includes("/admin/cambiar-password")) throw new Error(`esperaba redirect a cambiar-password, fui a ${finalUrl}`);
      await page.screenshot({ path: path.join(OUT, "03-cambiar-password.png"), fullPage: true });
      log(`03-cambiar-password.png (redirigido a ${finalUrl})`);
    }

    await browser.close();
    ok = true;
  } finally {
    killTree(app);
    try { await server.stop(); } catch {}
    try { await server2.stop(); } catch {}
    try { await db.close(); } catch {}
  }
  log(ok ? "✅ render OK — screenshots en qa-shots/reset-password/" : "❌ render falló");
  process.exit(ok ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
