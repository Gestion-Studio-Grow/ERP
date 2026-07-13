// ============================================================================
// RENDER REAL — Monitor de Soporte (evidencia visual + errores en criollo)
// ============================================================================
// Levanta la app buildeada sobre una base EFÍMERA en RAM (PGlite, 2 sockets como la
// ficha del operador), aplica TODAS las migraciones, siembra los tenants QA + DATOS
// FISCALES de prueba (outbox pendiente/fallido con errores reales de ARCA, facturas
// rechazadas, credenciales con y sin mismatch), y captura /operador/monitor con
// Playwright. Modelado sobre _render-reset-password.mjs. NO toca Neon ni prod.
// Uso: node scripts/qa/_render-monitor.mjs
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
const DB_PORT = Number(process.env.MON_DB_PORT ?? 54341);
const APP_PORT = Number(process.env.MON_PORT ?? 3214);
const DB_URL = `postgresql://postgres:postgres@127.0.0.1:${DB_PORT}/postgres`;
const OP_DB_URL = `postgresql://postgres:postgres@127.0.0.1:${DB_PORT + 1}/postgres`;
const AUTH_SECRET = "render-mon-auth-secret";
const OPERATOR_SECRET = "render-mon-operator-secret";
const BASE = `http://estetica.localhost:${APP_PORT}`;
const OUT = path.join(ROOT, "qa-shots", "monitor");
const log = (m) => process.stdout.write(`\x1b[36m[render-mon]\x1b[0m ${m}\n`);

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
    const req = http.get(`http://127.0.0.1:${APP_PORT}${p}`, { headers: { host: `estetica.localhost:${APP_PORT}` } }, (res) => {
      let b = ""; res.on("data", (c) => (b += c)); res.on("end", () => resolve({ status: res.statusCode, body: b }));
    });
    req.on("error", () => resolve(null));
    req.setTimeout(4000, () => { req.destroy(); resolve(null); });
  });
}
async function waitHealthy(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const r = await httpGet("/operador/login");
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
  log(`migraciones aplicadas: ${n}`);
}
function runAsync(cmd, args, env) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { cwd: ROOT, stdio: "inherit", shell: isWin, env: { ...process.env, ...env } });
    p.on("exit", (code) => resolve(code ?? 1));
    p.on("error", reject);
  });
}
function killTree(child) {
  if (!child || child.killed) return;
  if (isWin && child.pid) spawnSync("taskkill", ["/F", "/T", "/PID", String(child.pid)], { stdio: "ignore", shell: true });
  else child.kill("SIGTERM");
}
const operatorCookie = () => `operator.${createHmac("sha256", OPERATOR_SECRET).update("operator").digest("hex")}`;

