// ============================================================================
// GATE VISUAL · Smoke test de RENDER REAL — Playwright (Célula Confiabilidad)
// ============================================================================
// Por qué existe: el gate (tsc + lint + test + build) NO ve bugs VISUALES. El
// 2026-07-11 la página de login del operador salió a prod con el layout colapsado
// ("una palabra por línea") porque el CSS/Tailwind no se estaba aplicando, y
// NINGUNA valla lo detectó: compilaba, buildeaba y pasaba tests. Esta valla cierra
// ese agujero: renderiza las rutas críticas en un navegador REAL (Chromium,
// desktop + mobile) y falla si el layout está roto.
//
// Assertions anti-"layout roto" (el patrón exacto del bug):
//   1. CSS cargó         — una custom property de globals.css (:root { --surface })
//                          resuelve a un valor no vacío. Si el stylesheet no cargó,
//                          queda "" → falla. Detecta "el CSS no cargó".
//   2. Tailwind aplicó   — el contenedor con `flex`/`min-h-screen` tiene realmente
//                          display:flex / min-height alto. Detecta "las utilidades
//                          no se generaron/aplicaron".
//   3. No columna angosta— el contenedor de contenido principal tiene un ancho
//                          razonable (no colapsado a min-content = "una palabra por
//                          línea"). Es la firma visual del bug.
//   4. Sin overflow horiz— scrollWidth <= innerWidth (+tolerancia). Nada se desborda.
//   5. Elementos clave   — los selectores esperados existen y tienen tamaño > 0.
//
// Cada ruta saca screenshot (desktop + mobile) como ARTEFACTO en OUT_DIR.
//
// USO local:
//   BASE_URL=http://localhost:3000 node scripts/qa/visual-smoke.mjs
// En CI lo invoca scripts/visual-gate.mjs (levanta `next start` y corre esto).
//
// ENV:
//   BASE_URL        base a testear (default http://localhost:3000)
//   OUT_DIR         carpeta de screenshots (default ./qa-shots/visual)
//   OPERATOR_SECRET secreto para firmar la cookie de operador (auth de /operador)
//   OPERATOR_ONLY   "1" → solo rutas de /operador (para el reporte del fix)
//   ROUTES_NO_AUTH  "1" → salta las rutas autenticadas (subset sin DB, para CI)
// ============================================================================

import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { createHmac } from "node:crypto";
import path from "node:path";

const BASE_URL = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const OUT_DIR = path.resolve(process.env.OUT_DIR ?? "qa-shots/visual");
const NO_AUTH = process.env.ROUTES_NO_AUTH === "1";
const OPERATOR_ONLY = process.env.OPERATOR_ONLY === "1";

// Firma la cookie de operador igual que src/lib/operator-auth.ts (HMAC-SHA256 hex
// del subject "operator"). Así el smoke entra a la consola autenticada sin UI de login.
function operatorCookieValue() {
  const secret = process.env.OPERATOR_SECRET ?? process.env.AUTH_SECRET ?? "dev-operator-secret";
  const sig = createHmac("sha256", secret).update("operator").digest("hex");
  return `operator.${sig}`;
}

// Viewports: desktop y mobile (el bug de "una palabra por línea" es peor en mobile).
const VIEWPORTS = [
  { name: "desktop", width: 1280, height: 900 },
  { name: "mobile", width: 390, height: 844 },
];

// Catálogo de rutas críticas. `auth: "operator"` inyecta la cookie de operador.
// `minContentWidth` es el ancho mínimo (px) que debe tener el contenedor de
// contenido en desktop — por debajo de eso el layout está colapsado.
const ROUTES = [
  {
    path: "/operador/login",
    label: "operador-login",
    group: "operador",
    key: 'input[type="password"]',
    minContentWidth: 240,
  },
  {
    path: "/operador",
    label: "operador-consola",
    group: "operador",
    auth: "operator",
    key: "h1",
    minContentWidth: 400,
  },
  {
    path: "/operador/alta",
    label: "operador-alta",
    group: "operador",
    auth: "operator",
    key: "h1",
    minContentWidth: 400,
  },
  {
    path: "/admin/login",
    label: "admin-login",
    group: "admin",
    key: 'input[type="password"], input[name="password"]',
    minContentWidth: 240,
  },
  {
    path: "/",
    label: "vidriera-landing",
    group: "public",
    key: "h1, h2",
    minContentWidth: 300,
  },
];

// Se ejecuta en el navegador. Reúne todas las señales de un tiro para el assert.
function collectSignals(keySelector) {
  const rootStyle = getComputedStyle(document.documentElement);
  const bodyStyle = getComputedStyle(document.body);
  // 1. CSS cargó: la custom property de globals.css resuelve.
  const surfaceVar = rootStyle.getPropertyValue("--surface").trim();
  const backgroundVar = rootStyle.getPropertyValue("--background").trim();

  // 3. Contenedor de contenido: el bloque más ancho con texto real (no el body).
  // Buscamos el elemento visible con texto que tenga el mayor ancho — es el
  // "contenedor". Si el layout colapsó, incluso el más ancho será angosto.
  let widestTextWidth = 0;
  let anyText = false;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
  while (walker.nextNode()) {
    const el = walker.currentNode;
    const direct = Array.from(el.childNodes)
      .filter((n) => n.nodeType === 3)
      .map((n) => n.textContent.trim())
      .join(" ")
      .trim();
    if (direct.length >= 10) {
      anyText = true;
      const r = el.getBoundingClientRect();
      if (r.width > widestTextWidth) widestTextWidth = r.width;
    }
  }

  // 5. Elemento clave presente y con tamaño.
  const keyEl = keySelector ? document.querySelector(keySelector) : null;
  const keyRect = keyEl ? keyEl.getBoundingClientRect() : null;

  // 2. Tailwind aplicó: ¿algún elemento con display:flex? (la app usa flex por todos lados)
  let anyFlex = false;
  const all = document.body.querySelectorAll("*");
  for (const el of all) {
    if (getComputedStyle(el).display === "flex") { anyFlex = true; break; }
  }

  return {
    surfaceVar,
    backgroundVar,
    bodyBg: bodyStyle.backgroundColor,
    widestTextWidth,
    anyText,
    anyFlex,
    keyPresent: !!keyEl,
    keyW: keyRect ? keyRect.width : 0,
    keyH: keyRect ? keyRect.height : 0,
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  };
}

