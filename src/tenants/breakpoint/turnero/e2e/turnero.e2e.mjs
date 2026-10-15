// E2E del Turnero de Break Point con Playwright (Chromium de /opt/pw-browsers; no se corre `playwright install`).
//
//   npm run test:turnero-e2e            (deja capturas en E2E_SALIDA, por defecto /tmp/turnero-e2e)
//
// Levanta back + front reales en puertos libres, con el reloj del club fijo en HOY 15:00 (así hay turnos libres
// a cualquier hora que se corra), y recorre como un jugador real en 390 px y 1440 px:
//   1. carga sin errores de consola, sin scroll horizontal, sin violaciones graves de accesibilidad (axe-core);
//   2. reservar → registrarse → seña → comprobante simulado → «¡Turno firme!» llega en vivo → cancelar;
//   3. tiempo real entre dos jugadores (el turno que toma uno desaparece para el otro);
//   4. backoffice conectado: la reserva web aparece en la agenda del club y un turno del mostrador desaparece del turnero;
//   5. rendimiento medido con red «4G lenta» + CPU x4: LCP, CLS y peso de JS comprimido;
//   6. movimiento reducido y teclado.
// Sale con código 1 si algo falla. Imprime un resumen en JSON (lo usa TURNERO-QA.md).
import { chromium } from "playwright";
import { mkdirSync, readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { crearApp } from "../back/servidor.mjs";
import { crearFront } from "../servir-front.mjs";
import { aMotor, aEpoch } from "../../../../../public/previews/breakpoint/turnero/dominio/nucleo.mjs";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const FRONT_DIR = path.resolve(AQUI, "../../../../../public/previews/breakpoint/turnero");
const SALIDA = process.env.E2E_SALIDA ?? "/tmp/turnero-e2e";
mkdirSync(SALIDA, { recursive: true });
const AXE = readFileSync(createRequire(import.meta.url).resolve("axe-core/axe.min.js"), "utf8");

// Reloj del club: hoy a las 15:00 (hora argentina), corriendo a velocidad real desde el arranque.
const t0 = Date.now();
const hoy = aMotor(t0).fecha;
const base15 = aEpoch({ fecha: hoy, min: 15 * 60 });
const reloj = () => base15 + (Date.now() - t0);

const fallas = [], resumen = { anchos: {}, rendimiento: null, axe: {}, flujos: [] };
const check = (cond, msj) => { if (!cond) { fallas.push(msj); console.error(`  ✗ ${msj}`); } else console.log(`  ✓ ${msj}`); };

const back = crearApp({ entorno: { TURNERO_STAFF_CLAVE: "clave-e2e", TURNERO_ORIGENES: "" }, reloj, log: () => {} });
await new Promise((ok) => back.servidor.listen(0, "127.0.0.1", ok));
const PB = back.servidor.address().port;
const API = `http://127.0.0.1:${PB}`;
const front = crearFront({ api: API });
await new Promise((ok) => front.listen(0, "127.0.0.1", ok));
const PF = front.address().port;
const FRONT = `http://127.0.0.1:${PF}`;
// El back acepta al front de esta corrida (los orígenes se fijan al crear la app: se recrea con el puerto real).
await back.cerrar();
const back2 = crearApp({ entorno: { TURNERO_STAFF_CLAVE: "clave-e2e", TURNERO_ORIGENES: FRONT }, reloj, log: () => {} });
await new Promise((ok) => back2.servidor.listen(PB, "127.0.0.1", ok));

const navegador = await chromium.launch({ executablePath: process.env.PW_CHROMIUM ?? "/opt/pw-browsers/chromium" }).catch(() => chromium.launch());
const URL_T = `${FRONT}/turnero/?api=${encodeURIComponent(API)}`;

async function pagina(ancho, alto, opciones = {}) {
  const ctx = await navegador.newContext({ viewport: { width: ancho, height: alto }, bypassCSP: true, ...opciones });
  const p = await ctx.newPage();
  p.errores = [];
  p.on("console", (m) => { if (m.type() === "error" && !/fonts\.(googleapis|gstatic)/.test(`${m.text()} ${m.location()?.url ?? ""}`)) p.errores.push(`${m.text()} ${m.location()?.url ?? ""}`); });
  p.on("pageerror", (e) => p.errores.push(e.message));
  // Las fuentes de Google pueden no estar al alcance del entorno de pruebas: se cortan para no medir la red ajena.
  await p.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  return { ctx, p };
}
async function axe(p, nombre) {
  await p.waitForTimeout(450); // que terminen las animaciones de entrada (si no, axe mide contraste a media opacidad)
  if (!(await p.evaluate(() => Boolean(window.axe)))) await p.addScriptTag({ content: AXE });
  const r = await p.evaluate(async () => {
    const out = await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } });
    return out.violations.map((v) => ({ id: v.id, impacto: v.impact, nodos: v.nodes.length, ejemplo: v.nodes[0]?.target?.join(" ") }));
  });
  resumen.axe[nombre] = r;
  const graves = r.filter((v) => v.impacto === "serious" || v.impacto === "critical");
  check(!graves.length, `axe ${nombre}: sin violaciones graves${graves.length ? ` → ${JSON.stringify(graves)}` : ""}`);
}
const listo = (p) => p.waitForSelector("body[data-estado=listo]", { timeout: 10000 });