// Auditor in-page (contraste WCAG AA · touch targets · overflow). COPIA EXACTA de
// scripts/qa/visual-audit.mjs (mismo umbral, misma lógica) para auditar /operador/monitor,
// que el gate:visual:aa no cubre (solo mira /admin + vidriera). Corre en el navegador.
function auditInPage() {
  const parseColor = (str) => {
    if (!str) return null;
    const m = str.match(/rgba?\(([^)]+)\)/i);
    if (!m) return null;
    const p = m[1].split(",").map((s) => parseFloat(s));
    return { r: p[0], g: p[1], b: p[2], a: p[3] === undefined ? 1 : p[3] };
  };
  const over = (fg, bg) => ({ r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a) });
  const lum = ({ r, g, b }) => { const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const ratio = (c1, c2) => { const l1 = lum(c1), l2 = lum(c2), hi = Math.max(l1, l2), lo = Math.min(l1, l2); return (hi + 0.05) / (lo + 0.05); };
  const isHidden = (el) => { const cs = getComputedStyle(el); if (cs.display === "none" || cs.visibility === "hidden" || parseFloat(cs.opacity) === 0) return true; const r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return true; return false; };
  const effectiveBg = (el) => {
    const stack = []; let node = el;
    while (node && node.nodeType === 1) { const cs = getComputedStyle(node); if (cs.backgroundImage && cs.backgroundImage !== "none") return { overImage: true }; const c = parseColor(cs.backgroundColor); if (c && c.a > 0) { stack.push(c); if (c.a >= 1) break; } node = node.parentElement; }
    let base = { r: 255, g: 255, b: 255 };
    const htmlBg = parseColor(getComputedStyle(document.documentElement).backgroundColor);
    if (htmlBg && htmlBg.a >= 1) base = { r: htmlBg.r, g: htmlBg.g, b: htmlBg.b };
    for (let i = stack.length - 1; i >= 0; i--) base = over(stack[i], base);
    return { color: base };
  };
  const cssPath = (el) => { const parts = []; let node = el; for (let i = 0; node && node.nodeType === 1 && i < 4; i++) { let s = node.tagName.toLowerCase(); if (node.id) { s += "#" + node.id; parts.unshift(s); break; } const cls = (node.className && typeof node.className === "string") ? node.className.trim().split(/\s+/).slice(0, 2).join(".") : ""; if (cls) s += "." + cls; parts.unshift(s); node = node.parentElement; } return parts.join(" > "); };
  const contrastFails = []; let overImageCount = 0; let textNodesChecked = 0; const seen = new Set();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
  while (walker.nextNode()) {
    const el = walker.currentNode;
    const direct = Array.from(el.childNodes).filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join(" ").trim();
    if (direct.length < 2) continue;
    if (isHidden(el)) continue;
    if (el.closest('button:disabled, input:disabled, select:disabled, textarea:disabled, fieldset:disabled, [aria-disabled="true"], [data-disabled="true"]')) continue;
    const cs = getComputedStyle(el); const fg = parseColor(cs.color); if (!fg || fg.a === 0) continue;
    const bg = effectiveBg(el); if (bg.overImage) { overImageCount++; continue; }
    const fgOpaque = over(fg, bg.color); const cr = ratio(fgOpaque, bg.color); textNodesChecked++;
    const size = parseFloat(cs.fontSize); const weight = parseInt(cs.fontWeight) || 400;
    const large = size >= 24 || (size >= 18.66 && weight >= 700); const threshold = large ? 3.0 : 4.5;
    if (cr < threshold - 0.05) { const key = cssPath(el) + "|" + Math.round(cr * 100); if (seen.has(key)) continue; seen.add(key); contrastFails.push({ selector: cssPath(el), text: direct.slice(0, 60), ratio: Math.round(cr * 100) / 100, threshold, large, fontPx: Math.round(size * 10) / 10, weight, color: cs.color, bg: `rgb(${Math.round(bg.color.r)},${Math.round(bg.color.g)},${Math.round(bg.color.b)})` }); }
  }
  const AA_MIN = 24, COMFORT_MIN = 44; const touchFails = []; const touchWarn = [];
  const interactive = document.querySelectorAll('button, select, [role="button"], [role="switch"], summary, input[type="button"], input[type="submit"], input[type="reset"]');
  for (const el of interactive) {
    if (isHidden(el)) continue;
    if (el.closest('button:disabled, [aria-disabled="true"], [data-disabled="true"]')) continue;
    const r = el.getBoundingClientRect(); const minSide = Math.min(r.width, r.height); if (minSide <= 0) continue;
    const rec = { selector: cssPath(el), text: (el.textContent || el.getAttribute("aria-label") || el.getAttribute("name") || "").trim().slice(0, 40), w: Math.round(r.width), h: Math.round(r.height) };
    if (minSide < AA_MIN) touchFails.push(rec); else if (minSide < COMFORT_MIN) touchWarn.push(rec);
  }
  const de = document.documentElement; const overflow = { scrollWidth: de.scrollWidth, innerWidth: window.innerWidth, offenders: [] };
  if (de.scrollWidth > window.innerWidth + 2) { const all = document.body.querySelectorAll("*"); for (const el of all) { const r = el.getBoundingClientRect(); if (r.right > window.innerWidth + 2 && r.width > 0 && r.width <= de.scrollWidth) { overflow.offenders.push({ selector: cssPath(el), right: Math.round(r.right), w: Math.round(r.width) }); if (overflow.offenders.length >= 8) break; } } }
  return { contrastFails, touchFails, touchWarn, overflow, overImageCount, textNodesChecked };
}

// Payload mínimo de un evento InvoiceCreated (el monitor solo lee invoiceId de acá).
const payload = (invoiceId, tenantId) => JSON.stringify({
  invoiceId, tenantId, concepto: 1, fecha: "20260713",
  emisor: { cuit: 20304050607, condicionIva: "MONOTRIBUTO", puntoVenta: 1 },
  receptor: { docTipo: 99, docNro: "0", condicionIva: "CONSUMIDOR_FINAL" },
  neto: 1000, iva: [{ alicuotaId: 3, base: 1000, importe: 0 }], total: 1000,
});