async function checkRoute(browser, route, vp, results) {
  const contextOpts = { viewport: { width: vp.width, height: vp.height } };
  const ctx = await browser.newContext(contextOpts);
  if (route.auth === "operator") {
    const url = new URL(BASE_URL);
    await ctx.addCookies([
      {
        name: "operator_session",
        value: operatorCookieValue(),
        domain: url.hostname,
        path: "/",
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
  }
  const page = await ctx.newPage();
  const id = `${route.label}-${vp.name}`;
  const failures = [];
  try {
    const resp = await page.goto(BASE_URL + route.path, { waitUntil: "networkidle", timeout: 45000 });
    const status = resp ? resp.status() : 0;
    // Si una ruta autenticada rebota al login, la cookie no matcheó el secreto del server.
    const landed = new URL(page.url()).pathname;
    if (route.auth === "operator" && landed.startsWith("/operador/login") && route.path !== "/operador/login") {
      failures.push(`redirigido a login (cookie de operador no válida para este server; ¿OPERATOR_SECRET?)`);
    }
    if (status >= 400) failures.push(`HTTP ${status}`);

    await page.waitForTimeout(400);
    const s = await page.evaluate(collectSignals, route.key);

    // 1. CSS cargó
    if (!s.surfaceVar && !s.backgroundVar) {
      failures.push(`CSS NO cargó: --surface y --background vacías (globals.css no aplicó)`);
    }
    // 2. Tailwind aplicó
    if (!s.anyFlex) {
      failures.push(`Tailwind NO aplicó: ningún elemento con display:flex`);
    }
    // 3. Columna colapsada ("una palabra por línea")
    const minW = vp.name === "desktop" ? (route.minContentWidth ?? 240) : Math.min(route.minContentWidth ?? 240, vp.width - 40);
    if (s.anyText && s.widestTextWidth < minW) {
      failures.push(`layout colapsado: contenedor de texto más ancho = ${Math.round(s.widestTextWidth)}px (< ${minW}px). Firma de "una palabra por línea".`);
    }
    // 4. Overflow horizontal
    if (s.scrollWidth > s.innerWidth + 2) {
      failures.push(`overflow horizontal: scrollWidth ${s.scrollWidth} > innerWidth ${s.innerWidth}`);
    }
    // 5. Elemento clave
    if (route.key && (!s.keyPresent || s.keyW < 1 || s.keyH < 1)) {
      failures.push(`elemento clave ausente o sin tamaño: "${route.key}" (present=${s.keyPresent}, ${Math.round(s.keyW)}x${Math.round(s.keyH)})`);
    }

    await mkdir(OUT_DIR, { recursive: true });
    const shot = path.join(OUT_DIR, `${id}.png`);
    await page.screenshot({ path: shot, fullPage: true });

    const ok = failures.length === 0;
    results.push({ id, ok, failures, shot, signals: s });
    process.stdout.write(`${ok ? "  ✓" : "  ✗"} ${id}  (contenido ${Math.round(s.widestTextWidth)}px, key ${Math.round(s.keyW)}x${Math.round(s.keyH)})  → ${shot}\n`);
    for (const f of failures) process.stdout.write(`      ✗ ${f}\n`);
  } catch (e) {
    results.push({ id, ok: false, failures: [String(e?.message ?? e)] });
    process.stdout.write(`  ✗ ${id}: ${e?.message ?? e}\n`);
  } finally {
    await ctx.close();
  }
}

async function main() {
  const routes = ROUTES.filter((r) => {
    if (OPERATOR_ONLY && r.group !== "operador") return false;
    if (NO_AUTH && r.auth) return false;
    return true;
  });
  process.stdout.write(`\n🖼️  Gate visual — ${BASE_URL}\n`);
  process.stdout.write(`   Rutas: ${routes.map((r) => r.path).join(", ")}\n\n`);

  const browser = await chromium.launch();
  const results = [];
  try {
    for (const route of routes) {
      for (const vp of VIEWPORTS) {
        await checkRoute(browser, route, vp, results);
      }
    }
  } finally {
    await browser.close();
  }

  const failed = results.filter((r) => !r.ok);
  process.stdout.write(`\n──────── Resumen gate visual ────────\n`);
  for (const r of results) process.stdout.write(`${r.ok ? "🟢" : "🔴"} ${r.id}\n`);
  process.stdout.write(`\nScreenshots en: ${OUT_DIR}\n`);
  if (failed.length) {
    process.stderr.write(`\n❌ ${failed.length} render(s) roto(s) — NO publicar. Revisá los screenshots.\n`);
    process.exit(1);
  }
  process.stdout.write(`\n✅ Render OK en todas las rutas.\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