// ───────────── 1 y 2: recorrido completo en cada ancho ─────────────
for (const [ancho, alto] of [[390, 844], [1440, 900]]) {
  console.log(`\n▶ ${ancho} px`);
  const { ctx, p } = await pagina(ancho, alto);
  await p.goto(URL_T);
  await listo(p);
  const sw = await p.evaluate(() => document.documentElement.scrollWidth);
  check(sw <= ancho, `${ancho}: sin scroll horizontal (scrollWidth ${sw})`);
  check(await p.locator(".slot").count() > 0, `${ancho}: hay turnos libres para hoy`);
  check(await p.locator("#en-vivo.on").count() === 1, `${ancho}: indicador «En vivo» encendido`);
  check(await p.getAttribute('meta[name="generator"]', "content") === "Gestión Studio Grow", `${ancho}: sello GSG en meta generator`);
  await p.screenshot({ path: `${SALIDA}/${ancho}-1-inicio.png` });
  await axe(p, `${ancho}-inicio`);

  // Cambiar de día y duración.
  await p.locator("#dias .dia").nth(1).click();
  await p.waitForFunction(() => document.querySelector('#dias .dia[aria-pressed="true"]')?.dataset.fecha !== undefined);
  await p.locator('label[for="dur-60"]').click();
  await p.waitForTimeout(300);
  check(await p.locator(".slot").count() > 0, `${ancho}: cambiar día y duración trae turnos`);

  // Reservar → pide ingreso → crear cuenta con usuario y contraseña.
  const slot = p.locator(".slot").last();
  const elegido = { inicio: await slot.getAttribute("data-inicio"), cancha: await slot.getAttribute("data-cancha") };
  await slot.click();
  await p.waitForSelector("#dlg-reserva[open]");
  await axe(p, `${ancho}-dialogo-reserva`);
  await p.click("#btn-confirmar");
  await p.waitForSelector("#dlg-login[open]");
  await p.click("#btn-ir-registro");
  await p.fill("#reg-nombre", `Jugadora ${ancho}`);
  await p.fill("#reg-tel", ancho === 390 ? "11 3900 0390" : "11 1440 1440");
  await p.fill("#reg-clave", "canchaazul9");
  await axe(p, `${ancho}-dialogo-login`);
  await p.locator("#form-registro [type=submit]").click();
  await p.waitForSelector("#dlg-pago[open]", { timeout: 8000 }).catch(async () => { await p.screenshot({ path: `${SALIDA}/${ancho}-falla-pago.png` }); console.error(await p.evaluate(() => [document.querySelector("#res-error")?.textContent, document.querySelector("#login-error")?.textContent, document.querySelector("#aviso")?.textContent])); });
  check(/^BP-[A-Z0-9]{4}$/.test((await p.textContent("#pago-ref")).trim()), `${ancho}: la seña muestra el código BP para la transferencia`);
  check((await p.getAttribute("#btn-whatsapp", "href")).startsWith("https://wa.me/?text="), `${ancho}: WhatsApp sin número inventado (DX-4)`);
  await p.screenshot({ path: `${SALIDA}/${ancho}-2-sena.png` });
  await axe(p, `${ancho}-dialogo-pago`);

  // Comprobante simulado → entra por el webhook firmado → la confirmación llega por SSE.
  const t = Date.now();
  await p.click("#btn-simular");
  await p.waitForSelector("#dlg-pago.is-firme", { timeout: 5000 }).catch(() => {});
  const ms = Date.now() - t;
  check(await p.locator("#dlg-pago.is-firme").count() === 1, `${ancho}: «¡Turno firme!» en vivo tras el comprobante (${ms} ms)`);
  check(await p.locator("#dlg-pago .datos").isHidden(), `${ancho}: ya firme, se ocultan los datos para transferir`);
  await p.waitForTimeout(900);
  await p.screenshot({ path: `${SALIDA}/${ancho}-3-firme.png` });
  resumen.flujos.push({ ancho, confirmacionEnVivoMs: ms });
  await p.click("#btn-cerrar-pago");
  check(await p.locator(`#lista-reservas .reserva[data-estado="firme"]`).count() === 1, `${ancho}: «Mis reservas» muestra el turno firme`);
  check(await p.locator(`.slot[data-inicio="${elegido.inicio}"][data-cancha="${elegido.cancha}"]`).count() === 0, `${ancho}: el turno reservado ya no figura libre`);

  // Cancelar con doble toque.
  const cancelar = p.locator("#lista-reservas .btn-cancelar-res").first();
  await cancelar.click();
  check(/Seguro/.test(await cancelar.textContent()), `${ancho}: cancelar pide confirmación en el mismo botón`);
  await cancelar.click();
  await p.waitForSelector(`#lista-reservas .reserva[data-estado="cancelada"]`, { timeout: 5000 }).catch(() => {});
  check(await p.locator(`#lista-reservas .reserva[data-estado="cancelada"]`).count() === 1, `${ancho}: turno cancelado`);
  await p.waitForSelector(`.slot[data-inicio="${elegido.inicio}"][data-cancha="${elegido.cancha}"]`, { timeout: 5000 }).catch(() => {});
  check(await p.locator(`.slot[data-inicio="${elegido.inicio}"][data-cancha="${elegido.cancha}"]`).count() === 1, `${ancho}: el hueco cancelado vuelve a estar libre`);
  await p.screenshot({ path: `${SALIDA}/${ancho}-4-cancelado.png`, fullPage: true });

  // Sesión: salir y volver a entrar con usuario y contraseña.
  await p.click("#btn-salir");
  await p.click("#btn-ingresar");
  await p.fill("#login-usuario", ancho === 390 ? "1139000390" : "1114401440");
  await p.fill("#login-clave", "canchaazul9");
  await p.locator("#form-login [type=submit]").click();
  await p.waitForSelector("#usuario:not([hidden])", { timeout: 5000 }).catch(() => {});
  check(await p.locator("#usuario:not([hidden])").count() === 1, `${ancho}: vuelve a entrar con celular y contraseña`);
  check(!p.errores.length, `${ancho}: cero errores de consola${p.errores.length ? ` → ${p.errores.join(" | ")}` : ""}`);
  resumen.anchos[ancho] = { scrollWidth: sw, errores: p.errores };
  await ctx.close();
}

