// ============================================================================
// INGRESO POR PUESTO (MIA-259) — Playwright entra por la app como cada puesto de MIA y guarda su sesión.
// ============================================================================
//
// Para capturas y QA sobre la demo LOCAL (`node scripts/proyectos/demo-local.mjs --start`, seed de MIA). Nunca contra
// producción: corta si la URL no es localhost. Entra por el flujo real, sin cookies armadas ni atajos en la base:
//   clave → segundo paso (TOTP, si el puesto ve plata) → cambio de clave (si lo pide) → código que genera Dirección en
//   /admin/proyectos/equipo (puestos con PIN) → definir PIN («Ahora no» en los puestos con TOTP).
// Una vez adentro guarda el `storageState` del puesto y las próximas corridas lo reusan: el código de equipo tiene tope de
// 5 cada 15 minutos por persona (src/lib/rendiciones/pin.server.ts, `pedidosPorPersona`), así que se pide uno por puesto.
//
//   node scripts/proyectos/ingreso-por-puesto.mjs [puesto ...]      (sin puestos: los 7)
//   → .ingreso-por-puesto/<puesto>.json   (storageState; fuera de Git, ver .gitignore)
//   Variables: MIA_URL (http://mia-producciones.localhost:3218), MIA_DEMO_PASSWORD (la del seed), INGRESO_DIR, CAPTURAS=1
//   (saca <puesto>.png de su inicio en INGRESO_DIR), HEADED=1.
// En otro script: `browser.newContext({ storageState: ".ingreso-por-puesto/comercial.json" })`.
// Selectores: docs/qa/selectores-ingreso.md.

import { chromium } from "playwright";
import { createHmac } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const URL_BASE = (process.env.MIA_URL ?? "http://mia-producciones.localhost:3218").replace(/\/$/, "");
if (!/^https?:\/\/([a-z0-9-]+\.)*localhost(:\d+)?$/i.test(URL_BASE)) {
  console.error(`❌ ingreso-por-puesto sólo corre contra la demo local (localhost). URL: ${URL_BASE}`);
  process.exit(1);
}
const DIR = process.env.INGRESO_DIR ?? ".ingreso-por-puesto";
const CLAVE_SEED = process.env.MIA_DEMO_PASSWORD ?? "mia-demo-2026";
// La clave nueva del cambio obligatorio: derivada de la del seed, sólo existe en la base local de la demo.
const CLAVE_NUEVA = `${CLAVE_SEED}-QA-local-9`;
const PIN = "4826";

// Puesto → usuario del seed (prisma/seed-mia-producciones.ts y seed-mia-gestion.ts). `pin`: entra con código de equipo.
export const PUESTOS = {
  direccion: { email: "admin@mia-producciones.demo", nombre: "Dueño de MIA", pin: false },
  administracion: { email: "administracion@mia-producciones.demo", nombre: "Rocío Medina", pin: false },
  comercial: { email: "comercial@mia-producciones.demo", nombre: "Lucía Paz", pin: true },
  diseno: { email: "diseno@mia-producciones.demo", nombre: "Equipo de diseño", pin: false },
  produccion: { email: "produccion@mia-producciones.demo", nombre: "Paula Ibáñez", pin: true },
  campo: { email: "campo@mia-producciones.demo", nombre: "Bruno Ledesma", pin: true },
  sinficha: { email: "sinficha@mia-producciones.demo", nombre: "Sin ficha", pin: false },
};

// Errores de la app: `role="alert"` menos el anunciador de rutas de Next (`#__next-route-announcer__`, también `role="alert"`,
// lee el título de la página: «Verificación en dos pasos» parecía un TOTP rechazado).
const alertaDe = (page) => page.locator('[role="alert"]:not(#__next-route-announcer__)');
const log = (m) => process.stdout.write(`[ingreso] ${m}\n`);
const archivo = (puesto, ext = "json") => path.join(DIR, `${puesto}.${ext}`);
const secretos = () => (existsSync(archivo("_secretos")) ? JSON.parse(readFileSync(archivo("_secretos"), "utf8")) : {});
const guardarSecreto = (puesto, datos) => writeFileSync(archivo("_secretos"), JSON.stringify({ ...secretos(), [puesto]: { ...secretos()[puesto], ...datos } }, null, 2));

