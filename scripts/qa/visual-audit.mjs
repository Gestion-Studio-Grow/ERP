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
// Touch targets: botones, selects, switches y summary con lado menor < 44px en el
// celular → FALLA (antes 24px fallaba y 44px era aviso; desde la ola 4 el piso de la
// casa es 44px, h-11, para todo lo que se toca con el dedo). `TOQUE_MIN=24` vuelve al
// piso WCAG 2.5.8 si hiciera falta medir contra el mínimo legal.
//
// Overflow: scrollWidth > innerWidth (mobile sobre todo) → falla, y reporta los
// elementos que se desbordan para poder arreglarlos.
//
// RUTAS: las del panel salen del REGISTRO DE APPS (src/apps/registro.ts): toda app lista
// con ruta fija entra sola al gate, en los negocios de su rubro. Nadie tiene que acordarse
// de sumarla acá. Si en un negocio la app no está (su página manda a "App no disponible" o
// al Inicio), se anota como omitida y no se mide: ahí no hay pantalla que mirar. Pero sólo
// puede faltar una app que tiene con qué faltar (un módulo, un rubro o una edición): una del
// núcleo que rebota es una regresión y FALLA, no se omite. Las omitidas se listan al final.
// El registro es TypeScript: se lee con un node hijo con tsx (`--listar-apps`), así el
// gate sigue corriendo con `node` a secas.
//
// USO:
//   BASE_HOST=localhost PORT=3220 FIXTURE=path/qa-tenants.json \
//     node scripts/qa/visual-audit.mjs
//   OUT_DIR   carpeta de screenshots + report.json (default ./qa-shots/audit)
//   ONLY      coma-separado: subdominios a auditar (default: todos los del fixture)
//   GROUPS    coma-separado: public,flow,admin,operador (default: todos)
//   TOQUE_MIN piso táctil en px en el celular (default 44)
//   CHROMIUM_PATH  ejecutable de Chromium si Playwright no trae el suyo
// ============================================================================

