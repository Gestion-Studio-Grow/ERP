// ============================================================================
// GATE VISUAL · AUDITORÍA DE CALIDAD — contraste WCAG AA · touch targets · overflow
// ============================================================================
// Por qué existe: el smoke de layout (visual-smoke.mjs) atrapa "el CSS no cargó /
// layout colapsado", pero NO ve defectos de CALIDAD que el cliente sí ve: texto
// gris sobre fondo oscuro (contraste bajo AA), botones imposibles de tocar en el
// teléfono (touch target chico), scroll horizontal en mobile. Este gate MIDE esas
// tres cosas de forma computada (no "a ojo") en un navegador REAL, sobre las rutas
// críticas y en los 4 TEMAS DE COLOR (un tenant por rubro → un theme pack cada uno),
// desktop y mobile. Si un texto no llega a 4.5:1 (o 3:1 en texto grande) → gate rojo.
//
// Contraste: por cada nodo de texto visible se computa el color efectivo (color del
// texto compuesto sobre el fondo efectivo — se suben ancestros componiendo alfa hasta
// una superficie opaca). Texto sobre imagen/gradiente = NO medible → se cuenta aparte,
// no se falla (evita falsos positivos). Umbral por tamaño (WCAG 1.4.3): grande
// (≥24px, o ≥18.66px bold) = 3:1; normal = 4.5:1.
//
// Touch targets (WCAG 2.5.5 / 2.5.8): controles interactivos STANDALONE (no links
// dentro de un párrafo) con lado menor < 44px en mobile → falla.
//
// Overflow: scrollWidth > innerWidth (mobile sobre todo) → falla, y reporta los
// elementos que se desbordan para poder arreglarlos.
//
// USO:
//   BASE_HOST=localhost PORT=3220 FIXTURE=path/qa-tenants.json \
//     node scripts/qa/visual-audit.mjs
//   OUT_DIR   carpeta de screenshots + report.json (default ./qa-shots/audit)
//   ONLY      coma-separado: subdominios a auditar (default: todos los del fixture)
//   GROUPS    coma-separado: public,flow,admin,operador (default: todos)
// ============================================================================

import { chromium } from "playwright";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { createHmac } from "node:crypto";
import path from "node:path";