// ───────────── 3: tiempo real entre dos jugadores ─────────────
console.log("\n▶ tiempo real entre jugadores");
{
  const a = await pagina(390, 844), b = await pagina(1440, 900);
  await Promise.all([a.p.goto(URL_T), b.p.goto(URL_T)]);
  await Promise.all([listo(a.p), listo(b.p)]);
  await a.p.click("#btn-ingresar");
  await a.p.click("#btn-google");
  await a.p.waitForSelector("#usuario:not([hidden])");
  const s = a.p.locator(".slot").first();
  const sel = `.slot[data-inicio="${await s.getAttribute("data-inicio")}"][data-cancha="${await s.getAttribute("data-cancha")}"]`;
  check(await b.p.locator(sel).count() === 1, "el otro jugador ve el turno libre");
  await s.click();
  await a.p.click("#btn-confirmar");
  const t = Date.now();
  await b.p.waitForSelector(sel, { state: "detached", timeout: 5000 }).catch(() => {});
  check(await b.p.locator(sel).count() === 0, `el turno tomado desaparece del otro navegador en vivo (${Date.now() - t} ms, sin recargar)`);
  await a.ctx.close(); await b.ctx.close();
}

// ───────────── 4: backoffice conectado ↔ turnero ─────────────
console.log("\n▶ backoffice conectado");
{
  const bo = await pagina(1440, 900), tu = await pagina(390, 844);
  await bo.p.goto(`${FRONT}/club/?api=${encodeURIComponent(API)}#clave=clave-e2e`);
  await bo.p.waitForSelector("#bp-conexion", { timeout: 10000 }).catch(() => {});
  await bo.p.waitForFunction(() => /en vivo/.test(document.querySelector("#bp-conexion")?.textContent ?? ""), null, { timeout: 8000 }).catch(() => {});
  check(/en vivo/.test((await bo.p.textContent("#bp-conexion").catch(() => "")) ?? ""), "el backoffice se conecta con la clave del club");
  check(!bo.p.url().includes("clave="), "la clave no queda en la barra de direcciones");
  await tu.p.goto(URL_T);
  await listo(tu.p);
  // Web → agenda del club.
  await tu.p.click("#btn-ingresar");
  await tu.p.click("#btn-ir-registro");
  await tu.p.fill("#reg-nombre", "Web Sincronizada");
  await tu.p.fill("#reg-tel", "11 5000 6000");
  await tu.p.fill("#reg-clave", "canchaazul9");
  await tu.p.locator("#form-registro [type=submit]").click();
  await tu.p.waitForSelector("#usuario:not([hidden])");
  await tu.p.locator(".slot").first().click();
  await tu.p.click("#btn-confirmar");
  await tu.p.waitForSelector("#dlg-pago[open]");
  await tu.p.click("#btn-cerrar-pago");
  await bo.p.waitForFunction(() => document.body.innerText.includes("Web Sincronizada"), null, { timeout: 6000 }).catch(() => {});
  check(await bo.p.evaluate(() => document.body.innerText.includes("Web Sincronizada")), "la reserva web aparece sola en la agenda del backoffice");
  await bo.p.screenshot({ path: `${SALIDA}/backoffice-con-reserva-web.png` });
  // Mostrador → turnero: el club carga un turno por teléfono y desaparece del turnero.
  await bo.p.click('button[data-a="nuevo"]:has-text("+ Turno")');
  await bo.p.waitForSelector("#f-hora");
  const cancha = await bo.p.inputValue("#f-cancha"), hora = await bo.p.inputValue("#f-hora");
  await bo.p.selectOption("#f-dur", "60");
  await bo.p.waitForTimeout(150);
  const hora60 = await bo.p.inputValue("#f-hora");
  await bo.p.fill("#f-titular", "Por teléfono E2E");
  const selTu = `.slot[data-inicio="${hora60}"][data-cancha="${cancha}"]`;
  await tu.p.locator('label[for="dur-60"]').click();
  await tu.p.waitForSelector(selTu, { timeout: 4000 }).catch(() => {});
  const estabaLibre = await tu.p.locator(selTu).count() === 1;
  await bo.p.click('button[data-a="confirmarTurno"]');
  await tu.p.waitForSelector(selTu, { state: "detached", timeout: 5000 }).catch(() => {});
  check(estabaLibre && await tu.p.locator(selTu).count() === 0, `el turno cargado en el mostrador (${cancha} ${hora60}) desaparece del turnero en vivo`);
  check(!bo.p.errores.length, `backoffice conectado sin errores de consola${bo.p.errores.length ? ` → ${bo.p.errores.join(" | ")}` : ""}`);
  void hora;
  await bo.ctx.close(); await tu.ctx.close();
  // Sin ?api= el backoffice sigue siendo la demo de siempre.
  const demo = await pagina(1440, 900);
  await demo.p.goto(`${FRONT}/club/`);
  await demo.p.waitForTimeout(800);
  check(await demo.p.locator("#bp-conexion").count() === 0 && !demo.p.errores.length, "sin ?api= el backoffice queda en modo demo, sin errores");
  await demo.ctx.close();
}

