# Diseño C · Factoque: propuesta de estética (en espera del dueño)

**Estado:** propuesta, sin implementar. Está en espera de la decisión del dueño. La orden de ORQ-007 fue «Diseño C sigue en espera del dueño: no implementar».

Este documento junta, en el repo, todo lo que una sesión nueva necesita para construir C1 a C5 y resolver la tipografía:
- el diagnóstico;
- cada cambio, con `archivo:línea`;
- el CSS y el JS del prototipo del «después»;
- los scripts que levantan el servidor local y sacan las capturas.

**Las capturas (PNG) no están en Git**, por la regla «nada binario en Git». Se regeneran con los scripts del final:
- 15 pantallas, a 390 y 1440 px, antes y después;
- deviceScaleFactor 2;
- servidor y base Postgres local efímeros, nunca Neon;
- datos inventados.

**Base de la medición:** `main` c15c3f7. Las líneas citadas son de ese commit. Antes de construir, hay que revisarlas contra el `main` de ese momento.

---


Etapa de PROPUESTA: sin commits de código. Base: origin/main c15c3f7, build propio en
un worktree aparte, base Postgres local efímera (nunca Neon), datos inventados («Yoga Ana», ARCA simulada).
Capturas (deviceScaleFactor 2, 390 y 1440 px): (scratchpad de la sesión)/capturas/<pantalla>-<390|1440>-<antes|despues>.png
Pantallas: portada, planes, alta-1/2/3, terminos, privacidad, arrepentimiento, baja, login, app-emitir,
app-emitir-lleno, app-facturas, app-cuenta, app-arca. 30 antes + 30 después, 0 con scroll horizontal.
Prototipo del «después»: (scratchpad de la sesión)/despues.css + (scratchpad de la sesión)/despues.js (inyectados con addStyleTag; los !important son sólo
por la inyección: el cambio real edita la regla en su lugar).

## Diagnóstico
El panel (donde se factura) y la vidriera son dos mundos sin relación. El panel no tiene marca ni jerarquía:
el acto central (el monto) es un campo chico. La vidriera usa el cobre como decoración en todas partes, contra
la gramática de marca («un acento: el cobre marca el punto de acción»; el nudo del isotipo = el total).

## C1 · Barra del panel con marca y pestaña activa
- Antes: «Factoque» en texto de 14 px sin isotipo; pestañas que parten en dos líneas a 390 px y sin estado
  activo; el sello GSG del pie pesa más que la marca del producto.
- Después: isotipo F06-A + nombre; 3 pestañas en una fila; activa con filete de 3 px (aria-current); sello a 34 px.
- Dónde: src/app/facturita/app/layout.tsx:69-90 (marca :71-73, pestañas :74-84), pie :93-95. NO-TOCAR (PR abierto).
- Capturas: app-emitir-390-antes/despues, app-facturas-1440-antes/despues.
- Riesgo: bajo. aria-current necesita la ruta activa (componente cliente chico o usePathname); no toca lógica.

## C2 · Emitir: el monto es el protagonista y el botón es EL punto de acción
- Antes: monto en input común con etiqueta de 11 px en mayúsculas; «Emitir» chico a la izquierda en escritorio y
  con borde punteado cuando está deshabilitado (parece roto); tres títulos seguidos («Mis productos / Otra
  factura / Facturar»).
- Después: monto 72 px de alto, 36 px, peso 600, cifras tabulares; etiqueta en 16 px; «Emitir» ancho completo y
  56 px en celu (mín. 280 px en escritorio), deshabilitado sólido y atenuado; se saca el h2 redundante.
- Dónde: src/components/facturacion/EmitirComprobante.tsx:408 (h2), :433 (monto), :650 (botón);
  src/app/facturita/app/PantallaEmitir.tsx:119-120. NO-TOCAR los dos.
- Capturas: app-emitir-390-*, app-emitir-lleno-390-*, app-emitir-lleno-1440-*.
- Riesgo: medio. EmitirComprobante es compartido con el backoffice: aplicar por variante/prop de Factoque, no
  global. Sólo clases; no se toca cálculo ni envío.

## C3 · Vidriera: un solo acento
- Antes: cobre en la itálica de cada H2, antetítulo, viñetas, globos numerados, banda superior de cada tarjeta,
  numerales gigantes de los pasos y «+» de preguntas. El CTA compite con todo.