// TOTP (RFC 6238, SHA-1, 30 s, 6 dígitos), igual que src/lib/proyectos/segundo-factor-core.ts:63.
function deBase32(texto) {
  const abc = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of texto.replace(/[\s=]/g, "").toUpperCase()) bits += abc.indexOf(c).toString(2).padStart(5, "0");
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}
function totp(base32, ahoraMs = Date.now()) {
  const contador = Buffer.alloc(8);
  contador.writeBigUInt64BE(BigInt(Math.floor(ahoraMs / 30_000)));
  const firma = createHmac("sha1", deBase32(base32)).update(contador).digest();
  const corte = firma[firma.length - 1] & 15;
  return String((firma.readUInt32BE(corte) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}
// El servidor no acepta dos veces el mismo paso (verificarCodigo, ultimoPaso): si el último se usó en este paso, espera el próximo.
async function totpFresco(puesto, base32) {
  const paso = () => Math.floor(Date.now() / 30_000);
  if (secretos()[puesto]?.ultimoPaso === paso()) await new Promise((r) => setTimeout(r, 30_000 - (Date.now() % 30_000) + 500));
  guardarSecreto(puesto, { ultimoPaso: paso() });
  return totp(base32);
}

async function sesionValida(browser, puesto) {
  if (!existsSync(archivo(puesto))) return false;
  const ctx = await browser.newContext({ storageState: archivo(puesto) });
  const page = await ctx.newPage();
  await page.goto(`${URL_BASE}/admin`);
  const ok = !/\/admin\/(login|cambiar-password|definir-pin)/.test(page.url());
  await ctx.close();
  return ok;
}

/** Dirección genera el código de ingreso de `nombre` en Equipo y permisos y lo lee de la pantalla. */
async function codigoDeEquipo(browser, nombre, reintento = false) {
  const ctx = await browser.newContext({ storageState: archivo("direccion") });
  const page = await ctx.newPage();
  await page.goto(`${URL_BASE}/admin/proyectos/equipo`);
  await page.getByRole("button", { name: `Generar código de ingreso para ${nombre}` }).click();
  const estado = page.getByRole("status").filter({ has: page.locator("p.font-mono") });
  const error = alertaDe(page);
  await Promise.race([estado.waitFor(), error.waitFor()]);
  if (await error.isVisible()) {
    const texto = await error.innerText();
    await ctx.close();
    // Al entrar con la clave, /admin/login/pin ya le pidió un código por mail: hay un minuto entre códigos (pin-core.ts:89).
    if (!reintento && /hace instantes/.test(texto)) {
      log(`${nombre}: ya salió un código por mail; espero el minuto entre códigos`);
      await new Promise((r) => setTimeout(r, 61_000));
      return codigoDeEquipo(browser, nombre, true);
    }
    throw new Error(`Equipo no generó el código de ${nombre}: ${texto}`);
  }
  const codigo = (await estado.locator("p.font-mono").innerText()).replace(/\D/g, "");
  await ctx.close();
  return codigo;
}

async function entrar(browser, puesto) {
  const p = PUESTOS[puesto];
  if (!p) throw new Error(`Puesto desconocido: ${puesto}. Puestos: ${Object.keys(PUESTOS).join(", ")}`);
  if (await sesionValida(browser, puesto)) {
    log(`${puesto}: reuso ${archivo(puesto)}`);
    return capturarInicio(browser, puesto);
  }
  if (p.pin && !(await sesionValida(browser, "direccion"))) await entrar(browser, "direccion");

  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${URL_BASE}/admin/login`);
  await page.locator("#login-email").fill(p.email);
  await page.locator("#login-password").fill(secretos()[puesto]?.clave ?? CLAVE_SEED);
  await Promise.all([page.waitForURL((u) => !u.pathname.endsWith("/admin/login")), page.locator("#login-password").press("Enter")]);

  for (let vuelta = 0; vuelta < 8; vuelta++) {
    await page.waitForLoadState("networkidle");
    const ruta = new URL(page.url()).pathname;
    if (ruta.startsWith("/admin/login/segundo-paso")) {
      const listo = page.getByRole("link", { name: /^(Entrar|Ya los guardé, entrar)$/ });
      if (await listo.isVisible()) {
        await listo.click();
        continue;
      }
      const visible = page.locator("[data-secreto]");
      if ((await visible.count()) > 0) {
        await page.getByText("No puedo escanear").click();
        guardarSecreto(puesto, { totp: (await visible.innerText()).trim() });
      }
      const base32 = secretos()[puesto]?.totp;
      if (!base32) throw new Error(`${puesto}: el segundo paso ya está activo y no tengo su secreto en ${archivo("_secretos")}.`);
      await page.locator("#codigo").fill(await totpFresco(puesto, base32));
      await page.locator("#codigo").press("Enter");
      // Activando: muestra los códigos de respaldo («Ya los guardé, entrar»). Ya activo: redirige solo (segundo-paso/acciones.ts:32).
      await Promise.race([
        page.waitForURL((u) => !u.pathname.startsWith("/admin/login/segundo-paso")),
        page.getByRole("link", { name: /^(Entrar|Ya los guardé, entrar)$/ }).or(alertaDe(page)).first().waitFor(),
      ]);
      if (await alertaDe(page).isVisible()) throw new Error(`${puesto}: TOTP rechazado: ${await alertaDe(page).innerText()}`);
    } else if (ruta.startsWith("/admin/cambiar-password")) {
      await page.locator("#cp-current").fill(secretos()[puesto]?.clave ?? CLAVE_SEED);
      await page.locator("#cp-new").fill(CLAVE_NUEVA);
      await page.locator("#cp-confirm").fill(CLAVE_NUEVA);
      await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/admin/cambiar-password")), page.locator("#cp-confirm").press("Enter")]);
      guardarSecreto(puesto, { clave: CLAVE_NUEVA });
    } else if (ruta.startsWith("/admin/login/pin")) {
      const codigo = await codigoDeEquipo(browser, p.nombre);
      await page.locator("#codigo").fill(codigo);
      await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/admin/login/pin")), page.locator("#codigo").press("Enter")]);
    } else if (ruta.startsWith("/admin/definir-pin")) {
      if (p.pin) {
        await page.locator("#pin").fill(PIN);
        await page.locator("#confirmacion").fill(PIN);
        await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/admin/definir-pin")), page.locator("#confirmacion").press("Enter")]);
      } else {
        // Un <a> común: se sigue su href. Con click, a veces la página se rehacía y el enlace quedaba suelto (30 s de espera).
        const href = await page.getByRole("link", { name: "Ahora no" }).getAttribute("href");
        await page.goto(new URL(href ?? "/admin", page.url()).href);
      }
    } else if (ruta.startsWith("/admin/login")) {
      const alerta = alertaDe(page);
      throw new Error(`${puesto}: el ingreso volvió al login${(await alerta.count()) ? `: ${await alerta.first().innerText()}` : ""}.`);
    } else {
      break;
    }
  }
  await ctx.storageState({ path: archivo(puesto) });
  log(`${puesto}: adentro (${new URL(page.url()).pathname}) → ${archivo(puesto)}`);
  await ctx.close();
  await capturarInicio(browser, puesto);
}

/** CAPTURAS=1: el inicio del puesto (lo que abre /admin), con la sesión guardada; también al reusarla. */
async function capturarInicio(browser, puesto) {
  if (process.env.CAPTURAS !== "1") return;
  const ctx = await browser.newContext({ storageState: archivo(puesto), viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await page.goto(`${URL_BASE}/admin`);
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: archivo(puesto, "png"), fullPage: false });
  log(`${puesto}: captura de ${new URL(page.url()).pathname} → ${archivo(puesto, "png")}`);
  await ctx.close();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  mkdirSync(DIR, { recursive: true });
  // Si el Playwright del proyecto no trae su navegador (la nube trae el suyo en /opt/pw-browsers), usa ese o PW_CHROMIUM.
  const navegador = process.env.PW_CHROMIUM ?? (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined);
  const browser = await chromium.launch({ headless: process.env.HEADED !== "1", ...(navegador ? { executablePath: navegador } : {}) });
  try {
    for (const puesto of process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(PUESTOS)) await entrar(browser, puesto);
  } finally {
    await browser.close();
  }
}

export { entrar };