// ───────────── 5: rendimiento (4G lenta + CPU x4, celular) ─────────────
console.log("\n▶ rendimiento");
{
  const { ctx, p } = await pagina(390, 844, { isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const cdp = await ctx.newCDPSession(p);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  const bytes = { js: 0, css: 0, html: 0, otros: 0 };
  const tipos = new Map();
  cdp.on("Network.responseReceived", (e) => tipos.set(e.requestId, e.response.url));
  cdp.on("Network.loadingFinished", (e) => {
    const u = tipos.get(e.requestId) ?? "";
    const k = /\.m?js(\?|$)/.test(u) ? "js" : /\.css(\?|$)/.test(u) ? "css" : /\/turnero\/(\?|$)/.test(u) ? "html" : "otros";
    bytes[k] += e.encodedDataLength;
  });
  await p.addInitScript(() => {
    window.__lcp = 0; window.__cls = 0;
    new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lcp = e.startTime; }).observe({ type: "largest-contentful-paint", buffered: true });
    new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: "layout-shift", buffered: true });
  });
  await p.goto(URL_T, { waitUntil: "load" });
  await listo(p);
  await p.waitForTimeout(1500);
  const m = await p.evaluate(() => ({ lcp: Math.round(window.__lcp), cls: Number(window.__cls.toFixed(4)), fcp: Math.round(performance.getEntriesByName("first-contentful-paint")[0]?.startTime ?? 0) }));
  const jsGz = gzipSync(readFileSync(path.join(FRONT_DIR, "app.mjs")), { level: 9 }).length;
  resumen.rendimiento = { ...m, bytesTransferidos: bytes, appMjsGzip: jsGz, red: "4G lenta (150 ms, 1,6 Mbps) + CPU x4" };
  check(m.lcp > 0 && m.lcp < 1500, `LCP ${m.lcp} ms < 1500 ms en 4G lenta`);
  check(m.cls < 0.01, `CLS ${m.cls} (objetivo 0)`);
  check(jsGz < 60 * 1024, `JS del turnero ${(jsGz / 1024).toFixed(1)} KB gzip < 60 KB`);
  await ctx.close();
}