- Después: cobre sólo en CTA, «Gratis.» del H1 y el total de la factura de ejemplo (el nudo). El resto en tinta;
  viñetas y numerales cuadrados (gramática rectilínea del isotipo).
- Dónde: src/app/facturita/piel.ts:50 (.fx-h2 em), :113 (.fx-garantias li::before), :159 (.fx-hoja, banda),
  :172 (.fx-hoja-total strong), :184 (.fx-marca-n), :236 (.fx-lista li::before), :248 (.fx-faq summary span).
  NO-TOCAR.
- Capturas: portada-1440-*, portada-390-*, planes-1440-*.
- Riesgo: bajo (sólo color). Verificar contraste AA del texto en tinta tenue.

## C4 · Esquinas de la familia y pasos sin «3 tarjetas con sombra»
- Antes: radios de 14–20 px y sombras grandes contra un logo de ángulos rectos; «Así de corto» son 3 tarjetas con
  sombra en grilla (patrón prohibido en .claude/rules/marca.md).
- Después: botones y campos 6 px, hojas 8 px, sello 4 px, sin sombras de tarjeta; pasos como renglones con filete
  de tinta y etiqueta «PASO n»; plan destacado con borde de 2 px en tinta en vez de banda cobre.
- Dónde: src/app/facturita/piel.ts:64 (.fx-btn), :159 (.fx-hoja), :174 (.fx-sello), :220-223 (.fx-pasos/.fx-paso/
  .fx-paso-n), :228 (.fx-hoja-plan), :275 (.fx-alta-input). NO-TOCAR. El texto «PASO» iría en page.tsx:130 (NO-TOCAR).
- Capturas: portada-1440-*, planes-1440-*, alta-1/2/3-390-*.
- Riesgo: bajo-medio: cambia el carácter de la vidriera; es decisión de marca, conviene que el dueño vea el par.

## C5 · Ajustes de alineación
- Mis facturas: PDF y Anular apilados dejan renglones altos y vacíos → en línea, centrados al renglón.
  src/app/facturita/app/facturas/page.tsx:87-102. LIBRE (único cambio aplicable hoy sin coordinar).
- Pasos de instalación: el <ol> perdió los numerales → list-style decimal. piel.ts:242. NO-TOCAR.
- Hueco bajo el héroe en ≥1280 px → menos padding inferior. piel.ts (.fx-hero). NO-TOCAR.
- Capturas: app-facturas-1440-*, app-facturas-390-*, portada-1440-*.
- Riesgo: bajo.

## Límites y decisiones para el dueño
- Casi todo Factoque está en no-tocar.txt (PR abiertos): C1–C4 esperan a que cierren o van dentro de esos PR.
- Space Grotesk (logo) no está cargada como fuente en el repo: usarla en la barra sería un activo nuevo; hoy la
  pantalla suma 3 familias (logo SVG + Fraunces + Hanken) contra la regla de 2. Decisión del dueño.
- Enlaces legales (arrepentimiento/baja) intactos. Sin lógica ni plata.
- No llegué a CH (turnos/caja/vender), MIA ni (site): quedan para otra tanda.
- Artefactos del prototipo: en capturas fullPage de celu la barra fija inferior aparece a media página; en alta-3
  el script tipeó el CUIT en el nombre. No son defectos del producto.

---

## Tipografía: decisión pendiente del dueño

- **Hoy:** la pantalla suma 3 familias: el logo en SVG (Space Grotesk, ya convertido a trazos), Fraunces y Hanken. La regla de marca dice 2.
- **Opción A (recomendada):** dejar el logo como SVG y no cargar Space Grotesk.
  - Quedan 2 familias de texto: Fraunces para los títulos de la vidriera y Hanken para la UI y el panel.
  - El prototipo C1 ya usa así el isotipo en SVG.
  - No suma ningún archivo de fuente.
- **Opción B:** cargar Space Grotesk para la barra del panel.
  - Es un activo nuevo: una fuente más que descargar, y una tercera familia contra la regla.
  - Sólo se justifica si el dueño quiere el nombre «Factoque» en texto vivo con la letra del logo.
- **Dónde se decide:** la familia de la vidriera está en `src/app/facturita/piel.ts` (`--fx-sans` y los títulos `.fx-h2`). El panel usa la piel `fable` del layout `src/app/facturita/app/layout.tsx`.

## Qué bloquea la construcción

