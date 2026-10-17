// UAT parte B del sitio breakpointpadel (docs/tenants/breakpoint/UAT-PRODUCCION.md, partes 1, 2, 3 y 4.2): acceso de
// los 4 usuarios del club, bloqueo con PIN, los 8 pedidos del 15/10 y registro con celular. Corre contra el sitio
// empaquetado servido por el MISMO manejador del ERP que usa producción, en un host "público" simulado. Los PIN y la
// contraseña son de la demo (están a la vista en la propia pantalla) y nada sale del navegador.
// Uso: npm run test:club-uat [carpeta de capturas]
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { responderSitioEstatico } from "../../../../lib/sitio-estatico.ts";
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");
const OUT = process.argv[2] ?? path.join(RAIZ, "dist/uat-b");
await mkdir(OUT, { recursive: true });
const filas = []; let n = 0;
const ok = (id, cond, que) => { filas.push({ id, estado: cond ? "OK" : "FALLA", que }); console.log(`${cond ? "✓" : "✗"} ${id} ${que}`); };
const srv = createServer(async (req, res) => {
  const segs = new URL(req.url, "http://x").pathname.split("/").filter(Boolean);
  const r = await responderSitioEstatico("breakpoint", segs, async (rel) => new Uint8Array(await readFile(path.join(RAIZ, rel))));
  res.writeHead(r.status, Object.fromEntries(r.headers)); res.end(Buffer.from(await r.arrayBuffer()));
});
await new Promise((o) => srv.listen(0, "127.0.0.1", o));
const BASE = `http://breakpointpadel.test:${srv.address().port}`;
const ARGS = [`--host-resolver-rules=MAP breakpointpadel.test 127.0.0.1`, `--unsafely-treat-insecure-origin-as-secure=${BASE}`];
// Como sitio.e2e.mjs: el Chromium del entorno si está; si no, el que instaló Playwright.
const b = await chromium.launch({ executablePath: process.env.PW_CHROMIUM ?? "/opt/pw-browsers/chromium", args: ARGS }).catch(() => chromium.launch({ args: ARGS }));
const ctx = await b.newContext({ viewport: { width: 1366, height: 900 } });
await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
const errores = [];
const p = await ctx.newPage();
p.on("pageerror", (e) => errores.push(e.message));
p.on("console", (m) => { if (m.type() === "error" && !/fonts|ERR_FAILED/.test(m.text())) errores.push(m.text()); });
const W = (ms = 200) => p.waitForTimeout(ms);
const foto = (nombre) => p.screenshot({ path: `${OUT}/${String(++n).padStart(2, "0")}-${nombre}.png` });
const aviso = async () => ((await p.$("#dlg-aviso")) ? (await p.textContent("#dlg-aviso")) : "") || (await p.textContent("#toasts"));
const cerrar = async () => { if (await p.evaluate(() => document.getElementById("dlg").open)) { await p.click('#dlg [data-a="cerrar"]').catch(() => p.keyboard.press("Escape")); await W(); } };
async function entrarComo(id, pin) {
  await cerrar();
  await p.click('[data-a="usuario"]'); await W();
  await p.click(`[data-a="elegirUsuario"][data-v="${id}"]`); await p.fill("#pin-usuario", pin);
  await p.click('#dlg [data-a="entrar"]'); await W(300);
}
const pestanas = () => p.evaluate(() => [...document.querySelectorAll('#tabs [data-a="tab"], #mas-menu [data-a="tab"]')].map((x) => x.dataset.v).sort());
async function irTab(id) {
  const vis = await p.$(`#tabs [data-a="tab"][data-v="${id}"]`);
  if (vis) await vis.click(); else { await p.click("#btn-mas"); await W(150); await p.click(`#mas-menu [data-v="${id}"]`); }
  await W(300);
}

await p.goto(`${BASE}/club?demo=1`); await W(600);

