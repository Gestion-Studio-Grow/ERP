// Capturas de VENDER (/admin/vender) y del marco del panel, para magra y beauty-spa (CH), a 390, 768 y 1280 px.
//
// Mismo armado que capturas-backoffice.mjs: ERP REAL (`next start`, con build hecho) sobre una base Postgres
// LOCAL y efímera (nunca Neon). Por tamaño: la pantalla vacía y, en magra, con un producto por peso tocado
// (para ver el campo de peso y el ticket). Mide el contraste AA de los textos visibles y el scroll lateral.
//
// Uso:  node --import tsx scripts/qa/capturas-vender.mjs <carpeta de salida> [magra|ch]     PORT=3252 por defecto
import { spawn, execFile } from "node:child_process";
import { createWriteStream, existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import pg0 from "pg";
const { Client } = pg0;
import { crearBaseEfimera, CLAVE_DE_PRUEBA } from "../../src/test/base-efimera.ts";
import { sembrarCH, SUBDOMINIO_CH } from "../../src/tenants/ch/e2e/semilla-ch.ts";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = path.resolve(process.argv[2] ?? path.join(RAIZ, "dist/capturas-vender"));
const SOLO = process.argv[3];
const PORT = Number(process.env.PORT ?? 3252);
if (PORT === 3210 || PORT === 3211) throw new Error("Los puertos 3210 y 3211 son de otro equipo: elegí otro PORT.");
const AUTH_SECRET = "capturas-vender-0123456789abcdef";
if (!existsSync(path.join(RAIZ, ".next/BUILD_ID"))) throw new Error("Falta el build: corré `npm run build` antes.");

const TAMANOS = [
  ["390", 390, 844],
  ["768", 768, 1024],
  ["1280", 1280, 800],
];
const TENANTS = { magra: "magra.localhost", ch: `${SUBDOMINIO_CH}.localhost` };

const correr = (args, env) =>
  new Promise((ok, mal) =>
    execFile(process.execPath, args, { cwd: RAIZ, env, timeout: 180_000, maxBuffer: 8 << 20 }, (err, out, e2) =>
      err ? mal(new Error(`${args.join(" ")} falló:\n${out}\n${e2}`)) : ok(out),
    ),
  );

// Contraste WCAG de cada texto visible contra el primer fondo opaco de sus ancestros (aproximación honesta:
// no ve imágenes de fondo ni degradés). Devuelve los que no llegan a 4.5:1 (3:1 si el texto es grande).
function auditarContraste() {
  const rgb = (c) => {
    const m = c.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const [r, g, b, a = "1"] = m[1].split(/[ ,/]+/).filter(Boolean);
    return [Number(r), Number(g), Number(b), Number(a)];
  };
  const lum = ([r, g, b]) => {
    const f = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const fondo = (el) => {
    for (let n = el; n; n = n.parentElement) {
      const c = rgb(getComputedStyle(n).backgroundColor);
      if (c && c[3] >= 0.95) return c;
    }
    return [255, 255, 255, 1];
  };
  const fallas = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const vistos = new Set();
  for (let t = walker.nextNode(); t; t = walker.nextNode()) {
    const el = t.parentElement;
    if (!el || vistos.has(el) || !t.textContent.trim()) continue;
    vistos.add(el);
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0 || s.visibility === "hidden" || Number(s.opacity) < 0.1) continue;
    if (el.closest("[aria-hidden=true], .sr-only, [disabled]")) continue;
    const fg = rgb(s.color);
    if (!fg) continue;
    const bg = fondo(el);
    const mezcla = fg.slice(0, 3).map((v, i) => v * fg[3] + bg[i] * (1 - fg[3]));
    const [l1, l2] = [lum(mezcla), lum(bg)].sort((a, b) => b - a);
    const ratio = (l1 + 0.05) / (l2 + 0.05);
    const px = parseFloat(s.fontSize);
    const grande = px >= 24 || (px >= 18.66 && Number(s.fontWeight) >= 700);
    if (ratio < (grande ? 3 : 4.5)) fallas.push(`${ratio.toFixed(2)} «${t.textContent.trim().slice(0, 40)}» ${s.color} / rgb(${bg.slice(0, 3).join(",")})`);
  }
  return fallas;
}

await mkdir(OUT, { recursive: true });
const base = await crearBaseEfimera();
let app;
let browser;
const informe = [];
try {
  await sembrarCH(base);
  await correr([path.join(RAIZ, "node_modules/tsx/dist/cli.mjs"), "prisma/seed-magra.ts"], { ...process.env, DATABASE_URL: base.urlDuenio, MAGRA_SLUG: "magra" });
  // Como en producción: Magra vende con el mostrador boutique prendido (interruptor de la consola GSG).
  {
    const pg = new Client({ connectionString: base.urlDuenio });
    await pg.connect();
    await pg.query(
      `INSERT INTO "AuditLog" (id, "tenantId", actor, action, entity, "entityId", channel)
       SELECT 'qa-boutique-magra', id, 'operator:qa', 'interruptor.encender', 'Interruptor', 'mostrador-boutique', 'operador' FROM "Tenant" WHERE slug = 'magra'`,
    );
    await pg.end();
  }
  const env = {
    ...process.env,
    DATABASE_URL: base.urlApp,
    OPERATOR_DATABASE_URL: base.urlDuenio,
    MIGRATE_DATABASE_URL: base.urlDuenio,
    RLS_ENFORCEMENT: "on",
    APP_BASE_DOMAIN: "localhost",
    AUTH_SECRET,
    OPERATOR_SECRET: `${AUTH_SECRET}-operador`,
    NODE_ENV: "production",
    PORT: String(PORT),
  };
  for (const v of ["FORCE_TENANT_SLUG", "TENANT_HOST_MAP", "DEMO_MODE_ENABLED"]) delete env[v];
  const log = createWriteStream(path.join(OUT, "servidor.txt"));
  app = spawn(process.execPath, [path.join(RAIZ, "node_modules/next/dist/bin/next"), "start", "-p", String(PORT)], { cwd: RAIZ, env, stdio: ["ignore", "pipe", "pipe"] });
  app.stdout.pipe(log);
  app.stderr.pipe(log);
  for (let i = 0; ; i++) {
    const r = await fetch(`http://127.0.0.1:${PORT}/admin/login`, { headers: { host: `${TENANTS.ch}:${PORT}` } }).catch(() => null);
    if (r?.ok) break;
    if (i > 120) throw new Error("la app no levantó (ver servidor.txt)");
    await new Promise((ok) => setTimeout(ok, 500));
  }
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const credenciales = { ch: { email: base.a.duenia.email, clave: CLAVE_DE_PRUEBA }, magra: { email: "admin@magra", clave: "ERP" } };
  for (const [slug, host] of Object.entries(TENANTS)) {
    if (SOLO && SOLO !== slug) continue;
    const origen = `http://${host}:${PORT}`;
    for (const [tam, ancho, alto] of TAMANOS) {
      const ctx = await browser.newContext({ viewport: { width: ancho, height: alto }, hasTouch: ancho < 1024, locale: "es-AR" });
      await ctx.addInitScript(() => {
        try {
          localStorage.setItem("gsg-admin-theme", "light");
        } catch {
          /* sin storage */
        }
      });
      await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
      const p = await ctx.newPage();
      const errores = [];
      p.on("pageerror", (e) => errores.push(String(e)));
      p.on("console", (m) => m.type() === "error" && !/Failed to load resource|ERR_/.test(m.text()) && errores.push(m.text()));
      await p.goto(`${origen}/admin/login`);
      await p.fill('input[name="email"]', credenciales[slug].email);
      await p.fill('input[name="password"]', credenciales[slug].clave);
      await Promise.all([p.waitForURL((u) => !u.pathname.startsWith("/admin/login"), { timeout: 30_000 }), p.click('button[type="submit"]')]);
      // El marco del panel (Inicio): lo comparten todos los negocios; CH no tiene la app Vender.
      await p.goto(`${origen}/admin`, { waitUntil: "load" });
      await p.waitForLoadState("networkidle").catch(() => {});
      await p.waitForTimeout(400);
      await p.screenshot({ path: path.join(OUT, `${slug}-inicio-${tam}.png`) });
      const r = await p.goto(`${origen}/admin/vender`, { waitUntil: "load" });
      await p.waitForLoadState("networkidle").catch(() => {});
      await p.waitForTimeout(600);
      const lateral = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      const contraste = await p.evaluate(auditarContraste);
      await p.screenshot({ path: path.join(OUT, `${slug}-vender-${tam}.png`), fullPage: true });
      // Con un producto por peso en el ticket (magra): la primera tecla.
      let conProducto = false;
      if (slug === "magra") {
        const tecla = p.locator('[data-vender="elegir"] button[data-tecla], [data-vender="elegir"] [data-vender="tecla"], [data-vender="elegir"] li button').first();
        if (await tecla.count()) {
          await tecla.click().catch(() => {});
          await p.waitForTimeout(500);
          await p.screenshot({ path: path.join(OUT, `${slug}-vender-${tam}-con-producto.png`), fullPage: true });
          conProducto = true;
        }
      }
      const fila = { slug, tam, estado: r?.status(), lateral, contraste: contraste.slice(0, 12), totalContraste: contraste.length, conProducto, errores: [...new Set(errores)].slice(0, 3) };
      informe.push(fila);
      console.log(`${r?.status() === 200 ? "✓" : "✗"} ${slug} ${tam} · lateral=${lateral} · AA fallas=${contraste.length}${errores.length ? " · consola!" : ""}`);
      await ctx.close();
    }
  }
  await writeFile(path.join(OUT, "informe.json"), JSON.stringify(informe, null, 2));
} finally {
  await browser?.close().catch(() => {});
  if (app) {
    app.kill("SIGTERM");
    await new Promise((ok) => (app.exitCode !== null ? ok() : app.once("exit", ok)));
  }
  await base.borrar();
}