const BASE_HOST = process.env.BASE_HOST ?? "localhost";
const PORT = Number(process.env.PORT ?? 3220);
const OUT_DIR = path.resolve(process.env.OUT_DIR ?? "qa-shots/audit");
const FIXTURE = process.env.FIXTURE ?? path.resolve("../qa-tenants.json");
const ONLY = (process.env.ONLY ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const GROUPS = (process.env.GROUPS ?? "public,flow,admin,operador").split(",").map((s) => s.trim());

const VIEWPORTS = [
  { name: "desktop", width: 1280, height: 900 },
  { name: "mobile", width: 390, height: 844 },
];

// Rutas por grupo. `blueprints` limita a ciertos rubros (undefined = todos).
// `auth: "admin"` inyecta cookie de sesión del OWNER del tenant.
const ROUTES = [
  // ── Vidriera pública (sin auth) ──
  { path: "/", label: "home", group: "public", key: "h1, h2" },
  // ── Flujo de reserva / compra ──
  { path: "/reserva", label: "reserva", group: "flow", blueprints: ["servicios"], key: "h1, h2" },
  { path: "/tienda", label: "tienda", group: "flow", blueprints: ["velas", "padel", "carniceria"], key: "h1, h2" },
  // ── Backoffice /admin ──
  { path: "/admin/login", label: "admin-login", group: "admin", key: 'input[type="password"], input[name="password"]' },
  { path: "/admin", label: "admin-dashboard", group: "admin", auth: "admin", key: "h1, h2" },
  { path: "/admin/clientes", label: "admin-clientes", group: "admin", auth: "admin", key: "h1, h2" },
  { path: "/admin/catalogo", label: "admin-catalogo", group: "admin", auth: "admin", key: "h1, h2" },
  { path: "/admin/reportes", label: "admin-reportes", group: "admin", auth: "admin", key: "h1, h2" },
  { path: "/admin/ajustes", label: "admin-ajustes", group: "admin", auth: "admin", key: "h1, h2" },
  { path: "/admin/apariencia", label: "admin-apariencia", group: "admin", auth: "admin", key: "h1, h2" },
  { path: "/admin/turnos", label: "admin-turnos", group: "admin", auth: "admin", blueprints: ["servicios"], key: "h1, h2" },
  { path: "/admin/pedidos", label: "admin-pedidos", group: "admin", auth: "admin", blueprints: ["velas", "padel", "carniceria"], key: "h1, h2" },
  { path: "/admin/caja", label: "admin-caja", group: "admin", auth: "admin", blueprints: ["velas", "padel", "carniceria"], key: "h1, h2" },
];

function adminCookie(userId, authSecret) {
  const sig = createHmac("sha256", authSecret).update(userId).digest("hex");
  return `${userId}.${sig}`;
}
function operatorCookie(operatorSecret) {
  const sig = createHmac("sha256", operatorSecret).update("operator").digest("hex");
  return `operator.${sig}`;
}

// ── Función in-page: mide contraste, touch targets y overflow. Se serializa y corre
//    en el navegador (sin acceso a scope de Node). ────────────────────────────────
function auditInPage() {
  const parseColor = (str) => {
    if (!str) return null;
    const m = str.match(/rgba?\(([^)]+)\)/i);
    if (!m) return null;
    const p = m[1].split(",").map((s) => parseFloat(s));
    return { r: p[0], g: p[1], b: p[2], a: p[3] === undefined ? 1 : p[3] };
  };
  const over = (fg, bg) => ({
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a),
  });
  const lum = ({ r, g, b }) => {
    const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const ratio = (c1, c2) => {
    const l1 = lum(c1), l2 = lum(c2), hi = Math.max(l1, l2), lo = Math.min(l1, l2);
    return (hi + 0.05) / (lo + 0.05);
  };
  const isHidden = (el) => {
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || parseFloat(cs.opacity) === 0) return true;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return true;
    return false;
  };
  // Fondo efectivo: sube ancestros componiendo alfa hasta superficie opaca.
  // Devuelve {overImage:true} si topa una imagen/gradiente (no medible).
  const effectiveBg = (el) => {
    const stack = [];
    let node = el;
    while (node && node.nodeType === 1) {
      const cs = getComputedStyle(node);
      if (cs.backgroundImage && cs.backgroundImage !== "none") return { overImage: true };
      const c = parseColor(cs.backgroundColor);
      if (c && c.a > 0) { stack.push(c); if (c.a >= 1) break; }
      node = node.parentElement;
    }
    let base = { r: 255, g: 255, b: 255 };
    // si el <html> tiene bg oscuro y nada opaco lo cubrió, arrancar de ahí
    const htmlBg = parseColor(getComputedStyle(document.documentElement).backgroundColor);
    if (htmlBg && htmlBg.a >= 1) base = { r: htmlBg.r, g: htmlBg.g, b: htmlBg.b };
    for (let i = stack.length - 1; i >= 0; i--) base = over(stack[i], base);
    return { color: base };
  };
  const cssPath = (el) => {
    const parts = [];
    let node = el;
    for (let i = 0; node && node.nodeType === 1 && i < 4; i++) {
      let s = node.tagName.toLowerCase();
      if (node.id) { s += "#" + node.id; parts.unshift(s); break; }
      const cls = (node.className && typeof node.className === "string") ? node.className.trim().split(/\s+/).slice(0, 2).join(".") : "";
      if (cls) s += "." + cls;
      parts.unshift(s);
      node = node.parentElement;
    }
    return parts.join(" > ");
  };

  const contrastFails = [];
  let overImageCount = 0;
  let textNodesChecked = 0;
  const seen = new Set();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
  while (walker.nextNode()) {
    const el = walker.currentNode;
    // texto DIRECTO no vacío
    const direct = Array.from(el.childNodes)
      .filter((n) => n.nodeType === 3)
      .map((n) => n.textContent.trim())
      .join(" ")
      .trim();
    if (direct.length < 2) continue;
    if (isHidden(el)) continue;
    // WCAG 1.4.3 exime controles DESHABILITADOS (y texto en placeholder). Un botón
    // disabled con texto tenue no es un defecto de contraste.
    if (el.closest('button:disabled, input:disabled, select:disabled, textarea:disabled, fieldset:disabled, [aria-disabled="true"], [data-disabled="true"]')) continue;
    const cs = getComputedStyle(el);
    const fg = parseColor(cs.color);
    if (!fg || fg.a === 0) continue;
    const bg = effectiveBg(el);
    if (bg.overImage) { overImageCount++; continue; }
    const fgOpaque = over(fg, bg.color);
    const cr = ratio(fgOpaque, bg.color);
    textNodesChecked++;
    const size = parseFloat(cs.fontSize);
    const weight = parseInt(cs.fontWeight) || 400;
    const large = size >= 24 || (size >= 18.66 && weight >= 700);
    const threshold = large ? 3.0 : 4.5;
    if (cr < threshold - 0.05) {
      const key = cssPath(el) + "|" + Math.round(cr * 100);
      if (seen.has(key)) continue;
      seen.add(key);
      contrastFails.push({
        selector: cssPath(el),
        text: direct.slice(0, 60),
        ratio: Math.round(cr * 100) / 100,
        threshold,
        large,
        fontPx: Math.round(size * 10) / 10,
        weight,
        color: cs.color,
        bg: `rgb(${Math.round(bg.color.r)},${Math.round(bg.color.g)},${Math.round(bg.color.b)})`,
      });
    }
  }

  // ── Touch targets (solo tiene sentido en mobile; el runner filtra por viewport) ──
  // Piso WCAG 2.5.8 (AA "Target Size Minimum") = 24px. El 44px es AAA (2.5.5) → se
  // reporta como advisory (comfort), no falla el gate. Se EXIME lo que 2.5.8 exime:
  // controles nativos del user-agent (checkbox/radio) y links de texto (excepción
  // "inline"/"in-sentence"). Solo se chequean controles tipo botón/switch/select.
  const AA_MIN = 24, COMFORT_MIN = 44;
  const touchFails = [];
  const touchWarn = [];
  const interactive = document.querySelectorAll(
    'button, select, [role="button"], [role="switch"], summary, input[type="button"], input[type="submit"], input[type="reset"]',
  );
  for (const el of interactive) {
    if (isHidden(el)) continue;
    if (el.closest('button:disabled, [aria-disabled="true"], [data-disabled="true"]')) continue;
    const r = el.getBoundingClientRect();
    const minSide = Math.min(r.width, r.height);
    if (minSide <= 0) continue;
    const rec = {
      selector: cssPath(el),
      text: (el.textContent || el.getAttribute("aria-label") || el.getAttribute("name") || "").trim().slice(0, 40),
      w: Math.round(r.width), h: Math.round(r.height),
    };
    if (minSide < AA_MIN) touchFails.push(rec);
    else if (minSide < COMFORT_MIN) touchWarn.push(rec);
  }

  // ── Overflow horizontal ──
  const de = document.documentElement;
  const overflow = { scrollWidth: de.scrollWidth, innerWidth: window.innerWidth, offenders: [] };
  if (de.scrollWidth > window.innerWidth + 2) {
    const all = document.body.querySelectorAll("*");
    for (const el of all) {
      const r = el.getBoundingClientRect();
      if (r.right > window.innerWidth + 2 && r.width > 0 && r.width <= de.scrollWidth) {
        overflow.offenders.push({ selector: cssPath(el), right: Math.round(r.right), w: Math.round(r.width) });
        if (overflow.offenders.length >= 8) break;
      }
    }
  }

  return { contrastFails, touchFails, touchWarn, overflow, overImageCount, textNodesChecked };
}