// ── Parte 1: matriz de acceso ──
const DUENO = ["agenda", "ajustes", "buffet", "caja", "clientes", "contenido", "proveedores", "stock", "tablero"];
const RECEP = ["agenda", "buffet", "caja", "clientes"];
const USUARIOS = [["u-rober", "11", "dueño", DUENO], ["u-majo", "22", "dueña", DUENO], ["u-lu", "33", "recepción", RECEP], ["u-caro", "44", "recepción", RECEP]];
for (const [id, pin, rol, esperadas] of USUARIOS) {
  await entrarComo(id, pin);
  const t = await pestanas();
  ok("1.matriz", JSON.stringify(t) === JSON.stringify([...esperadas].sort()), `${id} (${rol}) ve exactamente: ${t.join(", ")}`);
  // Cuenta corriente: el dueño la habilita, recepción sólo la pide.
  await irTab("clientes");
  await p.locator('[data-a="fichaCliente"]').first().click(); await W(300);
  const habilita = await p.locator("#cc-lim").count(), pide = await p.locator("#cc-pedir").count();
  ok("1.cc", rol === "recepción" ? habilita === 0 : habilita === 1, `${id}: cuenta corriente → ${habilita ? "puede habilitar" : pide ? "sólo pedirla" : "sin controles"}`);
  await cerrar();
  // Falta «Sin cargo (excepción)»: sólo dueños.
  await irTab("agenda");
  const bloques = p.locator("#app .blk[data-v]");
  let vioFalta = false, sinCargo = 0;
  for (let i = 0; i < await bloques.count() && !vioFalta; i++) {
    await bloques.nth(i).click(); await W(250);
    const falta = await p.$('#dlg [data-a="falta"]');
    if (falta) { await falta.click(); await W(200); vioFalta = true; sinCargo = await p.locator('[data-a="marcarFalta"][data-m="nadie"]').count(); }
    await cerrar();
  }
  ok("1.falta", vioFalta && (rol === "recepción" ? sinCargo === 0 : sinCargo === 1), `${id}: «Sin cargo (excepción)» en una falta ${sinCargo ? "visible" : "no visible"}`);
  // Descuento manual: recepción sólo con el PIN de un dueño; dueños con el suyo.
  await irTab("buffet");
  await p.locator('[data-a="verCuenta"]').first().click(); await W(300);
  await p.click("details.mesa summary"); await W(100);
  await p.fill("#cm-con", "Descuento UAT"); await p.selectOption("#cm-tipo", "descuento"); await p.fill("#cm-mon", "500");
  await p.click('[data-a="cargoManual"]'); await W();
  const sinPin = await aviso();
  await p.fill("#cm-con", "Descuento UAT"); await p.selectOption("#cm-tipo", "descuento"); await p.fill("#cm-mon", "500"); await p.fill("#cm-pin", rol === "recepción" ? "11" : pin);
  await p.click('[data-a="cargoManual"]'); await W();
  const conPin = await aviso();
  ok("1.descuento", /dueño/.test(sinPin) && /Descuento aplicado/.test(conPin), `${id}: descuento sin PIN → «${sinPin.trim().slice(0, 50)}»; con PIN de dueño → «${conPin.trim().slice(0, 30)}»`);
  await cerrar();
  if (id === "u-lu") await foto("lu-recepcion");
}
// 1.1 PIN equivocado
await cerrar();
await p.click('[data-a="usuario"]'); await W(); await p.click('[data-a="elegirUsuario"][data-v="u-rober"]'); await p.fill("#pin-usuario", "99"); await p.click('#dlg [data-a="entrar"]'); await W();
ok("1.1", /PIN incorrecto/.test(await aviso()) && (await p.textContent("#u-nombre")) !== "Rober", "PIN equivocado: avisa y no entra");
await cerrar();
// 1.4 un dueño no se puede sacar el acceso a sí mismo
await entrarComo("u-rober", "11"); await irTab("ajustes");
const filaRober = p.locator("#app tr", { hasText: "Rober" });
ok("1.4", (await filaRober.locator('[data-a="revocar"]').count()) === 0 && (await p.locator('[data-a="revocar"]').count()) >= 1, "el dueño no tiene «Sacar acceso» en su propia fila (sí en las demás)");
// 1.2 pedir acceso → otorgar → entrar → revocar
await p.click('[data-a="usuario"]'); await W();
ok("1.pines", !(await p.isVisible("#dlg .demo-pins p")), "los PIN de ejemplo no están a la vista: se ven sólo si se piden");
await p.click("details:has(#nuevo-acceso) summary"); await p.fill("#nuevo-acceso", "Prueba UAT"); await p.click('[data-a="pedirAcceso"]'); await W(300);
await entrarComo("u-rober", "11"); await irTab("ajustes");
await p.locator('#app .al', { hasText: "Prueba UAT" }).locator('[data-a="otorgar"]').click(); await W();
await p.selectOption("#og-rol", "recepcion"); await p.fill("#og-pin", "11"); await p.click('#dlg [data-a="confirmarOtorgar"]'); await W(300);
const pinNuevo = (await p.textContent("#dlg .pin-in"))?.trim();
await foto("acceso-otorgado");
await cerrar();
const idNuevo = await p.locator("#app tr", { hasText: "Prueba UAT" }).locator('[data-a="revocar"]').getAttribute("data-v");
await entrarComo(idNuevo, pinNuevo);
ok("1.2a", (await p.textContent("#u-nombre")) === "Prueba UAT" && JSON.stringify(await pestanas()) === JSON.stringify(RECEP), `pidió acceso, el dueño se lo dio (PIN de 2 dígitos) y entra con permisos de recepción`);
await entrarComo("u-rober", "11"); await irTab("ajustes");
await p.click(`[data-a="revocar"][data-v="${idNuevo}"]`); await W(); await p.fill("#cf-pin", "11"); await p.click('#dlg [data-a="confirmarRevocar"]'); await W(300);
await p.click('[data-a="usuario"]'); await W();
ok("1.2b", (await p.locator(`[data-a="elegirUsuario"][data-v="${idNuevo}"]`).count()) === 0, "después de revocarlo ya no aparece para entrar");
await cerrar();
// 1.3 PIN nuevo para Caro
await irTab("ajustes");
await p.click('[data-a="regenerarPin"][data-v="u-caro"]'); await W(); await p.fill("#cf-pin", "11"); await p.click('#dlg [data-a="confirmarRegenerar"]'); await W(300);
const pinCaro = (await p.textContent("#dlg .pin-in"))?.trim(); await cerrar();
await p.click('[data-a="usuario"]'); await W(); await p.click('[data-a="elegirUsuario"][data-v="u-caro"]'); await p.fill("#pin-usuario", "44"); await p.click('#dlg [data-a="entrar"]'); await W();
const viejoFalla = /PIN incorrecto/.test(await aviso()); await cerrar();
await entrarComo("u-caro", pinCaro);
ok("1.3", viejoFalla && /Caro/.test(await p.textContent("#u-nombre")), `PIN nuevo de Caro: el viejo (44) deja de andar y el nuevo anda`);

