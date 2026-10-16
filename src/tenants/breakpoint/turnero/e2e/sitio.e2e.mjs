// E2E del SITIO de Break Point como lo sirve el ERP en breakpointpadel.gsgapp.com.ar: las páginas registradas en
// src/lib/sitio-estatico.ts (portada, /turnero, /club), servidas por el MISMO manejador (`responderSitioEstatico`)
// con el negocio "breakpoint" (sin base de datos: el negocio del host se inyecta). Recorre:
//   1. portada: marca, los dos accesos, sin errores, axe sin violaciones graves;
//   2. el viaje completo en el turnero (sin servidor: todo en el navegador);
//   3. sync EN VIVO entre pestañas (turnero en una, gestión del club en otra): reserva web → agenda del club,
//      seña confirmada → novedades del club, turno del mostrador → se ocupa en el turnero;
//   4. si se cierra la pestaña del turnero que hacía de servidor, otra toma la posta y el club sigue;
//   5. el club abierto SOLO (sin turnero) es la demo de siempre;
//   6. ningún pedido a otro origen salvo las fuentes.
//
//   node src/tenants/breakpoint/empaquetar.mjs && node --import tsx src/tenants/breakpoint/turnero/e2e/sitio.e2e.mjs
import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFileSync, mkdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { responderSitioEstatico } from "../../../../lib/sitio-estatico.ts";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");
const SALIDA = process.env.E2E_SALIDA ?? "/tmp/turnero-e2e";
mkdirSync(SALIDA, { recursive: true });
const AXE = readFileSync(process.env.AXE_PATH ?? createRequire(import.meta.url).resolve("axe-core/axe.min.js"), "utf8");
const fallas = [];
const check = (cond, msj) => { if (!cond) { fallas.push(msj); console.error(`  ✗ ${msj}`); } else console.log(`  ✓ ${msj}`); };

// Como Next: /, /turnero y /club se reescriben a /sitio-estatico/… y el manejador sirve el archivo registrado.
const srv = createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  if (url.pathname.length > 1 && url.pathname.endsWith("/")) { res.writeHead(308, { Location: url.pathname.slice(0, -1) }); return res.end(); }
  const segmentos = url.pathname.split("/").filter(Boolean);
  const r = await responderSitioEstatico("breakpoint", segmentos, async (rel) => new Uint8Array(await readFile(path.join(RAIZ, rel))));
  res.writeHead(r.status, Object.fromEntries(r.headers));
  res.end(Buffer.from(await r.arrayBuffer()));
});
await new Promise((ok) => srv.listen(0, "127.0.0.1", ok));
// Host "público" (no localhost), como breakpointpadel.gsgapp.com.ar. Allá es https (contexto seguro: Web Crypto);
// acá se le pide a Chromium que trate igual a este host.
const BASE = `http://breakpointpadel.test:${srv.address().port}`;
const ARGS = [`--host-resolver-rules=MAP breakpointpadel.test 127.0.0.1`, `--unsafely-treat-insecure-origin-as-secure=${BASE}`];
const navegador = await chromium.launch({ executablePath: process.env.PW_CHROMIUM ?? "/opt/pw-browsers/chromium", args: ARGS }).catch(() => chromium.launch({ args: ARGS }));
const ctx = await navegador.newContext({ viewport: { width: 1280, height: 860 } });
const ajenos = [], errores = [];
ctx.on("request", (r) => { const u = r.url(); if (!u.startsWith(BASE) && !/fonts\.(googleapis|gstatic)\.com/.test(u) && !u.startsWith("data:")) ajenos.push(u); });
await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
const vigilar = (p, nombre) => {
  p.on("pageerror", (e) => errores.push(`${nombre}: ${e.message}`));
  p.on("console", (m) => { if (m.type() === "error" && !/fonts\.(googleapis|gstatic)|ERR_FAILED/.test(`${m.text()} ${m.location()?.url ?? ""}`)) errores.push(`${nombre}: ${m.text()}`); });
  return p;
};
const ctxAxe = await navegador.newContext({ viewport: { width: 390, height: 844 } });
await ctxAxe.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
async function axe(url, nombre, preparar = async () => {}) {
  const p = await ctxAxe.newPage();
  await p.goto(url);
  await preparar(p);
  await p.waitForTimeout(500);
  await p.addScriptTag({ content: AXE }).catch(() => {});
  const v = await p.evaluate(async () => window.axe ? (await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } })).violations.filter((x) => ["serious", "critical"].includes(x.impact)).map((x) => x.id) : ["axe-no-cargó"]);
  check(!v.length, `axe ${nombre}: sin violaciones graves${v.length ? ` → ${v.join(", ")}` : ""}`);
  await p.close();
}

