// ============================================================================
// QA CLIC POR CLIC — sesión que no vence + PIN de desbloqueo (GSG-SEG-003, orden del dueño del 08/11/2026)
// ============================================================================
// Sobre una base LOCAL (Postgres del contenedor, nunca Neon): migra, siembra los tenants QA, arranca la app ya
// buildeada (`next start`) y recorre con Playwright, como una persona:
//   1. entrar con la contraseña → se ofrece elegir el PIN → lo elige → cae en el panel
//   2. renovación: con 6 min sin reemitir, el uso reemite la cookie
//   3. BLOQUEO: 20 min sin uso → pantalla del PIN → PIN correcto → vuelve a donde iba
//   4. PIN errado ×5 → «quedan 4…1» → al quinto, login con «Erraste el PIN 5 veces» → con la contraseña, el PIN vuelve
//   5. 7 DÍAS sin uso → login con «Tu sesión venció»
//   6. USUARIO SIN PIN → bloqueo → login con «Tapamos la pantalla»
// El paso del tiempo se simula firmando la cookie con la actividad en el pasado (mismo AUTH_SECRET que la app).
// Uso: QA_DB_URL=postgresql://postgres@localhost:5433/qa_pin?host=/tmp/pgrun node scripts/qa/_qa-sesion-pin.mjs
// (la base tiene que existir vacía; requiere `next build` previo). Capturas en qa-shots/sesion-pin/ (no se versionan).
// ============================================================================

