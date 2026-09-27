// Recorrido de /operador/login en `next start` con una OPERATOR_PASSWORD de laboratorio que trae un
// Enter al final (el error de Vercel). Nunca se saca captura con una clave escrita en pantalla.
import { chromium } from "/home/user/erp-ingreso/node_modules/playwright/index.mjs";
import { mkdirSync } from "node:fs";

const BASE = "http://localhost:3947";
const OUT = "/home/user/erp-ingreso/.qa/ingreso-operador";
const CLAVE = "lab-ingreso-2709"; // de laboratorio; la variable del server es "lab-ingreso-2709\n"
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const resultados = [];
const erroresDeConsola = [];
let ok = true;
const check = (cond, que) => {
  resultados.push(`${cond ? "OK  " : "FAIL"} ${que}`);
  if (!cond) ok = false;
};

async function nueva(ancho = 390) {
  const ctx = await browser.newContext({ viewport: { width: ancho, height: ancho === 390 ? 844 : 900 } });
  const page = await ctx.newPage();
  page.on("console", (m) => m.type() === "error" && erroresDeConsola.push(`${page.url()} :: ${m.text()}`));
  page.on("pageerror", (e) => erroresDeConsola.push(`${page.url()} :: pageerror ${e.message}`));
  return { ctx, page };
}

async function camposVacios(page) {
  const u = await page.locator("#operador-nombre").inputValue();
  const c = await page.locator("#operador-clave").inputValue();
  return u === "" && c === "";
}

async function ingresar(page, usuario, clave) {
  await page.goto(`${BASE}/operador/login`);
  await page.fill("#operador-nombre", usuario);
  await page.fill("#operador-clave", clave);
  await Promise.all([page.waitForURL((u) => !u.href.endsWith("/operador/login"), { timeout: 20_000 }), page.click("button[type=submit]")]);
  await page.waitForLoadState("networkidle");
}

// 0. La pantalla: rótulo, pista con el dueño configurado, Mostrar/Ocultar.
{
  const { ctx, page } = await nueva();
  await page.goto(`${BASE}/operador/login`);
  check((await page.locator("label[for=operador-nombre]").innerText()).trim().toLowerCase() === "usuario", "rótulo del campo = Usuario");
  const pista = (await page.locator("#operador-nombre-pista").innerText()).trim();
  check(pista === "Si sos el dueño: dejalo vacío o escribí «duenio»", `pista visible: "${pista}"`);
  check((await page.locator("#operador-nombre").getAttribute("aria-describedby")) === "operador-nombre-pista", "pista asociada al campo (aria-describedby)");
  check((await page.locator("#operador-nombre").getAttribute("placeholder")) === null, "sin el placeholder viejo");
  const boton = page.getByRole("button", { name: "Mostrar" });
  check((await page.locator("#operador-clave").getAttribute("type")) === "password", "clave oculta por defecto");
  await boton.click(); // con el campo VACÍO: no se muestra ninguna clave
  check((await page.locator("#operador-clave").getAttribute("type")) === "text", "Mostrar → la clave se ve");
  await page.getByRole("button", { name: "Ocultar" }).click();
  check((await page.locator("#operador-clave").getAttribute("type")) === "password", "Ocultar → vuelve a ocultarse");
  check(await camposVacios(page), "campos vacíos antes de la captura");
  await page.screenshot({ path: `${OUT}/01-pantalla-390.png`, fullPage: true });
  await ctx.close();
}

// 1-3. Entra el dueño: usuario vacío, con su nombre, y con un espacio al final de lo tipeado.
for (const [n, usuario, clave, que, archivo] of [
  ["02", "", CLAVE, "usuario vacío", "entra-usuario-vacio"],
  ["03", "duenio", CLAVE, "usuario «duenio»", "entra-usuario-duenio"],
  ["04", "", `${CLAVE} `, "clave tipeada con un espacio al final", "entra-clave-con-espacio-al-final"],
]) {
  const { ctx, page } = await nueva();
  await ingresar(page, usuario, clave);
  const url = new URL(page.url());
  const cookie = (await ctx.cookies()).find((c) => c.name === "operator_session");
  check(url.pathname === "/operador" && !!cookie && decodeURIComponent(cookie.value).startsWith("op|d|duenio|"), `${que} (variable con Enter al final) → entra a ${url.pathname}, sesión de dueño`);
  await page.screenshot({ path: `${OUT}/${n}-${archivo}-390.png`, fullPage: false });
  await ctx.close();
}