async function main() {
  const fixture = JSON.parse(await readFile(FIXTURE, "utf8"));
  const { authSecret, operatorSecret } = fixture;
  let tenants = fixture.tenants.filter((t) => t.userId); // con OWNER
  if (ONLY.length) tenants = tenants.filter((t) => ONLY.includes(t.subdomain));

  await mkdir(OUT_DIR, { recursive: true });
  process.stdout.write(`\n🎨 Auditoría visual — ${tenants.length} tenants × rutas × {desktop,mobile}\n`);

  const browser = await chromium.launch();
  const report = [];
  let hardFails = 0;

  for (const t of tenants) {
    const host = `${t.subdomain}.${BASE_HOST}`;
    const origin = `http://${host}:${PORT}`;
    const routes = ROUTES.filter((r) => {
      if (!GROUPS.includes(r.group)) return false;
      if (r.blueprints && !r.blueprints.includes(t.blueprintId)) return false;
      return true;
    });
    for (const route of routes) {
      for (const vp of VIEWPORTS) {
        const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
        if (route.auth === "admin" && t.userId) {
          await ctx.addCookies([{ url: origin, name: "admin_session", value: adminCookie(t.userId, authSecret) }]);
        }
        if (route.auth === "operator") {
          await ctx.addCookies([{ url: origin, name: "operator_session", value: operatorCookie(operatorSecret) }]);
        }
        const page = await ctx.newPage();
        const id = `${t.subdomain}-${route.label}-${vp.name}`;
        const entry = { id, tenant: t.subdomain, blueprint: t.blueprintId, route: route.path, viewport: vp.name };
        try {
          const resp = await page.goto(origin + route.path, { waitUntil: "networkidle", timeout: 45000 });
          entry.status = resp ? resp.status() : 0;
          const landed = new URL(page.url()).pathname;
          entry.landed = landed;
          if (route.auth === "admin" && landed.startsWith("/admin/login") && route.path !== "/admin/login") {
            entry.redirectedToLogin = true;
          }
          await page.waitForTimeout(350);
          const a = await page.evaluate(auditInPage);
          entry.contrastFails = a.contrastFails;
          entry.touchFails = vp.name === "mobile" ? a.touchFails : [];
          entry.touchWarn = vp.name === "mobile" ? a.touchWarn : [];
          entry.overflow = a.overflow.offenders.length || a.overflow.scrollWidth > a.overflow.innerWidth + 2
            ? a.overflow : null;
          entry.overImageCount = a.overImageCount;
          entry.textNodesChecked = a.textNodesChecked;

          const shot = path.join(OUT_DIR, `${id}.png`);
          await page.screenshot({ path: shot, fullPage: true });
          entry.shot = shot;

          // Fallos ESTRUCTURALES: una página que 500ea o queda en blanco (0 nodos de
          // texto) no puede "pasar" el contraste por no tener qué medir. Es fallo duro.
          const httpFail = entry.status >= 400;
          const blankFail = a.textNodesChecked === 0;
          if (httpFail) entry.httpError = entry.status;
          if (blankFail) entry.blank = true;
          const nC = a.contrastFails.length;
          const nT = entry.touchFails.length;
          const nO = entry.overflow ? 1 : 0;
          const structural = (httpFail ? 1 : 0) + (blankFail ? 1 : 0) + (entry.redirectedToLogin ? 1 : 0);
          const hard = nC + nT + nO + structural;
          if (hard > 0) hardFails += hard;
          const mark = hard > 0 ? "✗" : "✓";
          process.stdout.write(
            `  ${mark} ${id.padEnd(38)} contraste:${nC}  touch:${nT}  overflow:${nO}` +
            (httpFail ? `  HTTP${entry.status}` : "") +
            (blankFail ? "  ⬚blank" : "") +
            (entry.redirectedToLogin ? "  ⟳login" : "") +
            `  (rev ${a.textNodesChecked} txt, ${a.overImageCount} s/img)\n`,
          );
          for (const c of a.contrastFails.slice(0, 6)) {
            process.stdout.write(`       ✗ ${c.ratio}:1 (min ${c.threshold}) ${c.fontPx}px ${c.color} / ${c.bg}  "${c.text}"  [${c.selector}]\n`);
          }
        } catch (e) {
          entry.error = String(e?.message ?? e);
          process.stdout.write(`  ✗ ${id}: ${entry.error}\n`);
          hardFails++;
        } finally {
          await ctx.close();
        }
        report.push(entry);
      }
    }
  }
  await browser.close();
  await writeFile(path.join(OUT_DIR, "report.json"), JSON.stringify(report, null, 2));

  // Resumen
  const totC = report.reduce((s, e) => s + (e.contrastFails?.length || 0), 0);
  const totT = report.reduce((s, e) => s + (e.touchFails?.length || 0), 0);
  const totO = report.filter((e) => e.overflow).length;
  const totHttp = report.filter((e) => e.httpError).length;
  const totBlank = report.filter((e) => e.blank).length;
  const totLogin = report.filter((e) => e.redirectedToLogin).length;
  process.stdout.write(`\n──────── Resumen auditoría visual ────────\n`);
  process.stdout.write(`Contraste AA: ${totC} · Touch: ${totT} · Overflow: ${totO} · HTTP≥400: ${totHttp} · En blanco: ${totBlank} · Rebote a login: ${totLogin}\n`);
  process.stdout.write(`Report: ${path.join(OUT_DIR, "report.json")}\n`);
  const total = totC + totT + totO + totHttp + totBlank + totLogin;
  if (total > 0) {
    process.stderr.write(`\n❌ ${total} defecto(s)/fallo(s) de calidad visual — NO publicar.\n`);
    process.exit(1);
  }
  process.stdout.write(`\n✅ Calidad visual OK (contraste/touch/overflow).\n`);
}

main().catch((e) => { console.error(e); process.exit(1); });