La mayoría de los archivos de C1 a C4 están en PR abiertos: `layout.tsx`, `EmitirComprobante.tsx`, `PantallaEmitir.tsx`, `piel.ts` y `page.tsx`.

Hay dos caminos:
- construir cuando esos PR cierren;
- meter los cambios dentro de esos mismos PR.

Antes de construir, hay que revisar con `git log` qué PR tiene cada archivo en ese momento. C5, en «Mis facturas» (`src/app/facturita/app/facturas/page.tsx:87-102`), era el único libre el 14/11.

## Qué falta antes de publicar (cuando el dueño lo apruebe)

1. Aplicar cada regla en su lugar, sin `!important` y sin inyección.
2. C2 va como variante de Factoque, no global, porque `EmitirComprobante` es compartido con el backoffice.
3. En C1, `aria-current` necesita la ruta activa: un componente cliente chico con `usePathname`.
4. Tests:
   - de fuente para las clases clave;
   - de contraste AA para el texto en tinta tenue de C3.
5. QA clic por clic a 390 y 1440 px, con capturas antes y después regeneradas con los scripts de abajo.
6. Revisión del guardián de marca (`.claude/rules/marca.md`) y un certificador distinto del constructor.

---

## Prototipo del «después»: CSS

Se inyecta con `page.addStyleTag`. Los `!important` están sólo por la inyección.