// ── Parte 2: bloqueo con PIN ──
const bloqueada = () => p.evaluate(() => document.getElementById("bloqueo").open);
await entrarComo("u-lu", "33");
await p.click('[data-a="bloquearYa"]'); await W(300);
ok("2.1", await bloqueada(), "el candado bloquea la pantalla"); await foto("bloqueo");
await p.keyboard.press("Escape"); await p.keyboard.press("Control+k"); await p.keyboard.press("n"); await p.keyboard.press("c"); await W(300);
ok("2.2b", (await p.inputValue("#bl-pin")) === "" && !/incorrecto/.test(await p.textContent("#bl-aviso")), "D41: las letras no entran al PIN ni gastan un intento");
ok("2.2", (await bloqueada()) && !(await p.evaluate(() => document.getElementById("dlg").open || document.getElementById("cmdk").open)), "Esc, Ctrl K, N y C no abren ni cierran nada detrás");
for (let i = 0; i < 5; i++) { await p.fill("#bl-pin", "98"); await W(250); }
ok("2.3", (await p.isDisabled("#bl-pin")) && /Demasiados intentos/.test(await p.textContent("#bl-aviso")), "5 PIN mal → espera de 30 s con el campo deshabilitado");
await p.waitForFunction(() => !document.getElementById("bl-pin")?.disabled, null, { timeout: 40000 });
await p.fill("#bl-pin", "33"); await W(400);
ok("2.4", !(await bloqueada()) && /Lu/.test(await p.textContent("#u-nombre")), "pasada la espera, con su PIN desbloquea y sigue Lu");
await irTab("buffet"); await p.locator('[data-a="verCuenta"]').first().click(); await W(300); // queda una ventana abierta
await p.keyboard.press("l"); await W(300);
await p.click('[data-a="bloqueoOtro"]'); await W(150); await p.click('[data-a="bloqueoUsuario"][data-v="u-rober"]'); await W(150); await p.fill("#bl-pin", "11"); await W(400);
ok("2.5", !(await bloqueada()) && (await p.textContent("#u-nombre")) === "Rober" && !(await p.evaluate(() => document.getElementById("dlg").open)) && (await pestanas()).includes("stock"), "«Entrar con otro usuario»: entra Rober con sus pestañas y la ventana de Lu quedó cerrada");
await p.evaluate(() => { Object.defineProperty(document, "hidden", { configurable: true, get: () => true }); document.dispatchEvent(new Event("visibilitychange")); });
await p.evaluate(() => { const ahora = Date.now; Date.now = () => ahora() + 31000; Object.defineProperty(document, "hidden", { configurable: true, get: () => false }); document.dispatchEvent(new Event("visibilitychange")); });
await W(300);
ok("2.6", await bloqueada(), "fuera más de 30 s (pantalla apagada o cambio de app) → bloqueada");
await p.fill("#bl-pin", "11"); await W(400);
await p.evaluate(() => { Object.defineProperty(document, "hidden", { configurable: true, get: () => true }); document.dispatchEvent(new Event("visibilitychange")); Object.defineProperty(document, "hidden", { configurable: true, get: () => false }); document.dispatchEvent(new Event("visibilitychange")); });
await W(300);
ok("2.7", !(await bloqueada()), "fuera menos de 30 s → no se bloquea");
await irTab("ajustes");
await p.fill('[data-a="bloqueoMin"]', "1"); await p.press('[data-a="bloqueoMin"]', "Tab"); await W(300);
await p.evaluate(() => { const ahora = Date.now; Date.now = () => ahora() + 62000; });
await p.waitForFunction(() => document.getElementById("bloqueo").open, null, { timeout: 20000 }).catch(() => {});
ok("2.8", await bloqueada(), "Ajustes en 1 minuto sin uso → se bloquea por inactividad");
await p.fill("#bl-pin", "11"); await W(400);