// ───────────── 6: movimiento reducido y teclado ─────────────
console.log("\n▶ movimiento reducido y teclado");
{
  const { ctx, p } = await pagina(390, 844, { reducedMotion: "reduce" });
  await p.goto(URL_T);
  await listo(p);
  const dur = await p.evaluate(() => {
    const el = document.querySelector(".slot");
    el.classList.add("is-nuevo");
    const cs = getComputedStyle(el);
    return Math.max(...cs.animationDuration.split(",").map((x) => parseFloat(x) * (x.includes("ms") ? 1 : 1000)), ...cs.transitionDuration.split(",").map((x) => parseFloat(x) * (x.includes("ms") ? 1 : 1000)));
  });
  check(dur <= 10, `prefers-reduced-motion apaga las animaciones (${dur} ms)`);
  await p.keyboard.press("Tab");
  let llegó = false;
  for (let i = 0; i < 25 && !llegó; i++) { llegó = await p.evaluate(() => document.activeElement?.classList.contains("slot")); if (!llegó) await p.keyboard.press("Tab"); }
  check(llegó, "con Tab se llega a un turno");
  const foco = await p.evaluate(() => { const cs = getComputedStyle(document.activeElement); return cs.outlineStyle !== "none" || cs.boxShadow !== "none"; });
  check(foco, "el foco se ve");
  await p.keyboard.press("Enter");
  check(await p.locator("#dlg-reserva[open]").count() === 1, "Enter sobre un turno abre la confirmación");
  await p.keyboard.press("Escape");
  check(await p.locator("#dlg-reserva[open]").count() === 0, "Escape cierra el diálogo");
  await ctx.close();
}