// 4. Clave mal: el aviso nuevo.
{
  const { ctx, page } = await nueva();
  await ingresar(page, "", "no-es-la-clave");
  const aviso = (await page.locator("div[role=alert].bg-danger-soft").innerText()).replace(/\s+/g, " ").trim();
  check(
    aviso === "Usuario o clave incorrectos. Si sos el dueño, el usuario va vacío o «duenio», y la clave es la de OPERATOR_PASSWORD en Vercel (Production).",
    `clave mal → "${aviso}"`,
  );
  check(!(await ctx.cookies()).some((c) => c.name === "operator_session"), "clave mal → sin sesión");
  check(await camposVacios(page), "campos vacíos antes de la captura");
  await page.screenshot({ path: `${OUT}/05-clave-mal-390.png`, fullPage: true });

  // 5. Cuatro fallos más: el quinto ya muestra el freno con los minutos (no espera al sexto).
  for (let i = 0; i < 4; i++) await ingresar(page, "", `mal-${i}`);
  const frenado = (await page.locator("div[role=alert].bg-danger-soft").innerText()).replace(/\s+/g, " ").trim();
  check(new URL(page.url()).searchParams.get("error") === "throttled", "quinto fallo → error=throttled");
  check(/^Demasiados intentos fallidos desde esta conexión\. Esperá 15 minutos y volvé a probar\./.test(frenado), `frenado → "${frenado}"`);
  check(/datos del celular/.test(frenado), "frenado → menciona cambiar de red");
  check(await camposVacios(page), "campos vacíos antes de la captura");
  await page.screenshot({ path: `${OUT}/06-frenado-390.png`, fullPage: true });

  // 6. Frenado, ni la clave buena entra; sigue diciendo los minutos.
  await ingresar(page, "", CLAVE);
  check(new URL(page.url()).pathname === "/operador/login" && new URL(page.url()).searchParams.get("min") !== null, "frenado + clave buena → sigue frenado, con minutos");
  check(!(await ctx.cookies()).some((c) => c.name === "operator_session"), "frenado → sin sesión");
  await ctx.close();
}

// 8. Sin id de Server Action: el formulario es HTML común contra una dirección fija. Se mira el
//    pedido que sale del navegador, y se entra con JavaScript APAGADO (sin JS no hay action posible).
{
  // Otra conexión (otra IP): el freno de arriba es de la conexión anterior; cambiar de red lo destraba.
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, extraHTTPHeaders: { "x-forwarded-for": "198.51.100.8" } });
  const page = await ctx.newPage();
  page.on("console", (m) => m.type() === "error" && erroresDeConsola.push(`${page.url()} :: ${m.text()}`));
  await page.goto(`${BASE}/operador/login`);
  const form = page.locator("form[aria-labelledby=login-titulo]");
  check((await form.getAttribute("action")) === "/operador/login/ingresar" && (await form.getAttribute("method")) === "post", "form: POST nativo a /operador/login/ingresar");
  let pedido = null;
  page.on("request", (r) => r.method() === "POST" && (pedido ??= r));
  await ingresar(page, "", CLAVE);
  const h = pedido ? await pedido.allHeaders() : {};
  check(!!pedido && new URL(pedido.url()).pathname === "/operador/login/ingresar" && !("next-action" in h), `pedido sin cabecera next-action (${pedido && new URL(pedido.url()).pathname})`);
  check(new URL(page.url()).pathname === "/operador", "entra por la ruta fija (desde otra conexión, con la primera todavía frenada)");
  await ctx.close();
}
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, javaScriptEnabled: false, extraHTTPHeaders: { "x-forwarded-for": "198.51.100.9" } });
  const page = await ctx.newPage();
  await ingresar(page, "", CLAVE);
  const cookie = (await ctx.cookies()).find((c) => c.name === "operator_session");
  check(new URL(page.url()).pathname === "/operador" && !!cookie, "con JavaScript apagado, entra igual");
  await ctx.close();
}

// 7. La pantalla a 1440 (sin error).
{
  const { ctx, page } = await nueva(1440);
  await page.goto(`${BASE}/operador/login`);
  check(await camposVacios(page), "campos vacíos antes de la captura (1440)");
  await page.screenshot({ path: `${OUT}/07-pantalla-1440.png`, fullPage: true });
  await ctx.close();
}

await browser.close();
console.log(resultados.join("\n"));
console.log(`\nerrores de consola: ${erroresDeConsola.length}`);
for (const e of erroresDeConsola) console.log("  " + e);
console.log(ok ? "\nRESULTADO: OK" : "\nRESULTADO: FALLÓ");
process.exit(ok ? 0 : 1);