// ── Parte 3: los 8 pedidos (mismo recorrido del QA, ahora sobre el sitio empaquetado) ──
await entrarComo("u-lu", "33"); await irTab("agenda");
await p.click('#app .blk[data-v]:has-text("Martín Ríos")'); await W(300);
await p.selectOption('select[data-a="aCargo"][data-j="1"]', "2"); await W();
const partes = await p.$$eval(".partes .player", (els) => els.map((e) => e.innerText.replace(/\s+/g, " ")));
ok("3.1", partes.some((x) => /paga también por Sofía/.test(x)), "«A cargo de»: Tomás paga su parte y la de Sofía");
await p.click('[data-a="medio"][data-v="monedero"]'); await p.fill("#monto", "10000"); await p.click('[data-a="pagar"]'); await W();
const panel = await p.$eval(".confirma-credito", (e) => e.innerText).catch(() => "");
ok("3.3", /Usamos los créditos/.test(panel), "créditos: aparece la confirmación antes de descontar"); await foto("confirma-credito");
await p.click('[data-a="anularCredito"]'); await W();
await p.click('.partes [data-a="pagarParte"][data-j="2"]'); await W();
ok("3.2", /incluye la parte de Sofía/.test(await aviso()), `cobro a Tomás: «${(await aviso()).trim().slice(0, 60)}»`);
ok("3.4", !/[Cc]onsumo/.test(await p.evaluate(() => document.body.innerText)), "la pantalla dice «cargo», no «consumo»");
await p.click('.jug-cargos [data-a="ajustar"][data-m="-1"]'); await W();
ok("3.8", /Uno menos/.test(await aviso()), "− en «Cargos de los jugadores»");
await p.click('.jug-cargos [data-a="verCuenta"]'); await W(300);
await p.click("details.mesa summary"); await W(100);
await p.fill("#tc-cant", "1"); await p.click('[data-a="pasarCargo"]'); await W();
ok("3.5", /Cargo pasado/.test(await aviso()) && await p.$eval("details.mesa", (d) => d.open), "mesa compleja: pasa 1 unidad a otra cuenta y el desplegable sigue abierto");
await p.fill("#cm-con", "Torta"); await p.selectOption("#cm-tipo", "cargo"); await p.fill("#cm-mon", "15000"); await p.click('[data-a="cargoManual"]'); await W();
ok("3.6", /Cargo manual sumado/.test(await aviso()), "cargo manual «Torta» $15.000");
await p.fill("#cm-con", "Desc"); await p.selectOption("#cm-tipo", "descuento"); await p.fill("#cm-mon", "1000"); await p.fill("#cm-pin", "11"); await p.click('[data-a="cargoManual"]'); await W();
const iD = await p.$$eval("#tc-item option", (o) => o.findIndex((x) => x.textContent.includes("-$")));
await p.selectOption("#tc-item", String(iD)); await p.click('[data-a="pasarCargo"]'); await W();
ok("3.7", /no se pasa a otra/.test(await aviso()), "un descuento no se puede pasar a otra cuenta");
await foto("mesa-compleja"); await cerrar();
await entrarComo("u-rober", "11"); await irTab("stock");
const cab = await p.$$eval("#app thead th", (t) => t.map((x) => x.textContent));
await p.fill("#busca-stock", "bp-002"); await W(300);
const porInterno = await p.locator("#app tbody tr", { hasText: "Agua 500 ml" }).count();
await p.fill("#busca-stock", "7790000000028"); await W(300);
const porFabrica = await p.locator("#app tbody tr", { hasText: "Agua 500 ml" }).count();
ok("3.9", cab.includes("Cód. interno") && cab.includes("Cód. fábrica") && porInterno && porFabrica, "stock: dos columnas de código y búsqueda por interno y por fábrica");
await p.fill("#busca-stock", ""); await W(200);
await p.click('[data-a="stockModo"][data-v="precios"]'); await W(300);
const idp = await p.$eval('table.precios input[data-c="markup"]:not([disabled])', (e) => e.dataset.v);
await p.fill(`#px-m-${idp}`, "150"); await p.press(`#px-m-${idp}`, "Tab"); await W(300);
const precio = await p.inputValue(`#px-p-${idp}`);
await p.fill(`#px-c-${idp}`, ""); await p.press(`#px-c-${idp}`, "Tab"); await W(300);
ok("3.10", Number(precio) % 50 === 0 && /no puede quedar vacío/.test(await p.textContent("#toasts")), `precios: % sobre costo recalcula el precio (${precio}) y un campo vacío no guarda`);
await foto("precios");