// ───────────── 7: demo pública sin servidor (adaptador local) ─────────────
console.log("\n▶ demo pública sin servidor (adaptador local)");
{
  const { ctx, p } = await pagina(390, 844);
  const pedidosApi = [];
  p.on("request", (r) => { if (r.url().includes("/api/")) pedidosApi.push(r.url()); });
  const bytes = { js: 0 };
  p.on("response", async (r) => { if (/\.m?js$/.test(new URL(r.url()).pathname)) bytes.js += Number(r.headers()["content-length"] ?? 0); });
  const t = Date.now();
  await p.goto(`${FRONT}/turnero/?api=local`);
  await listo(p);
  check(await p.locator(".slot").count() > 0, `local: turnos libres sin servidor (${Date.now() - t} ms)`);
  await p.locator(".slot").first().click();
  await p.click("#btn-confirmar");
  await p.click("#btn-google");
  await p.waitForSelector("#dlg-pago[open]", { timeout: 5000 }).catch(() => {});
  const pendiente = await p.locator("#dlg-pago[open]").count() === 1;
  if (pendiente) {
    await p.click("#btn-simular");
    await p.waitForSelector("#dlg-pago.is-firme", { timeout: 5000 }).catch(() => {});
  }
  check(pendiente && await p.locator("#dlg-pago.is-firme").count() === 1, "local: reservar con Google (demo) + comprobante simulado → turno firme");
  // Lista de espera con cuenta de Google (sin celular): se pide el celular inline, con label, sin prompt().
  await p.click("#btn-cerrar-pago").catch(() => {});
  await p.waitForTimeout(400); // que terminen los repintados en vivo de la reserva recién hecha
  // (No hay un día garantizado sin turnos libres: se muestra el bloque a mano y se dispara el botón en el mismo paso.)
  await p.evaluate(() => { document.querySelector("#espera").hidden = false; document.querySelector("#btn-espera").click(); });
  await p.waitForSelector("#esp-tel", { timeout: 3000 }).catch(() => {});
  check(await p.locator('label[for="esp-tel"]').count() === 1, "lista de espera: pide el celular en un campo con label (no prompt)");
  await p.fill("#esp-tel", "123");
  await p.click("#form-cel [type=submit]");
  await p.waitForTimeout(200);
  check(/celular/i.test(await p.textContent("#esp-err")), "lista de espera: celular inválido → error al lado del campo");
  await p.fill("#esp-tel", "11 6000 7000");
  await p.click("#form-cel [type=submit]");
  await p.waitForFunction(() => /avisamos por WhatsApp/.test(document.querySelector("#aviso")?.textContent ?? ""), null, { timeout: 3000 }).catch(() => {});
  check(/avisamos por WhatsApp/.test(await p.textContent("#aviso")), "lista de espera: queda anotado y se confirma");
  check(pedidosApi.length === 0, `local: ningún pedido a una API (todo queda en el navegador)${pedidosApi.length ? ` → ${pedidosApi[0]}` : ""}`);
  check(bytes.js > 0 && bytes.js < 60 * 1024, `local: JS comprimido total ${(bytes.js / 1024).toFixed(1)} KB < 60 KB`);
  check(!p.errores.length, `local: cero errores de consola${p.errores.length ? ` → ${p.errores.join(" | ")}` : ""}`);
  await p.screenshot({ path: `${SALIDA}/local-firme.png` });
  resumen.local = { jsComprimido: bytes.js };
  await ctx.close();
}

// ───────────── 8: con la CSP de verdad (sin bypass): el turnero y el backoffice andan y no hay violaciones ─────────────
console.log("\n▶ CSP estricta");
{
  const ctx = await navegador.newContext({ viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage();
  const violaciones = [];
  p.on("console", (m) => { if (/Content Security Policy|Refused to/.test(m.text())) violaciones.push(m.text()); });
  await p.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await p.goto(URL_T);
  await listo(p);
  check(await p.locator(".slot").count() > 0 && !violaciones.length, `turnero con CSP sin 'unsafe-inline' en scripts: anda y sin violaciones${violaciones.length ? ` → ${violaciones[0]}` : ""}`);
  violaciones.length = 0;
  await p.goto(`${FRONT}/club/`);
  await p.waitForTimeout(800);
  check(!violaciones.length, `backoffice con su CSP: sin violaciones${violaciones.length ? ` → ${violaciones[0]}` : ""}`);
  await ctx.close();
}

// ───────────── 9: desde un host público, ?api= no se acepta (un link armado no puede robar contraseñas) ─────────────
console.log("\n▶ host público: ?api= ignorado");
{
  const publico = await chromium.launch({ executablePath: process.env.PW_CHROMIUM ?? "/opt/pw-browsers/chromium", args: ["--host-resolver-rules=MAP turnero.test 127.0.0.1"] }).catch(() => chromium.launch({ args: ["--host-resolver-rules=MAP turnero.test 127.0.0.1"] }));
  const p = await publico.newPage();
  const ajenos = [];
  p.on("request", (r) => { if (!r.url().startsWith(`http://turnero.test:${PF}/`) && !/fonts\.|accounts\.google/.test(r.url())) ajenos.push(r.url()); });
  await p.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await p.goto(`http://turnero.test:${PF}/turnero/?api=${encodeURIComponent("http://evil.example")}`);
  await listo(p);
  check(!ajenos.length, `?api= hostil desde un host público: ningún pedido sale a otro servidor${ajenos.length ? ` → ${ajenos[0]}` : ""}`);
  check(await p.locator(".slot").count() > 0, "y el turnero sigue andando en modo demo local (marca turnero-modo=demo)");
  await publico.close();
}

await navegador.close();
await back2.cerrar();
front.close();
console.log(`\nResumen: ${JSON.stringify(resumen, null, 1)}`);
console.log(fallas.length ? `\n✗ ${fallas.length} falla(s)` : "\n✓ E2E del turnero en verde");
process.exit(fallas.length ? 1 : 0);