import { mkdir, writeFile, readFile } from "node:fs/promises";
import { createHmac } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const RAIZ = fileURLToPath(new URL("../../", import.meta.url));
const BASE_HOST = process.env.BASE_HOST ?? "localhost";
const PORT = Number(process.env.PORT ?? 3220);
const OUT_DIR = path.resolve(process.env.OUT_DIR ?? "qa-shots/audit");
const FIXTURE = process.env.FIXTURE ?? path.resolve("../qa-tenants.json");
const ONLY = (process.env.ONLY ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const GROUPS = (process.env.GROUPS ?? "public,flow,admin,operador").split(",").map((s) => s.trim());

// El celular de referencia de la casa es de 412 px (principios de UX de la ola 4).
export const VIEWPORTS = [
  { name: "desktop", width: 1280, height: 900 },
  { name: "mobile", width: 412, height: 915 },
];

const TOQUE_MIN = Number(process.env.TOQUE_MIN ?? 44);

// Rubros de los negocios del gate (blueprintId del fixture) por rubro de app del registro.
const MOSTRADOR = ["velas", "padel", "carniceria"];
const BLUEPRINTS_DE_RUBRO = { servicios: ["servicios"], mostrador: MOSTRADOR, carniceria: ["carniceria"] };

// Rutas que no son apps del registro. `blueprints` limita a ciertos rubros (undefined = todos).
// `auth: "admin"` inyecta cookie de sesión del OWNER del tenant.
export const RUTAS_FIJAS = [
  // ── Vidriera pública (sin auth) ──
  { path: "/", label: "home", group: "public" },
  // ── Flujo de reserva / compra ──
  { path: "/reserva", label: "reserva", group: "flow", blueprints: ["servicios"] },
  { path: "/tienda", label: "tienda", group: "flow", blueprints: MOSTRADOR },
  // ── Backoffice /admin fuera del registro ──
  { path: "/admin/login", label: "admin-login", group: "admin" },
  // La pantalla a la que caen todos los rechazos: tiene que verse bien ella también.
  { path: "/admin/no-disponible?app=facturacion", label: "admin-no-disponible", group: "admin", auth: "admin" },
  // La Auditoría con un filtro: mide el estado vacío "No hay acciones con estos filtros" y el
  // formulario de filtros cargado (la del registro se mide sin filtros).
  { path: "/admin/auditoria?tipo=anulaciones", label: "admin-auditoria-filtrada", group: "admin", auth: "admin" },
];

/**
 * Las rutas del panel que salen del registro: toda app lista, que se ofrece y con ruta fija
 * (sin segmentos [id]), en los negocios de su rubro. Puro: lo prueba un test con el
 * registro real (src/app/admin/(dashboard)/inicio/gate-visual.test.ts).
 */
export function rutasDelRegistro(apps) {
  const vistas = new Set();
  const rutas = [];
  for (const app of apps) {
    if (app.estado !== "lista" || app.enLanzador === false) continue;
    if (!app.ruta.startsWith("/admin") || app.ruta.includes("[")) continue;
    if (vistas.has(app.ruta)) continue;
    vistas.add(app.ruta);
    rutas.push({
      path: app.ruta,
      label: `app-${app.id}`,
      group: "admin",
      auth: "admin",
      puedeFaltar: puedeFaltar(app),
      ...(app.rubro ? { blueprints: BLUEPRINTS_DE_RUBRO[app.rubro] } : {}),
    });
  }
  return rutas;
}

/**
 * ¿Hay algo del negocio que pueda dejar a esta app afuera, con la sesión de la dueña (que tiene
 * todas las capacidades)? Es la regla de `motivoNoDisponible` (src/apps/visibles.ts) sin el rol:
 * un módulo que el negocio no tiene, un rubro (la carnicería "lista") o una edición. Una app del
 * núcleo sin nada de eso (Caja del día, Usuarios, Datos del negocio…) está en TODOS los negocios:
 * si rebota, se rompió algo y el gate no puede darla por omitida.
 */
export function puedeFaltar(app) {
  return app.modulo != null || app.rubro != null || app.perfilMin != null;
}

/**
 * Qué hacer con lo que devolvió la navegación: "medir" la pantalla, darla por "omitida" (la app
 * no está en este negocio y tiene con qué no estar) o "falla" (rebotó una que no puede faltar).
 */
export function clasificarAterrizaje(route, aterrizo) {
  if (!aterrizoFueraDeLaApp(route.path, aterrizo)) return "medir";
  return route.puedeFaltar ? "omitida" : "falla";
}

/**
 * ¿La app no está en este negocio? Su página manda a "App no disponible" (requireApp) o, en un
 * producto con tienda, el layout la devuelve al Inicio. Ahí no hay pantalla de la app que medir.
 */
export function aterrizoFueraDeLaApp(pedida, aterrizo) {
  const p = pedida.split("?")[0];
  if (aterrizo === p) return false;
  if (aterrizo === "/admin/no-disponible" && !p.startsWith("/admin/no-disponible")) return true;
  return aterrizo === "/admin" && p !== "/admin";
}

// Lee el registro con un node hijo que carga TypeScript (tsx). Así este script sigue
// corriendo con `node` a secas desde visual-audit-gate.mjs.
function leerRegistro() {
  const r = spawnSync(process.execPath, ["--import", "tsx", fileURLToPath(import.meta.url), "--listar-apps"], {
    // Desde la raíz del repo: ahí se resuelven `tsx` y el alias @/ del registro, aunque el gate
    // se haya lanzado desde otra carpeta.
    cwd: RAIZ,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (r.status !== 0) throw new Error(`no se pudo leer el registro de apps: ${r.stderr || r.error}`);
  return JSON.parse(r.stdout);
}

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
export function auditInPage(toqueMin) {
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
  // Piso de la casa: 44px (h-11) en todo lo que se toca con el dedo; menos → falla. Se
  // EXIME lo que WCAG 2.5.8 exime: controles nativos del user-agent (checkbox/radio) y
  // links de texto (excepción "inline"/"in-sentence"). Solo se chequean controles tipo
  // botón/switch/select. Entre 24 y el piso se anota además como `touchWarn` (lo que
  // pasaría con el mínimo legal), para ver cuánto falta.
  const AA_MIN = 24, COMFORT_MIN = toqueMin;
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
    if (minSide < COMFORT_MIN) touchFails.push(rec);
    if (minSide >= AA_MIN && minSide < COMFORT_MIN) touchWarn.push(rec);
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
  const { chromium } = await import("playwright");
  const fixture = JSON.parse(await readFile(FIXTURE, "utf8"));
  const ROUTES = [...RUTAS_FIJAS, ...rutasDelRegistro(leerRegistro())];
  const { authSecret, operatorSecret } = fixture;
  // Sin filtro por userId: un tenant sin OWNER (ej. verificación contra PRODUCCIÓN,
  // donde no tenemos ni debemos tener la sesión de admin) igual audita sus superficies
  // PÚBLICAS + login; las rutas `auth:"admin"` se saltan si no hay userId (abajo).
  let tenants = fixture.tenants;
  if (ONLY.length) tenants = tenants.filter((t) => ONLY.includes(t.subdomain));

  await mkdir(OUT_DIR, { recursive: true });
  process.stdout.write(`\n🎨 Auditoría visual — ${tenants.length} tenants × ${ROUTES.length} rutas × {desktop,mobile ${VIEWPORTS[1].width}px} · toque ≥ ${TOQUE_MIN}px\n`);

  // CHROMIUM_PATH: un Chromium ya instalado cuando la versión de Playwright no trae el suyo.
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const report = [];
  const omitidas = new Set();

  for (const t of tenants) {
    // Origin explícito (prod: URL plana `https://<slug>-erp.vercel.app`) o derivado
    // del subdominio (local: `http://<sub>.localhost:PORT`).
    const origin = t.origin ?? `http://${t.subdomain}.${BASE_HOST}:${PORT}`;
    const routes = ROUTES.filter((r) => {
      if (!GROUPS.includes(r.group)) return false;
      if (r.blueprints && !r.blueprints.includes(t.blueprintId)) return false;
      // Sin sesión de admin (prod) → saltar rutas autenticadas (no fallar por rebote).
      if (r.auth === "admin" && !t.userId) return false;
      return true;
    });
    for (const route of routes) {
      for (const vp of VIEWPORTS) {
        // Omitida en una medida (la app no está en este negocio): tampoco se mide en la otra.
        if (omitidas.has(`${t.subdomain}|${route.path}`)) continue;
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
          const destino = clasificarAterrizaje(route, landed);
          if (destino === "omitida") {
            entry.omitida = `no está en este negocio (fue a ${landed})`;
            omitidas.add(`${t.subdomain}|${route.path}`);
            process.stdout.write(`  · ${id.padEnd(38)} omitida: ${entry.omitida}\n`);
            report.push(entry); // al reporte igual: el resumen las cuenta y las lista
            continue;
          }
          if (destino === "falla") {
            // Una app del núcleo que rebota: la pantalla de rechazo no la reemplaza en la medida.
            entry.rebote = landed;
            process.stdout.write(`  ✗ ${id.padEnd(38)} REBOTÓ a ${landed}: es del núcleo, tiene que abrir en todos los negocios\n`);
            report.push(entry);
            continue;
          }
          await page.waitForTimeout(350);
          const a = await page.evaluate(auditInPage, TOQUE_MIN);
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
  const totErr = report.filter((e) => e.error).length; // navegación/excepción = fallo duro
  const totOmit = report.filter((e) => e.omitida).length; // no es fallo: la app no está en ese negocio
  const totRebote = report.filter((e) => e.rebote).length; // app del núcleo que rebotó = fallo duro
  process.stdout.write(`\n──────── Resumen auditoría visual ────────\n`);
  process.stdout.write(`Contraste AA: ${totC} · Touch (<${TOQUE_MIN}px): ${totT} · Overflow: ${totO} · HTTP≥400: ${totHttp} · En blanco: ${totBlank} · Rebote a login: ${totLogin} · Errores: ${totErr} · Rebotes del núcleo: ${totRebote} · Omitidas: ${totOmit}\n`);
  // Las omitidas, a la vista y por negocio: si una app que debía estar aparece acá, es un hallazgo.
  const omitidasPorNegocio = new Map();
  for (const e of report.filter((x) => x.omitida)) {
    omitidasPorNegocio.set(e.tenant, [...(omitidasPorNegocio.get(e.tenant) ?? []), e.route]);
  }
  for (const [negocio, rutas] of omitidasPorNegocio) {
    process.stdout.write(`  omitidas en ${negocio} (${rutas.length}): ${rutas.join(", ")}\n`);
  }
  process.stdout.write(`Report: ${path.join(OUT_DIR, "report.json")}\n`);
  const total = totC + totT + totO + totHttp + totBlank + totLogin + totErr + totRebote;
  if (total > 0) {
    process.stderr.write(`\n❌ ${total} defecto(s)/fallo(s) de calidad visual — NO publicar.\n`);
    process.exit(1);
  }
  process.stdout.write(`\n✅ Calidad visual OK (contraste/touch/overflow).\n`);
}

// `--listar-apps`: el modo del node hijo con tsx (ver `leerRegistro`). Imprime el registro y sale.
async function listarApps() {
  const { REGISTRO_APPS } = await import("../../src/apps/registro.ts");
  process.stdout.write(
    JSON.stringify(
      REGISTRO_APPS.map((a) => ({
        id: a.id,
        ruta: a.ruta,
        estado: a.estado,
        rubro: a.rubro,
        enLanzador: a.enLanzador,
        modulo: a.modulo,
        perfilMin: a.perfilMin,
      })),
    ),
  );
}

// Sólo corre si se lo invoca como script: los tests importan las funciones puras de arriba.
const esScript = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (esScript) {
  const tarea = process.argv.includes("--listar-apps") ? listarApps() : main();
  tarea.catch((e) => { console.error(e); process.exit(1); });
}