// ── 4.2: registro con celular en el turnero ──
const t = await ctx.newPage();
t.on("pageerror", (e) => errores.push(`turnero: ${e.message}`));
await t.goto(`${BASE}/turnero?demo=1`); await t.waitForSelector("body[data-estado=listo]", { timeout: 10000 }).catch(() => {});
if (!(await t.locator(".slot").count())) { await t.locator("#dias .dia").nth(1).click(); await t.waitForTimeout(400); }
await t.locator(".slot").first().click(); await t.click("#btn-confirmar"); await t.click("#btn-ir-registro");
await t.fill("#reg-nombre", "Celular UAT"); await t.fill("#reg-tel", "11 5000 9999"); await t.fill("#reg-clave", "corta");
await t.locator("#form-registro [type=submit]").click(); await t.waitForTimeout(400);
const rechazaCorta = !(await t.locator("#dlg-pago[open]").count());
await t.fill("#reg-clave", "canchaazul9"); await t.locator("#form-registro [type=submit]").click();
await t.waitForSelector("#dlg-pago[open]", { timeout: 8000 }).catch(() => {});
ok("4.2", rechazaCorta && (await t.locator("#dlg-pago[open]").count()) === 1, "registro con celular: la contraseña corta se rechaza; con una válida, reserva y pide la seña");
await t.screenshot({ path: `${OUT}/${String(++n).padStart(2, "0")}-turnero-registro.png` });

ok("consola", !errores.length, `cero errores de consola${errores.length ? `: ${errores.slice(0, 3).join(" | ")}` : ""}`);
await b.close(); srv.close();
const fallas = filas.filter((f) => f.estado !== "OK");
console.log(`\nRESUMEN ${filas.length - fallas.length}/${filas.length} OK`);
await (await import("node:fs/promises")).writeFile(`${OUT}/resultado.json`, JSON.stringify(filas, null, 1));
process.exit(fallas.length ? 1 : 0);