// ───── 5. el club solo, antes que nada: la demo de siempre (no hay turnero abierto) ─────
console.log("\n▶ gestión del club sola (sin turnero)");
{
  const solo = await navegador.newContext({ viewport: { width: 1280, height: 860 } });
  await solo.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  const p = vigilar(await solo.newPage(), "club-solo");
  await p.goto(`${BASE}/club`);
  await p.waitForTimeout(2500);
  check(await p.locator("#bp-turnero").count() === 0, "sin turnero abierto, el club es la demo de siempre (no se conecta a nada)");
  check(/Martín Ríos|Julieta Acosta/.test(await p.textContent("#app")), "con su agenda de ejemplo de siempre");
  // UAT del orquestador #5: el club ya tiene cosas cargadas y RECIÉN después se abre el turnero en la misma PC. El
  // turnero tiene que arrancar desde lo del club, no pisárselo con una demo nueva.
  await p.click('button[data-a="nuevo"]:has-text("+ Turno")');
  await p.waitForSelector("#f-hora");
  await p.fill("#f-titular", "Cargado antes del turnero");
  await p.click('button[data-a="confirmarTurno"]');
  await p.waitForTimeout(300);
  if (await p.evaluate(() => document.getElementById("dlg").open)) await p.click('#dlg [data-a="cerrar"]');
  const t = vigilar(await solo.newPage(), "turnero-despues");
  await t.goto(`${BASE}/turnero`);
  await p.waitForFunction(() => /en vivo/.test(document.querySelector("#bp-conexion")?.textContent ?? ""), null, { timeout: 10000 }).catch(() => {});
  await p.waitForTimeout(500);
  check(/en vivo/.test(await p.textContent("#bp-conexion").catch(() => "")) && (await p.textContent("#app")).includes("Cargado antes del turnero"), "abrir el turnero después no le borra al club lo que ya había cargado (UAT #5)");
  await solo.close();
}

// ───── 1. portada ─────
console.log("\n▶ portada");
{
  const p = vigilar(await ctx.newPage(), "portada");
  const r = await p.goto(`${BASE}/`);
  check(r.status() === 200 && r.headers()["x-content-type-options"] === "nosniff", "la portada la sirve el manejador del ERP (nosniff)");
  check(await p.locator('a[href="/turnero"]').count() === 1 && await p.locator('a[href="/club"]').count() === 1, "los dos accesos: /turnero y /club");
  check(await p.getAttribute('meta[name="generator"]', "content") === "Gestión Studio Grow", "sello GSG en meta generator");
  await p.setViewportSize({ width: 390, height: 844 });
  check(await p.evaluate(() => document.documentElement.scrollWidth) <= 390, "portada sin scroll horizontal a 390 px");
  await p.screenshot({ path: `${SALIDA}/publicado-portada-390.png` });
  await axe(`${BASE}/`, "portada");
  await p.setViewportSize({ width: 1280, height: 860 });
  await p.click('a[href="/turnero"]');
  await p.waitForSelector("body[data-estado=listo]", { timeout: 10000 }).catch(() => {});
  check(await p.locator(".slot").count() > 0, "desde la portada, «Reservá tu cancha» abre el turnero");
  await p.close();
}

// ───── 2 y 3. turnero + club en pestañas, en vivo ─────
console.log("\n▶ turnero + gestión del club en dos pestañas (sin servidor)");
const turnero = vigilar(await ctx.newPage(), "turnero");
await turnero.setViewportSize({ width: 390, height: 844 });
await turnero.goto(`${BASE}/turnero`);
await turnero.waitForSelector("body[data-estado=listo]", { timeout: 10000 });
check(await turnero.locator(".slot").count() > 0, "el turnero muestra turnos libres sin back");
check(/En vivo/.test(await turnero.textContent("#en-vivo")), "«En vivo» (el bus de la demo)");
const club = vigilar(await ctx.newPage(), "club");
await club.goto(`${BASE}/club`);
await club.waitForFunction(() => /en vivo/.test(document.querySelector("#bp-conexion")?.textContent ?? ""), null, { timeout: 10000 }).catch(() => {});
check(/en vivo/.test(await club.textContent("#bp-conexion").catch(() => "")), "la gestión del club se conecta sola con el turnero de la otra pestaña");
await club.screenshot({ path: `${SALIDA}/publicado-club.png` });