```css
/* ===== PROTOTIPO «después» · sólo presentación · se inyecta con page.addStyleTag ===== */

/* ── C1 · Panel: barra con marca, pestañas que no se parten y pestaña activa ── */
[data-skin="fable"] > header > div{flex-wrap:wrap;row-gap:0;padding-bottom:0;align-items:center}
[data-skin="fable"] > header .px-marca{display:inline-flex;align-items:center;gap:10px;font-size:1.0625rem;font-weight:600;letter-spacing:-.01em;color:var(--text-strong)}
[data-skin="fable"] > header .px-marca svg{width:26px;height:26px;flex:none}
[data-skin="fable"] > header > div > span:not(.px-marca){display:none}
[data-skin="fable"] > header nav{order:3;width:100%;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:0;margin-top:6px}
[data-skin="fable"] > header nav a{display:flex;align-items:center;justify-content:center;min-height:44px;padding:0 4px;border-radius:0;white-space:nowrap;font-size:.9375rem;border-bottom:3px solid transparent}
[data-skin="fable"] > header nav a[aria-current="page"]{color:var(--text-strong);font-weight:600;border-bottom-color:var(--accent)}
@media (min-width:640px){
  [data-skin="fable"] > header > div{flex-wrap:nowrap}
  [data-skin="fable"] > header nav{order:0;width:auto;display:flex;gap:4px;margin:0 0 0 12px;align-self:stretch}
  [data-skin="fable"] > header nav a{min-height:56px;padding:0 14px}
}
[data-skin="fable"] > footer{opacity:.75}
[data-skin="fable"] > footer svg{max-height:34px;width:auto}

/* ── C2 · Emitir: el monto manda y «Emitir» es EL botón ── */
[data-skin="fable"] [data-testid="emitir-monto"]{height:72px;font-size:2.25rem;font-weight:600;letter-spacing:-.03em;font-variant-numeric:tabular-nums;padding-inline:16px;border-radius:6px;border-width:1.5px}
[data-skin="fable"] [data-testid="emitir-monto"]::placeholder{font-weight:500;opacity:.45}
[data-skin="fable"] label[for]:has(+ * [data-testid="emitir-monto"]),
[data-skin="fable"] .px-rotulo-monto{font-size:1rem!important;letter-spacing:0!important;text-transform:none!important;font-weight:600!important;color:var(--text-strong)!important}
[data-skin="fable"] [data-testid="emitir-boton"]{width:100%;min-height:56px;font-size:1.0625rem!important;font-weight:600;border-radius:6px;border-style:solid!important}
[data-skin="fable"] [data-testid="emitir-boton"]:disabled{background:var(--surface-sunken);border-color:var(--line);color:var(--text-muted)}
@media (min-width:640px){[data-skin="fable"] [data-testid="emitir-boton"]{width:auto;min-width:280px}}
[data-skin="fable"] .px-oculto{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}
[data-skin="fable"] main .rounded-xl,[data-skin="fable"] main .rounded-lg,[data-skin="fable"] main .rounded-2xl{border-radius:6px}

/* ── C5 · Mis facturas: acciones en un renglón ── */
[data-skin="fable"] main table td:last-child{vertical-align:middle}
[data-skin="fable"] main table td:last-child > *{display:inline-flex;vertical-align:middle;margin-left:12px}
[data-skin="fable"] main table td{vertical-align:middle}

/* ── C3 · Vidriera: un solo acento (el cobre marca la acción, no decora) ── */
.fx .fx-h2 em{color:inherit!important}
.fx .fx-ante{color:var(--fx-tenue)!important}
.fx .fx-garantias li::before,.fx .fx-lista li::before{border-radius:0!important;background:var(--fx-tinta)!important;width:6px!important;height:6px!important}
.fx .fx-marca-n{border-radius:0!important;background:var(--fx-tinta)!important}
.fx .fx-hoja,.fx .fx-hoja-plan,.fx .fx-hoja-form,.fx .fx-doc,.fx .fx-paso{box-shadow:none!important}
.fx .fx-hoja{box-shadow:0 24px 48px -32px rgba(27,27,27,.45)!important}
.fx .fx-hoja-total strong{color:var(--fx-cobre-tinta)!important}           /* el nudo del logo = el total */
.fx .fx-faq summary span{color:var(--fx-tinta)!important}

/* ── C4 · Vidriera: esquinas de la familia y pasos sin «3 tarjetas con sombra» ── */
.fx .fx-btn,.fx .fx-btn--chico,.fx .fx-panel .fx-btn{border-radius:6px!important}
.fx .fx-hoja,.fx .fx-hoja-plan,.fx .fx-hoja-form,.fx .fx-doc,.fx .fx-cuando,.fx .fx-resumen-alta{border-radius:8px!important}
.fx .fx-alta-input,.fx .fx-campo,.fx .fx-opcion,.fx .fx-condicion{border-radius:6px!important}
.fx .fx-sello,.fx .fx-rotulo{border-radius:4px!important}
.fx .fx-hoja-plan{border:1px solid var(--fx-borde)!important}
.fx .fx-hoja-plan:not(.fx-hoja-plan--quieta){border:2px solid var(--fx-tinta)!important}
.fx .fx-hoja-form,.fx .fx-doc{border:1px solid var(--fx-borde)!important}
.fx .fx-pasos{gap:0 clamp(24px,3vw,48px)!important}
.fx .fx-paso{overflow:visible!important;padding:20px 0 28px!important;border-radius:0!important;background:none!important;border-top:2px solid var(--fx-tinta)!important}
.fx .fx-paso-n{margin:0 0 14px!important;font-family:var(--fx-sans)!important;font-weight:600!important;font-size:.875rem!important;letter-spacing:.08em!important;color:var(--fx-tenue)!important}
.fx .fx-paso-n::before{content:"PASO "}

/* ── C5 · Vidriera: los pasos de instalación recuperan su número; el héroe no deja un hueco ── */
.fx .fx-dos ol{list-style:decimal!important;padding-left:1.4em!important}
.fx .fx-dos ol li::marker{font-weight:600!important;color:var(--fx-tinta)!important}
@media (min-width:1280px){.fx .fx-heroe{padding-bottom:clamp(4rem,5vw,6rem)}}
```

## Prototipo del «después»: JS

Agrega el isotipo y marca la pestaña activa (C1).

```js
(() => {
  const h = document.querySelector('[data-skin="fable"] > header > div'); if (!h || h.querySelector('.px-marca')) return;
  const s = h.querySelector('span'); const m = document.createElement('span'); m.className = 'px-marca';
  m.innerHTML = '<svg viewBox="0 0 100 100" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="10" stroke-linecap="square" stroke-linejoin="miter"><path d="M20 90V10H80V90"/><path d="M38 30H62"/><path d="M38 48H62"/></g><rect x="45" y="64" width="10" height="10" fill="var(--accent)"/></svg>Factoque';
  h.insertBefore(m, s);
  const p = location.pathname.replace(/\/$/, '');
  h.querySelectorAll('nav a').forEach((a) => { const r = a.getAttribute('href'); if (r === p || (r !== '/facturita/app' && p.startsWith(r))) a.setAttribute('aria-current', 'page'); });
  const monto = document.querySelector('[data-testid="emitir-monto"]');
  if (monto) { const l = monto.id && document.querySelector(`label[for="${monto.id}"]`); if (l) l.classList.add('px-rotulo-monto'); }
  document.querySelectorAll('main h2').forEach((x) => { if (x.textContent.trim() === 'Facturar') x.classList.add('px-oculto'); });
})();
```

