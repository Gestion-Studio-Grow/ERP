// ============================================================================
// QA · Capturas de la ficha de marca por tenant (RFC-004-D) — Playwright.
// ============================================================================
//
// Loguea con la credencial DEMO autorizada (admin@<slug>-demo / ERP — cuenta de prueba
// creada por el dueño para esto) contra los hosts de staging y saca screenshot de:
//   · FRONT  (sin login):  gsg-erp-<slug>.vercel.app/
//   · BACK   (con login):  gsg-erp-<slug>.vercel.app/admin
// para estetica-demo vs velas-demo (el par de la Definición de Hecho).
//
// USO:
//   npm i -D playwright   (o: npx playwright install chromium)
//   node scripts/qa/brandsheet-shots.mjs
//
// La prueba que vale (piel distinta) requiere TENANT_BRAND_SHEET_ENABLED=on en el proyecto
// de staging + redeploy (lo hace el dueño). Corrido ANTES del flag, igual valida login +
// resolución + módulos distintos por tenant (estetica=agenda, velas=POS).
//
// ENV opcionales: DEMO_PASSWORD (default "ERP"), OUT_DIR (default ./qa-shots), TENANTS
// ("estetica,velas,padel,magra"), BASE (default "https://gsg-erp-").

import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const PASSWORD = process.env.DEMO_PASSWORD ?? "ERP";
const OUT_DIR = process.env.OUT_DIR ?? "qa-shots";
const BASE = process.env.BASE ?? "https://gsg-erp-";
const SUFFIX = ".vercel.app";
const TENANTS = (process.env.TENANTS ?? "estetica,velas").split(",").map((s) => s.trim()).filter(Boolean);

const hostFor = (slug) => `${BASE}${slug}${SUFFIX}`;
const emailFor = (slug) => `admin@${slug}-demo`;

async function shootFront(page, slug, dir) {
  const url = hostFor(slug) + "/";
  process.stdout.write(`· front  ${slug} → ${url}\n`);
  await page.goto(url, { waitUntil: "networkidle", timeout: 45000 });
  // Retail (velas/padel/magra) redirige a /tienda; servicios (estetica) queda en la landing.
  await page.waitForTimeout(1200);
  const out = path.join(dir, `front-${slug}.png`);
  await page.screenshot({ path: out, fullPage: true });
  process.stdout.write(`  ✓ ${out}  (url final: ${page.url()})\n`);
}

async function shootBack(page, slug, dir) {
  const login = hostFor(slug) + "/admin/login";
  process.stdout.write(`· login  ${slug} → ${login}\n`);
  await page.goto(login, { waitUntil: "networkidle", timeout: 45000 });
  await page.fill('input[name="email"]', emailFor(slug));
  await page.fill('input[name="password"]', PASSWORD);
  await Promise.all([
    page.waitForURL((u) => /\/admin(?!\/login)/.test(u.pathname ?? String(u)), { timeout: 45000 }).catch(() => {}),
    page.click('button[type="submit"]'),
  ]);
  await page.waitForTimeout(1800);
  const finalUrl = page.url();
  if (/\/admin\/login/.test(finalUrl)) {
    process.stdout.write(`  ⚠ ${slug}: sigue en /admin/login — ¿credencial? (email=${emailFor(slug)})\n`);
  }
  const out = path.join(dir, `back-${slug}.png`);
  await page.screenshot({ path: out, fullPage: true });
  process.stdout.write(`  ✓ ${out}  (url final: ${finalUrl})\n`);
}

async function main() {
  const dir = path.resolve(OUT_DIR);
  await mkdir(dir, { recursive: true });
  const browser = await chromium.launch();
  try {
    for (const slug of TENANTS) {
      // Contexto nuevo por tenant → sin cookies compartidas (sesiones independientes).
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await ctx.newPage();
      try {
        await shootFront(page, slug, dir);
        await shootBack(page, slug, dir);
      } catch (e) {
        process.stdout.write(`  ✗ ${slug}: ${e?.message ?? e}\n`);
      } finally {
        await ctx.close();
      }
    }
    process.stdout.write(`\nListo. Capturas en: ${dir}\n`);
    process.stdout.write(`Comparar back-estetica.png vs back-velas.png: deben diferir en papel/tinta/tipografía/densidad, no solo el acento.\n`);
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