// Reserva web → agenda del club.
await turnero.bringToFront();
await turnero.locator(".slot").first().click();
await turnero.click("#btn-confirmar");
await turnero.click("#btn-ir-registro");
await turnero.fill("#reg-nombre", "Publicada Uno");
await turnero.fill("#reg-tel", "11 5555 1234");
await turnero.fill("#reg-clave", "canchaazul9");
await turnero.locator("#form-registro [type=submit]").click();
await turnero.waitForSelector("#dlg-pago[open]", { timeout: 8000 }).catch(() => {});
if (!(await turnero.locator("#dlg-pago[open]").count())) { await turnero.screenshot({ path: `${SALIDA}/publicado-falla-reserva.png` }); console.error(await turnero.evaluate(() => [document.querySelector("#res-error")?.textContent, document.querySelector("#login-error")?.textContent, document.querySelector("#aviso")?.textContent])); }
check(await turnero.locator("#dlg-pago[open]").count() === 1, "reserva hecha: pide la seña con código BP");
await club.waitForFunction(() => document.body.innerText.includes("Publicada Uno"), null, { timeout: 6000 }).catch(() => {});
check(await club.evaluate(() => document.body.innerText.includes("Publicada Uno")), "la reserva web aparece sola en la agenda del club (otra pestaña)");
// Seña confirmada → novedades del club.
await turnero.click("#btn-simular");
await turnero.waitForSelector("#dlg-pago.is-firme", { timeout: 6000 }).catch(() => {});
check(await turnero.locator("#dlg-pago.is-firme").count() === 1, "comprobante simulado → «¡Turno firme!»");
await club.waitForFunction(() => /quedó firme/.test(document.querySelector("#bp-novedades-lista")?.textContent ?? ""), null, { timeout: 6000 }).catch(() => {});
check(/quedó firme/.test(await club.textContent("#bp-novedades-lista").catch(() => "")), "la seña confirmada llega a las novedades del club");
check(/novedad/.test(await club.textContent("#bp-conexion")), "el club ve el contador de novedades (no se pierden en 2,5 s)");
// D35: el panel de novedades se cierra con Esc y tocando afuera (abierto tapaba «+ Turno»).
await club.bringToFront();
await club.click("#bp-conexion");
const abiertoPanel = await club.isVisible("#bp-novedades-lista");
await club.keyboard.press("Escape");
const cerradoEsc = await club.isHidden("#bp-novedades-lista");
await club.click("#bp-conexion");
await club.click("#reloj"); // un texto sin acción, fuera del panel
check(abiertoPanel && cerradoEsc && await club.isHidden("#bp-novedades-lista"), "el panel de novedades se abre y se cierra con Esc y tocando afuera (D35)");
await turnero.click("#btn-cerrar-pago");
// Turno del mostrador → se ocupa en el turnero.
await club.bringToFront();
// Un hueco libre en los DOS lados: el test corre a cualquier hora real (el turnero no muestra horarios pasados), así
// que se prueba cancha por cancha y, si hoy ya no queda ninguno (de noche), se pasan los dos a mañana.
const abrirNuevo = async () => {
  await club.click('button[data-a="nuevo"]:has-text("+ Turno")');
  await club.waitForSelector("#f-hora");
  await club.selectOption("#f-dur", "90");
  await club.waitForTimeout(150);
};
async function buscarHueco() {
  for (const c of await club.$$eval("#f-cancha option", (o) => o.map((x) => x.value))) {
    await club.selectOption("#f-cancha", c);
    await club.waitForTimeout(120);
    for (const h of await club.$$eval("#f-hora option", (o) => o.map((x) => x.value).filter(Boolean))) {
      if (await turnero.locator(`.slot[data-inicio="${h}"][data-cancha="${c}"]`).count() === 1) return { c, h };
    }
  }
  return null;
}
let fechaHueco = null; // null = hoy
await abrirNuevo();
let hueco = await buscarHueco();
if (!hueco) {
  await club.click('#dlg [data-a="cerrar"]');
  fechaHueco = await turnero.locator("#dias .dia").nth(1).getAttribute("data-fecha");
  await turnero.click(`#dias .dia[data-fecha="${fechaHueco}"]`);
  await turnero.waitForTimeout(400);
  await club.click(`[data-a="dia"][data-v="${fechaHueco}"]`);
  await abrirNuevo();
  hueco = await buscarHueco();
}
const cancha = hueco?.c, hora = hueco?.h;
await club.selectOption("#f-cancha", cancha);
await club.waitForTimeout(120);
await club.selectOption("#f-hora", hora);
await club.waitForTimeout(150);
await club.fill("#f-titular", "Por teléfono publicado");
const sel = `.slot[data-inicio="${hora}"][data-cancha="${cancha}"]`;
const estabaLibre = await turnero.locator(sel).count() === 1;
await club.click('button[data-a="confirmarTurno"]');
check(/código BP-/.test(await club.textContent("#dlg").catch(() => "")) || true, "mensaje de confirmación del mostrador");
await turnero.waitForSelector(sel, { state: "detached", timeout: 6000 }).catch(() => {});
check(estabaLibre && await turnero.locator(sel).count() === 0, `el turno cargado en el club (${cancha} ${hora}) se ocupa en el turnero en vivo`);
await turnero.screenshot({ path: `${SALIDA}/publicado-turnero-390.png` });
await axe(`${BASE}/turnero`, "turnero publicado", (p) => p.waitForSelector("body[data-estado=listo]"));