## Scripts para regenerar las capturas

Los dos scripts van en `scripts/qa/` de un worktree.
- `_diseno-servir.mjs` arma una base efímera en un Postgres **local** y levanta el build en el puerto 3200. Usa secretos aleatorios de un solo uso y la clave de prueba de los fixtures, no credenciales reales.
- `_diseno-capturar.mjs` recorre las 15 pantallas y saca el antes y el después.

### `_diseno-servir.mjs`

```js
// Prototipo de diseño (scratchpad, NO va a Git): base efímera local + next start en 3200, y se queda vivo.
import { spawn } from "node:child_process";
import { writeFileSync, createWriteStream } from "node:fs";
import http from "node:http";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { crearBaseEfimera, prismaComoDuenio, CLAVE_DE_PRUEBA } from "../../src/test/base-efimera.ts";
const RAIZ = fileURLToPath(new URL("../../", import.meta.url));
const OUT = process.env.OUT;
const PORT = 3200;
const base = await crearBaseEfimera();
const duenio = await prismaComoDuenio(base);
await duenio.tenant.update({ where: { id: base.b.id }, data: { name: "Yoga Ana", blueprintId: "facturita", arcaCuit: "20222222223", arcaPuntoVenta: 2, arcaHomologacion: true, arcaCondicionIva: "MONOTRIBUTO" } });
const SEC = "qa-diseno-auth-secret-0123456789abcdef";
const env = { ...process.env, DATABASE_URL: base.urlApp, OPERATOR_DATABASE_URL: base.urlDuenio, MIGRATE_DATABASE_URL: base.urlDuenio, RLS_ENFORCEMENT: "on",
  FISCAL_MASTER_KEY: randomBytes(32).toString("base64"), APP_BASE_DOMAIN: "localhost", AUTH_SECRET: SEC, OPERATOR_SECRET: SEC + "-op", OPERATOR_PASSWORD: "qa-clave-operador",
  ARCA_INVOICING_ENABLED: "true", NODE_ENV: "production", PORT: String(PORT) };
for (const v of ["FORCE_TENANT_SLUG", "TENANT_HOST_MAP", "DEMO_MODE_ENABLED", "MP_MODO", "ARCA_MODO", "OPERADORES", "OPERADOR_DUENIO"]) delete env[v];
const app = spawn(process.execPath, [path.join(RAIZ, "node_modules/next/dist/bin/next"), "start", "-p", String(PORT)], { cwd: RAIZ, env, stdio: ["ignore", "pipe", "pipe"] });
const log = createWriteStream(path.join(OUT, "servidor.txt")); app.stdout.pipe(log); app.stderr.pipe(log);
const pedir = () => new Promise((ok) => { const r = http.get({ host: "127.0.0.1", port: PORT, path: "/admin/login", headers: { host: `${base.b.subdominio}.localhost:${PORT}` } }, (res) => { res.resume(); ok(res.statusCode); }); r.on("error", () => ok(null)); });
for (let i = 0; i < 120; i++) { if ((await pedir()) === 200) break; await new Promise((r) => setTimeout(r, 500)); }
writeFileSync(path.join(OUT, "estado.json"), JSON.stringify({ origin: `http://${base.b.subdominio}.localhost:${PORT}`, apex: `http://localhost:${PORT}`, email: base.b.duenia.email, clave: CLAVE_DE_PRUEBA, subA: base.a.subdominio, emailA: base.a.duenia.email }));
console.log("LISTO");
const cerrar = async () => { app.kill("SIGTERM"); await base.borrar().catch(() => {}); process.exit(0); };
process.on("SIGTERM", cerrar); process.on("SIGINT", cerrar);
setInterval(() => {}, 1e6);
```

### `_diseno-capturar.mjs`

```js
// node scripts/qa/_diseno-capturar.mjs <sufijo> [css] [filtro]   (scratchpad; no va a Git)
import { chromium } from "playwright";
import { readFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";
const OUT = process.env.OUT;
const [sufijo = "antes", cssPath = "", filtro = ""] = process.argv.slice(2);
const E = JSON.parse(readFileSync(path.join(OUT, "estado.json"), "utf8"));
const css = cssPath && existsSync(cssPath) ? readFileSync(cssPath, "utf8") : "";
const AR = { timezoneId: "America/Argentina/Buenos_Aires", locale: "es-AR", reducedMotion: "reduce" };
const DIR = path.join(OUT, "capturas"); const VISTA = path.join(OUT, "vista"); mkdirSync(DIR, { recursive: true }); mkdirSync(VISTA, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.EXE });
const PUB = [["portada", "/facturita"], ["planes", "/facturita/planes"], ["alta-1", "/facturita/alta"], ["terminos", "/facturita/terminos"], ["privacidad", "/facturita/privacidad"], ["arrepentimiento", "/facturita/arrepentimiento"], ["baja", "/facturita/baja"]];
const APP = [["app-emitir", "/facturita/app"], ["app-facturas", "/facturita/app/facturas"], ["app-cuenta", "/facturita/app/cuenta"], ["app-arca", "/facturita/app/arca"], ["login", "/admin/login"]];
async function foto(page, nombre, w) {
  if (css) { await page.addStyleTag({ content: css }); if (process.env.JS) await page.evaluate(readFileSync(process.env.JS, "utf8")); }
  await page.waitForTimeout(350);
  const sw = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  await page.screenshot({ path: path.join(DIR, `${nombre}-${w}-${sufijo}.png`), fullPage: true });
  console.log(`${nombre}-${w}-${sufijo}${sw > 1 ? ` · SCROLL-H ${sw}` : ""}`);
}
for (const w of [390, 1440]) {
  const vp = { width: w, height: w === 390 ? 844 : 900 };
  const pub = await browser.newContext({ viewport: vp, deviceScaleFactor: 2, ...AR });
  const p = await pub.newPage();
  for (const [n, r] of PUB) { if (filtro && !n.includes(filtro)) continue; await p.goto(E.apex + r, { waitUntil: "networkidle" }); await foto(p, n, w); }
  if (!filtro || "alta-2".includes(filtro)) {
    // avanzar el asistente: «Seguir sin conectar» / «Seguir»
    await p.goto(E.apex + "/facturita/alta", { waitUntil: "networkidle" });
    try {
      const b = p.getByRole("button", { name: /seguir|ahora no|salte|después/i }).first();
      await b.click({ timeout: 4000 }); await p.waitForTimeout(400); await foto(p, "alta-2", w);
      const cuit = p.locator("input").first(); await cuit.fill("20-22222222-3").catch(() => {});
      await p.getByRole("button", { name: /seguir/i }).first().click({ timeout: 4000 }); await p.waitForTimeout(400); await foto(p, "alta-3", w);
    } catch (e) { console.log("alta-2: " + String(e.message).slice(0, 120)); }
  }
  await pub.close();
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 2, ...AR });
  const q = await ctx.newPage();
  await q.goto(E.origin + "/admin/login", { waitUntil: "networkidle" });
  if (!filtro || "login".includes(filtro)) await foto(q, "login", w);
  await q.fill('input[name="email"]', E.email); await q.fill('input[name="password"]', E.clave);
  await Promise.all([q.waitForURL((u) => !u.pathname.startsWith("/admin/login"), { timeout: 30000 }), q.click('button[type="submit"]')]);
  if (sufijo === "antes" && w === 390 && !filtro) {
    for (const c of ["Clase de yoga", "Taller de respiración"]) {
      await q.goto(E.origin + "/facturita/app"); await q.getByTestId("emitir-monto").fill("12.500"); await q.getByTestId("emitir-concepto").fill(c);
      await q.getByTestId("emitir-boton").click(); await Promise.race([q.getByTestId("exito").first().waitFor({ timeout: 30000 }), q.getByTestId("error-titulo").first().waitFor({ timeout: 30000 })]).catch(() => {});
      if (c.startsWith("Clase")) await foto(q, "app-emitida", w);
    }
  }
  for (const [n, r] of APP.slice(0, 4)) { if (filtro && !n.includes(filtro)) continue; await q.goto(E.origin + r, { waitUntil: "networkidle" }); await foto(q, n, w); }
  if (!filtro || "app-emitir-lleno".includes(filtro)) {
    await q.goto(E.origin + "/facturita/app", { waitUntil: "networkidle" });
    await q.getByTestId("emitir-monto").fill("12.500").catch(() => {}); await q.getByTestId("emitir-concepto").fill("Clase de yoga").catch(() => {});
    await foto(q, "app-emitir-lleno", w);
  }
  await ctx.close();
}
await browser.close();
```