import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { createHmac } from "node:crypto";
import { mkdirSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DB_URL = process.env.QA_DB_URL;
if (!DB_URL || /neon|amazonaws|vercel/i.test(DB_URL)) throw new Error("QA_DB_URL local obligatoria (nunca Neon)");
const APP_PORT = Number(process.env.QA_PORT ?? 3217);
const AUTH_SECRET = "qa-sesion-pin-auth-secret";
const BASE = `http://estetica.localhost:${APP_PORT}`;
const OUT = path.join(ROOT, "qa-shots", "sesion-pin");
const MIN = 60_000;
const DIA = 24 * 60 * MIN;
const log = (m) => process.stdout.write(`[qa-pin] ${m}\n`);
let fallas = 0;
const check = (ok, que) => {
  log(`${ok ? "OK  " : "FALLA"} ${que}`);
  if (!ok) fallas++;
};

function run(cmd, args, env) {
  return new Promise((res) => {
    const p = spawn(cmd, args, { cwd: ROOT, stdio: "inherit", env: { ...process.env, ...env } });
    p.on("exit", (c) => res(c ?? 1));
  });
}

const trece = (n) => String(n).padStart(13, "0");
function cookieV3(userId, actividad, ingreso = actividad) {
  const payload = `v3|${userId}|${trece(ingreso)}|${trece(actividad)}`;
  return `${payload}.${createHmac("sha256", AUTH_SECRET).update(`gsg-sesion-v3|${payload}`).digest("hex")}`;
}

function sano(ms) {
  const hasta = Date.now() + ms;
  return new Promise((res) => {
    const probar = () =>
      http
        .get(`${BASE}/admin/login`, (r) => { r.resume(); res(true); })
        .on("error", () => (Date.now() > hasta ? res(false) : setTimeout(probar, 500)));
    probar();
  });
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  if ((await run("npx", ["prisma", "migrate", "deploy"], { DATABASE_URL: DB_URL, MIGRATE_DATABASE_URL: DB_URL })) !== 0) throw new Error("migrate");
  if ((await run("npx", ["tsx", "prisma/seed-qa-tenants.ts"], { DATABASE_URL: DB_URL, SEED_DB_MAX: "1" })) !== 0) throw new Error("seed");

  const db = new pg.Client({ connectionString: DB_URL });
  await db.connect();
  const { rows } = await db.query(
    `SELECT u.id, u.email, u."tenantId" FROM "Tenant" t JOIN "User" u ON u."tenantId" = t.id AND u.role='OWNER'
     WHERE t.subdomain = 'estetica' LIMIT 1`,
  );
  const owner = rows[0];
  log(`owner ${owner.email}`);

  const app = spawn("npx", ["next", "start", "-p", String(APP_PORT)], {
    cwd: ROOT,
    stdio: ["ignore", "ignore", "inherit"],
    env: { ...process.env, DATABASE_URL: DB_URL, OPERATOR_DATABASE_URL: DB_URL, APP_BASE_DOMAIN: "localhost", AUTH_SECRET, OPERATOR_SECRET: "qa-op", NODE_ENV: "production" },
  });
  try {
    if (!(await sano(90_000))) throw new Error("la app no levantó");
    const browser = await chromium.launch();
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    const foto = (n) => page.screenshot({ path: path.join(OUT, `${n}.png`), fullPage: true });
    const ponerCookie = async (valor) => {
      await ctx.clearCookies();
      await ctx.addCookies([{ url: BASE, name: "admin_session", value: valor, httpOnly: true }]);
    };
    const cookieActual = async () => (await ctx.cookies(BASE)).find((c) => c.name === "admin_session");
    const entrarConClave = async (next = "/admin") => {
      await page.goto(`${BASE}/admin/login?next=${encodeURIComponent(next)}`);
      await page.fill('input[name="email"]', owner.email);
      await page.fill('input[name="password"]', "ERP");
      await page.click('button[type="submit"]');
      await page.waitForLoadState("networkidle");
    };

    // 1 · contraseña → elegir PIN
    await entrarConClave();
    check(new URL(page.url()).pathname === "/admin/definir-pin", `tras la clave se ofrece el PIN (${page.url()})`);
    await foto("01-elegir-pin");
    await page.fill("#pin", "1234");
    await page.fill("#confirmacion", "1234");
    await page.click('button[type="submit"]');
    await page.getByRole("alert").waitFor();
    check(/escalera/.test(await page.getByRole("alert").innerText()), "1234 se rechaza (escalera)");
    await page.fill("#pin", "4826");
    await page.fill("#confirmacion", "4826");
    await page.click('button[type="submit"]');
    await page.waitForURL((u) => !u.pathname.startsWith("/admin/definir-pin"));
    check(new URL(page.url()).pathname.startsWith("/admin"), `PIN guardado, al panel (${new URL(page.url()).pathname})`);
    const fila = (await db.query(`SELECT "pinHash", fallos FROM "UserPin" WHERE "userId" = $1`, [owner.id])).rows[0];
    check(!!fila && fila.pinHash.startsWith("scrypt$") && !fila.pinHash.includes("4826"), "PIN guardado con scrypt, nunca en claro");
    await foto("02-panel");

    // 2 · renovación con el uso
    await ponerCookie(cookieV3(owner.id, Date.now() - 6 * MIN, Date.now() - 2 * DIA));
    const antes = (await cookieActual()).value;
    await page.goto(`${BASE}/admin`);
    const despues = await cookieActual();
    check(despues.value !== antes && Number(despues.value.split("|")[3].slice(0, 13)) > Date.now() - MIN, "con 6 min, el uso reemite la cookie con la actividad en ahora");
    check(despues.expires - Date.now() / 1000 > 6.9 * 24 * 3600, "la cookie dura 7 días");

    // 3 · bloqueo → PIN correcto
    await ponerCookie(cookieV3(owner.id, Date.now() - 20 * MIN, Date.now() - 2 * DIA));
    await page.goto(`${BASE}/admin/clientes`);
    check(new URL(page.url()).pathname === "/admin/login/desbloquear", `20 min sin uso → pantalla del PIN (${page.url()})`);
    await foto("03-bloqueada");
    await page.fill("#pin", "4826");
    await page.click('button[type="submit"]');
    await page.waitForURL((u) => !u.pathname.startsWith("/admin/login"));
    check(new URL(page.url()).pathname === "/admin/clientes", `PIN correcto → vuelve a donde iba (${new URL(page.url()).pathname})`);

    // 4 · PIN errado ×5
    await ponerCookie(cookieV3(owner.id, Date.now() - 20 * MIN, Date.now() - 2 * DIA));
    await page.goto(`${BASE}/admin`);
    for (let i = 1; i <= 4; i++) {
      await page.fill("#pin", "0007");
      await page.click('button[type="submit"]');
      await page.getByRole("alert").filter({ hasText: `${5 - i === 1 ? "queda 1 intento" : `quedan ${5 - i} intentos`}` }).waitFor();
      check(true, `PIN errado ${i}: quedan ${5 - i}`);
      if (i === 1) await foto("04-pin-errado");
    }
    await page.fill("#pin", "0007");
    await page.click('button[type="submit"]');
    await page.waitForURL((u) => u.pathname === "/admin/login");
    check(new URL(page.url()).searchParams.get("error") === "pin", "al quinto, al login con error=pin");
    check(/Erraste el PIN 5 veces/.test(await page.locator("main").innerText()), "el login dice «Erraste el PIN 5 veces»");
    check(!(await cookieActual()), "se borró la cookie");
    await foto("05-login-tras-5");
    // Otra copia de la cookie bloqueada tampoco sirve con el PIN correcto.
    await ponerCookie(cookieV3(owner.id, Date.now() - 20 * MIN, Date.now() - 2 * DIA));
    await page.goto(`${BASE}/admin`);
    check(new URL(page.url()).pathname === "/admin/login" && new URL(page.url()).searchParams.get("error") === "pin", "sin intentos, ni la pantalla del PIN aparece");
    await entrarConClave();
    check((await db.query(`SELECT fallos FROM "UserPin" WHERE "userId" = $1`, [owner.id])).rows[0].fallos === 0, "con la contraseña, los intentos vuelven a 0");

    // 5 · 7 días
    await ponerCookie(cookieV3(owner.id, Date.now() - 7 * DIA - MIN, Date.now() - 9 * DIA));
    await page.goto(`${BASE}/admin`);
    check(new URL(page.url()).searchParams.get("error") === "vencida", "7 días sin uso → login con error=vencida");
    check(/Tu sesión venció/.test(await page.locator("main").innerText()), "el login dice «Tu sesión venció»");
    await foto("06-siete-dias");

    // 6 · usuario sin PIN
    await db.query(`DELETE FROM "UserPin" WHERE "userId" = $1`, [owner.id]);
    await ponerCookie(cookieV3(owner.id, Date.now() - 20 * MIN, Date.now() - 2 * DIA));
    await page.goto(`${BASE}/admin`);
    check(new URL(page.url()).searchParams.get("error") === "inactiva", "sin PIN → login con error=inactiva");
    check(/Tapamos la pantalla/.test(await page.locator("main").innerText()), "el login lo explica");
    await foto("07-sin-pin");

    // 6b · el PIN no se puede elegir con una sesión sin contraseña reciente
    await ponerCookie(cookieV3(owner.id, Date.now(), Date.now() - 2 * 60 * MIN));
    await page.goto(`${BASE}/admin/definir-pin`);
    check((await page.locator("#pin").count()) === 0, "sin contraseña reciente no aparece el formulario del PIN");
    await foto("08-pin-sin-clave-reciente");

    await browser.close();
  } finally {
    app.kill("SIGTERM");
    await db.end();
  }
  log(fallas ? `${fallas} FALLAS` : "TODO OK");
  process.exit(fallas ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