async function sembrarFiscal(db) {
  const { rows: tenants } = await db.query(`SELECT id, slug FROM "Tenant" ORDER BY "createdAt" ASC`);
  const bySlug = Object.fromEntries(tenants.map((t) => [t.slug, t.id]));
  const estetica = bySlug["estetica-demo"];
  const velas = bySlug["velas-demo"];
  const padel = bySlug["padel-demo"];
  log(`tenants: estetica=${estetica} velas=${velas} padel=${padel}`);

  const now = new Date().toISOString();
  const future = new Date(Date.now() + 200 * 864e5).toISOString(); // +200 días
  const past = new Date(Date.now() - 10 * 864e5).toISOString(); // -10 días (vencido)

  // CUITs por tenant.
  await db.query(`UPDATE "Tenant" SET "arcaCuit"='20304050607', "arcaPuntoVenta"=1 WHERE id=$1`, [estetica]);
  await db.query(`UPDATE "Tenant" SET "arcaCuit"='27111222333', "arcaPuntoVenta"=1 WHERE id=$1`, [velas]);
  // padel: sin CUIT a propósito (muestra "falta el CUIT").

  // Credenciales fiscales (metadata; material dummy — el monitor NUNCA lo lee/muestra).
  const cred = (id, tenantId, certCuit, notAfter) =>
    db.query(
      `INSERT INTO "TenantFiscalCredential" (id,"tenantId","certCuit","certNotAfter","kekId","wrappedDek","sealed","loadedBy","createdAt","updatedAt")
       VALUES ($1,$2,$3,$4,'kek1','xxx','yyy','operador',$5,$5)`,
      [id, tenantId, certCuit, notAfter, now],
    );
  // estetica: cert que COINCIDE con el CUIT → listo para facturar.
  await cred("cred_est", estetica, "20304050607", future);
  // velas: cert de OTRO CUIT → mismatch (alerta roja).
  await cred("cred_vel", velas, "20999888777", future);
  // (padel sin credencial → "falta el certificado").

  // Facturas: una AUTORIZADA (estetica, últ. emisión) y una RECHAZADA (velas).
  const inv = (id, tenantId, status, extra) =>
    db.query(
      `INSERT INTO "Invoice" (id,"tenantId","puntoVenta","concepto","docTipo","docNro","fecha","neto","iva","total","status","createdAt","updatedAt"${extra.cols})
       VALUES ($1,$2,1,1,99,'0','20260713',1000,0,1000,$3,$4,$4${extra.vals})`,
      [id, tenantId, status, now, ...extra.args],
    );
  await inv("inv_est_ok", estetica, "AUTHORIZED", {
    cols: `,"cae","caeVencimiento","numero","authorizedAt"`, vals: `,$5,$6,$7,$8`,
    args: ["74123456789012", "20260723", 1, now],
  });
  await inv("inv_vel_rej", velas, "REJECTED", {
    cols: `,"rechazoMotivo"`, vals: `,$5`,
    args: ["10018: El punto de venta 1 no se encuentra habilitado para emitir comprobantes"],
  });

  // Cola del outbox: pendiente + varios fallidos con errores REALES de ARCA (para el criollo).
  const ob = (id, tenantId, invoiceId, attempts, lastError, processed = false) =>
    db.query(
      `INSERT INTO "OutboxEvent" (id,"tenantId","type","payload","attempts","lastError","processedAt","createdAt")
       VALUES ($1,$2,'InvoiceCreated',$3::jsonb,$4,$5,$6,$7)`,
      [id, tenantId, payload(invoiceId, tenantId), attempts, lastError, processed ? now : null, now],
    );
  // estetica: uno pendiente sin error (recién encolado).
  await ob("ob_est_pend", estetica, "inv_est_pend", 0, null);
  // velas: token WSAA vencido (roja, transitorio-auth).
  await ob("ob_vel_token", velas, "inv_vel_1", 3, "600: El Token no es valido o no existe; 601: CMS no valido");
  // padel: sin credencial cargada (roja, acción humana).
  await ob("ob_pad_cred", padel, "inv_pad_1", 2, "El tenant no tiene credencial fiscal (certificado ARCA) cargada. Cargala desde el plano de operador — no hay fallback (ADR-066).");
  // estetica: caída de red (amarilla, transitoria).
  await ob("ob_est_red", estetica, "inv_est_2", 1, "ARCA: transporte SOAP falló (HTTP 503). Cuerpo: <html>Service Unavailable</html>");

  const cnt = async (t) => (await db.query(`SELECT count(*)::int AS n FROM "${t}"`)).rows[0].n;
  log(`counts en db → cred=${await cnt("TenantFiscalCredential")} inv=${await cnt("Invoice")} outbox=${await cnt("OutboxEvent")}`);
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  if (await portInUse(APP_PORT)) { process.stderr.write(`❌ Puerto ${APP_PORT} ocupado.\n`); process.exit(1); }

  const db = new PGlite();
  await db.waitReady;
  const server = new PGLiteSocketServer({ db, port: DB_PORT, host: "127.0.0.1" });
  await server.start();
  const server2 = new PGLiteSocketServer({ db, port: DB_PORT + 1, host: "127.0.0.1" });
  await server2.start();
  log(`PGlite en 127.0.0.1:${DB_PORT} (+ operador ${DB_PORT + 1})`);
  await applyMigrations(db);

  const code = await runAsync("npx", ["tsx", "prisma/seed-qa-tenants.ts"], { DATABASE_URL: DB_URL, SEED_DB_MAX: "1" });
  if (code !== 0) throw new Error(`seed qa-tenants falló (exit ${code})`);
  await sembrarFiscal(db);

  const appEnv = {
    ...process.env,
    DATABASE_URL: DB_URL, OPERATOR_DATABASE_URL: OP_DB_URL, DB_CONNECTION_LIMIT: "1",
    APP_BASE_DOMAIN: "localhost", AUTH_SECRET, OPERATOR_SECRET,
    OPERATOR_PASSWORD: "operador", PORT: String(APP_PORT), NODE_ENV: "production",
    // Facturación encendida en HOMOLOGACIÓN → el monitor muestra modo real + botón Reintentar activo.
    ARCA_MODO: "homologacion", ARCA_INVOICING_ENABLED: "true",
  };
  log(`next start en ${BASE} …`);
  const app = spawn("npx", ["next", "start", "-p", String(APP_PORT)], { cwd: ROOT, env: appEnv, stdio: "inherit", shell: isWin });

  let ok = false;
  try {
    if (!(await waitHealthy(60000))) throw new Error("server no quedó sano en 60s (¿falta next build?)");
    const browser = await chromium.launch();
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
    await ctx.addCookies([{ url: BASE, name: "operator_session", value: operatorCookie() }]);
    const page = await ctx.newPage();

    // 01 — monitor completo
    await page.goto(`${BASE}/operador/monitor`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "Monitor de soporte" }).waitFor({ timeout: 15000 });
    await page.screenshot({ path: path.join(OUT, "01-monitor-completo.png"), fullPage: true });
    log("01-monitor-completo.png");

    // 02 — expandir un "detalle técnico" (el crudo del error)
    const detalle = page.getByText("Ver detalle técnico").first();
    if (await detalle.count()) { await detalle.click(); }
    await page.screenshot({ path: path.join(OUT, "02-detalle-tecnico.png"), fullPage: true });
    log("02-detalle-tecnico.png");

    // 03 — filtro "solo rojas"
    await page.goto(`${BASE}/operador/monitor?sev=roja`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "Monitor de soporte" }).waitFor({ timeout: 15000 });
    await page.screenshot({ path: path.join(OUT, "03-filtro-rojas.png"), fullPage: true });
    log("03-filtro-rojas.png");

    // ── Auditoría WCAG AA · touch · overflow (desktop + mobile) ──
    let auditOk = true;
    for (const vp of [{ name: "desktop", w: 1280, h: 1000 }, { name: "mobile", w: 390, h: 844 }]) {
      await page.setViewportSize({ width: vp.w, height: vp.h });
      await page.goto(`${BASE}/operador/monitor`, { waitUntil: "networkidle" });
      await page.getByRole("heading", { name: "Monitor de soporte" }).waitFor({ timeout: 15000 });
      const a = await page.evaluate(auditInPage);
      const touchFails = vp.name === "mobile" ? a.touchFails : [];
      const overflow = a.overflow.scrollWidth > a.overflow.innerWidth + 2 ? a.overflow.offenders : [];
      log(`[AA ${vp.name}] nodos=${a.textNodesChecked} contraste=${a.contrastFails.length} touch=${touchFails.length} overflow=${overflow.length} (overImage=${a.overImageCount})`);
      if (a.contrastFails.length) { auditOk = false; for (const f of a.contrastFails.slice(0, 8)) log(`   ✗ contraste ${f.ratio}<${f.threshold} "${f.text}" (${f.color} / ${f.bg}) ${f.selector}`); }
      if (touchFails.length) { auditOk = false; for (const f of touchFails.slice(0, 8)) log(`   ✗ touch ${f.w}x${f.h} "${f.text}" ${f.selector}`); }
      if (overflow.length) { auditOk = false; for (const f of overflow.slice(0, 8)) log(`   ✗ overflow ${f.selector} right=${f.right}`); }
      if (vp.name === "mobile") await page.screenshot({ path: path.join(OUT, "04-mobile.png"), fullPage: true });
    }
    log(auditOk ? "✅ AA/touch/overflow: SIN fallas" : "❌ AA/touch/overflow: hay fallas (ver arriba)");

    await browser.close();
    ok = auditOk;
  } finally {
    killTree(app);
    try { await server.stop(); } catch {}
    try { await server2.stop(); } catch {}
    try { await db.close(); } catch {}
  }
  log(ok ? "✅ render OK — screenshots en qa-shots/monitor/" : "❌ render falló");
  process.exit(ok ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