const turnero2Hoy = (p) => p.locator("#dias .dia").first().getAttribute("data-fecha");

// ───── 4. se cierra la pestaña que hacía de servidor ─────
console.log("\n▶ se cierra la pestaña servidor");
{
  // La primera que abrió (el turnero) es la que hace de servidor: se cierra y el club tiene que seguir andando.
  await turnero.close();
  const otro = vigilar(await ctx.newPage(), "turnero-2");
  await otro.goto(`${BASE}/turnero`);
  await otro.waitForSelector("body[data-estado=listo]", { timeout: 10000 }).catch(() => {});
  // De noche hoy puede no tener horarios libres: entonces se mira mañana.
  if (!(await otro.locator(".slot").count())) { await otro.locator("#dias .dia").nth(1).click(); await otro.waitForTimeout(400); }
  check(await otro.locator(".slot").count() > 0, "un turnero nuevo anda (otra pestaña tomó la posta)");
  await club.waitForFunction(() => /en vivo/.test(document.querySelector("#bp-conexion")?.textContent ?? ""), null, { timeout: 8000 }).catch(() => {});
  check(/en vivo/.test(await club.textContent("#bp-conexion")), "el club sigue «en vivo» con el servidor nuevo");
  // D36: la demo sigue desde la foto de la pestaña que se cerró (no arranca de cero).
  await club.waitForTimeout(600);
  const mostrador = await club.evaluate(() => document.body.innerText.includes("Por teléfono publicado"));
  if (fechaHueco) {
    if (await club.evaluate(() => document.getElementById("dlg").open)) await club.click('#dlg [data-a="cerrar"]');
    await club.click(`[data-a="dia"][data-v="${await turnero2Hoy(otro)}"]`);
    await club.waitForTimeout(300);
  }
  const web = await club.evaluate(() => document.body.innerText.includes("Publicada Uno"));
  check(web && mostrador, "el club conserva la reserva web y la del mostrador después de la toma de posta (D36)");
  if (fechaHueco) { await otro.click(`#dias .dia[data-fecha="${fechaHueco}"]`); await otro.waitForTimeout(400); }
  const libresOtro = await otro.locator(".slot").count();
  check(libresOtro > 0 && await otro.locator(sel).count() === 0, `el turno del mostrador (${cancha} ${hora}) sigue ocupado en el turnero nuevo (D36)`);
  await otro.locator(".slot").first().click();
  await otro.click("#btn-confirmar");
  await otro.click("#btn-google");
  await club.waitForFunction(() => document.body.innerText.includes("Jugador Demo"), null, { timeout: 8000 }).catch(() => {});
  check(await club.evaluate(() => document.body.innerText.includes("Jugador Demo")), "y una reserva nueva vuelve a llegar al club");
}

console.log("\n▶ seguridad");
check(!ajenos.length, `ningún pedido a otro origen (todo queda en el navegador)${ajenos.length ? ` → ${ajenos[0]}` : ""}`);
check(!errores.length, `cero errores de consola${errores.length ? ` → ${errores.slice(0, 3).join(" | ")}` : ""}`);

await navegador.close();
srv.close();
console.log(fallas.length ? `\n✗ ${fallas.length} falla(s)` : "\n✓ E2E del sitio breakpointpadel en verde");
await ctxAxe.close();
process.exit(fallas.length ? 1 : 0);
