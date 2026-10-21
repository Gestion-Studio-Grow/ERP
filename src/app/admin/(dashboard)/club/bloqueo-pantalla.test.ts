// ============================================================================
// EL BLOQUEO DEL CLUB en un navegador de verdad — la jornada real arranca bloqueada y se entra con el PIN.
// ============================================================================
//
// Mismo armado que club-pantalla.test.ts / solapas-pantalla.test.ts: ClubDemo REAL con esbuild (con sus piezas
// globales de verdad, el bloqueo primero), el CSS REAL de la app y el Chromium de Playwright, con el reloj del
// navegador en la mano (`clock`). Se prueba, clic por clic:
//   · jornada real: arranca bloqueada (modal de verdad: Escape no cierra, lo de atrás no se toca) → 5 PIN mal →
//     espera de 30 s que sobrevive a recargar → PIN bueno → entra → 5 min sin uso → vuelve a bloquear → «Tu PIN
//     para seguir» → L bloquea a mano → «Entrar con otro usuario»;
//   · demo: no bloquea; «Cambiar de usuario» deja probar con otro usuario y su PIN;
//   · nunca se ve un PIN; objetivos táctiles de 44 px en el bloqueo; 390 y 1024 px;
//   · primera vez (jornada real nueva, `configurado: false`): sólo la consola → Rober y Majo arman su PIN → entra Rober
//     → recepción, precios y fondo → «Abrir el club» → bloqueado → entra con su PIN; y restaurar por el almacén (sin
//     lugar para la copia no restaura; con lugar, deja la copia de lo de antes).
// Con CAPTURAS_BLOQUEO=<carpeta> deja capturas. Sin Chromium o sin esbuild, se saltea con el motivo.

import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Browser, BrowserContext, Page } from "playwright";
import { irASolapa, tieneSolapa, nombresDeSolapas } from "./solapas-e2e";
import * as M from "@/lib/club/motor.mjs";
import { claveDeLaJornada, textoDeLaDemo, textoDelEstado } from "./almacen";
import { claveDeIntentosDelBloqueo } from "./bloqueo-core";
import { SOLAPAS_DEL_CLUB } from "./solapas-club";

const RAIZ = fileURLToPath(new URL("../../../../../", import.meta.url));
const ORIGEN = "http://localhost:3999/admin/club";
const CAPTURAS = process.env.CAPTURAS_BLOQUEO ?? "";

const ENTRADA = `
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import ClubDemo from "@/app/admin/(dashboard)/club/ClubDemo";
window.__montar = (negocio, usuario, rol, reloj) =>
  createRoot(document.getElementById("root")).render(createElement(ClubDemo, { negocio, usuario, rol, reloj }));
`;
type Ventana = { __montar: (negocio: string, usuario: string, rol: string, reloj: string) => void };

// Los PIN de la demo del motor: ninguno puede aparecer en la pantalla bloqueada ni en «Cambiar de usuario».
const PINES = M.generarDemo("2026-10-17").usuarios.map((u) => u.pin).filter(Boolean);

function rutaDeChromium(porDefecto: () => string): string | null {
  try {
    const p = porDefecto();
    if (existsSync(p)) return p;
  } catch {
    // sin navegador registrado: se busca abajo
  }
  const dir = process.env.PLAYWRIGHT_BROWSERS_PATH ?? "/opt/pw-browsers";
  if (!existsSync(dir)) return null;
  for (const n of readdirSync(dir).filter((x) => /^chromium-\d+$/.test(x)).sort().reverse()) {
    for (const sub of ["chrome-linux64", "chrome-linux"]) {
      const p = join(dir, n, sub, "chrome");
      if (existsSync(p)) return p;
    }
  }
  return null;
}

async function cssDeLaApp(): Promise<string> {
  try {
    const postcss = (await import("postcss")).default;
    const tailwind = (await import("@tailwindcss/postcss")).default as unknown as (o: { base: string }) => import("postcss").AcceptedPlugin;
    const archivo = join(RAIZ, "src", "app", "globals.css");
    return (await postcss([tailwind({ base: RAIZ })]).process(readFileSync(archivo, "utf8"), { from: archivo })).css;
  } catch {
    return "";
  }
}

describe("El bloqueo del club en el navegador", { timeout: 240_000 }, () => {
  let browser: Browser | null = null;
  let bundle = "";
  let css = "";
  let sinNavegador = "";

  before(async () => {
    let esbuild: typeof import("esbuild");
    let playwright: typeof import("playwright");
    try {
      esbuild = await import("esbuild");
      playwright = await import("playwright");
    } catch {
      sinNavegador = "no están esbuild o playwright";
      return;
    }
    const chrome = rutaDeChromium(() => playwright.chromium.executablePath());
    if (!chrome) {
      sinNavegador = "no hay un Chromium instalado";
      return;
    }
    const r = await esbuild.build({
      stdin: { contents: ENTRADA, loader: "tsx", resolveDir: RAIZ },
      bundle: true,
      write: false,
      format: "iife",
      jsx: "automatic",
      tsconfig: join(RAIZ, "tsconfig.json"),
      define: { "process.env.NODE_ENV": '"production"' },
      logLevel: "silent",
    });
    bundle = r.outputFiles[0].text;
    css = await cssDeLaApp();
    browser = await playwright.chromium.launch({ executablePath: chrome });
    if (CAPTURAS) mkdirSync(CAPTURAS, { recursive: true });
  });

  after(async () => {
    await browser?.close();
  });

  const html = () => `<!doctype html><html lang="es"><head><style>${css}</style></head><body class="bg-surface text-body"><main id="root" class="p-4"></main></body></html>`;

  async function abrir(contexto: BrowserContext, errores: string[], reloj: "real" | "demo", rol = "RECEPTION", sembrar: boolean | ((e: M.EstadoClub) => void) = false): Promise<Page> {
    const p = await contexto.newPage();
    p.on("pageerror", (e) => errores.push(e.message));
    p.on("console", (m) => {
      if (m.type() === "error") errores.push(m.text());
    });
    await p.goto(ORIGEN);
    if (sembrar) {
      // Una jornada ya cargada en este equipo (la demo del día, con sus usuarios y sus PIN).
      const e = M.generarDemo("2026-10-17");
      if (typeof sembrar === "function") sembrar(e);
      const guardado = textoDeLaDemo(textoDelEstado(e), "2026-10-17", 1);
      await p.evaluate(([k, v]) => localStorage.setItem(k, v), [claveDeLaJornada("demo-club"), guardado]);
    }
    await montarEn(p, reloj, rol);
    return p;
  }
  async function montarEn(p: Page, reloj: "real" | "demo", rol: string) {
    await p.addScriptTag({ content: bundle });
    await p.evaluate(([r, ro]) => (window as unknown as Ventana).__montar("demo-club", "u_x", ro, r), [reloj, rol]);
    // En la jornada real sin PIN, ClubDemo no pinta la recepción (sólo «Bloqueado»): se espera una cosa o la otra.
    await p
      .getByRole("heading", { name: "Agenda de canchas" })
      .or(p.getByText(/Entrá con tu PIN para ver y operar el club/))
      .first()
      .waitFor();
  }

  const capturar = async (page: Page, nombre: string) => {
    if (CAPTURAS) await page.screenshot({ path: join(CAPTURAS, `${nombre}.png`) });
  };
  const bloqueo = (page: Page) => page.locator('dialog[data-ui="bloqueo-del-club"]');
  const pinDe = (page: Page) => bloqueo(page).locator('input[type="password"]');
  const estadoDelBloqueo = (page: Page, texto: string | RegExp) => bloqueo(page).getByRole("status").filter({ hasText: texto }).waitFor();
  const sinPines = async (page: Page, sel: string) => {
    const texto = await page.locator(sel).innerText();
    for (const pin of PINES) assert.ok(!texto.includes(pin), `se ve un PIN (${pin}) en ${sel}`);
  };
  /** Objetivos de menos de 44 px dentro del bloqueo. */
  const chicos = (page: Page) =>
    bloqueo(page).evaluate((d) =>
      [...d.querySelectorAll("button, input")]
        .map((el) => ({ el, r: el.getBoundingClientRect() }))
        .filter(({ r }) => r.width > 1 && (r.height < 44 || r.width < 44))
        .map(({ el, r }) => `${(el.textContent ?? "").trim().slice(0, 30)} (${Math.round(r.width)}×${Math.round(r.height)})`),
    );

  test("jornada real: bloqueada → 5 PIN mal → espera que sobrevive a recargar → PIN bueno → sin uso vuelve a bloquear", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const contexto = await browser!.newContext({ viewport: { width: 1024, height: 768 }, locale: "es-AR" });
    await contexto.clock.install({ time: new Date(2026, 9, 17, 20, 0, 5) });
    await contexto.route(ORIGEN, (r) => r.fulfill({ contentType: "text/html; charset=utf-8", body: html() }));
    const errores: string[] = [];
    let page = await abrir(contexto, errores, "real", "RECEPTION", true);

    // Arranca bloqueada: modal de verdad, tapa todo y Escape no la cierra.
    await bloqueo(page).getByRole("heading", { name: "Pantalla bloqueada" }).waitFor();
    await bloqueo(page).getByText("Se volvió a abrir el sistema: poné tu PIN.").waitFor();
    assert.equal(await bloqueo(page).evaluate((d) => (d as HTMLDialogElement).matches(":modal")), true, "es un diálogo modal (lo de atrás queda inerte)");
    // Sin PIN, ClubDemo ni siquiera pinta la recepción (terminales 94ba76af): no hay solapas ni agenda detrás.
    assert.equal(await page.locator('[role="tab"]').count(), 0, "sin PIN no se pintan las solapas");
    assert.equal(await page.getByRole("heading", { name: "Agenda de canchas" }).count(), 0, "sin PIN no se ve la agenda");
    await page.keyboard.press("Escape");
    assert.equal(await bloqueo(page).evaluate((d) => (d as HTMLDialogElement).open), true, "Escape no la cierra");
    await page.keyboard.press("Tab");
    assert.equal(await page.evaluate(() => !!document.activeElement?.closest('dialog[data-ui="bloqueo-del-club"]')), true, "el foco queda adentro");

    // Nadie estaba (recarga): se elige quién entra. Sin PINs a la vista.
    const quien = bloqueo(page).getByRole("group", { name: "¿Quién entra?" });
    await quien.waitFor();
    assert.equal(await quien.getByRole("button").count(), 4);
    await sinPines(page, 'dialog[data-ui="bloqueo-del-club"]');
    if (css) assert.deepEqual(await chicos(page), [], "objetivos de 44 px (con el CSS de la app)");
    await capturar(page, "1024-bloqueada-quien-entra");
    await quien.getByRole("button", { name: /^Lu \(recepción tarde\)/ }).click();
    await bloqueo(page).getByLabel("PIN de Lu").waitFor();
    assert.equal(await pinDe(page).getAttribute("inputmode"), "numeric");
    assert.equal(await pinDe(page).getAttribute("autocomplete"), "off");

    // PIN vacío: no entra ni gasta un intento.
    await bloqueo(page).getByRole("button", { name: "Desbloquear" }).click();
    await estadoDelBloqueo(page, "Poné los 2 números de tu PIN.");
    // 5 PIN mal (se prueba solo al llegar al segundo número).
    for (let n = 1; n <= 4; n++) {
      await pinDe(page).fill("00");
      await estadoDelBloqueo(page, `PIN incorrecto (${n} de 5).`);
      assert.equal(await pinDe(page).inputValue(), "", "el campo se vacía");
    }
    await pinDe(page).fill("00");
    await estadoDelBloqueo(page, "Demasiados PIN equivocados: esperá 30 segundos.");
    assert.equal(await pinDe(page).isDisabled(), true);
    assert.equal(await bloqueo(page).getByRole("button", { name: "Desbloquear" }).isDisabled(), true);
    await bloqueo(page).getByText("Falta 0:30").waitFor();
    await capturar(page, "1024-bloqueada-espera");
    // La cuenta regresiva corre pero no se anuncia: el texto del aviso no cambia con los segundos.
    await page.clock.runFor(3000);
    await bloqueo(page).getByText("Falta 0:27").waitFor();
    assert.equal(await bloqueo(page).getByRole("status").filter({ hasText: /esperá 30 segundos/ }).count(), 1);
    assert.equal(await bloqueo(page).locator('[aria-hidden="true"]', { hasText: "Falta" }).count(), 1);
    assert.ok(await page.evaluate((k) => localStorage.getItem(k), claveDeIntentosDelBloqueo("demo-club")), "los intentos quedan en el equipo, por negocio");

    // Recargar no borra la espera.
    await page.close();
    page = await abrir(contexto, errores, "real");
    await bloqueo(page).getByRole("group", { name: "¿Quién entra?" }).getByRole("button", { name: /^Lu/ }).click();
    assert.equal(await pinDe(page).isDisabled(), true, "después de recargar sigue la espera");
    await estadoDelBloqueo(page, /Demasiados PIN equivocados: esperá \d+ segundos\./);

    // Pasa la espera: se anuncia una vez y se puede probar; el PIN bueno entra.
    await page.clock.runFor(31_000);
    await estadoDelBloqueo(page, "Ya podés probar de nuevo.");
    assert.equal(await pinDe(page).isDisabled(), false);
    await pinDe(page).fill(PINES[2]);
    await bloqueo(page).waitFor({ state: "detached" });
    await page.getByText("Hola, Lu.").waitFor();
    await page.locator('[data-ui="operador-del-club"]').getByText("Lu (recepción tarde)").waitFor();
    // Lu es recepción: entra, pero su acierto no borra la tanda (SEC-5: sólo un dueño vuelve a cero, o 8 h sin fallos).
    const quedo = JSON.parse((await page.evaluate((k) => localStorage.getItem(k), claveDeIntentosDelBloqueo("demo-club"))) ?? "null");
    assert.deepEqual([quedo?.fallos, quedo?.tandas], [0, 1], "el acierto de recepción deja la tanda: la próxima de 5 mal espera 2 minutos");
    await capturar(page, "1024-adentro");

    // 5 minutos sin uso (config.bloqueoMin de la demo): vuelve a bloquear, con quien estaba.
    await page.clock.runFor(5 * 60_000 + 15_000);
    await bloqueo(page).getByText("Pasaron 5 minutos sin uso.").waitFor();
    await bloqueo(page).getByLabel("Tu PIN para seguir").waitFor();
    await pinDe(page).fill(PINES[2]);
    await bloqueo(page).waitFor({ state: "detached" });
    await page.getByText("Desbloqueado.").waitFor();

    // L bloquea a mano; «Entrar con otro usuario» lleva a la lista.
    await page.locator("body").click({ position: { x: 5, y: 5 } });
    await page.keyboard.press("l");
    await bloqueo(page).getByText("Se bloqueó a mano.").waitFor();
    await bloqueo(page).getByRole("button", { name: "Entrar con otro usuario" }).click();
    await bloqueo(page).getByRole("group", { name: "¿Quién entra?" }).getByRole("button", { name: /^Rober/ }).click();
    await pinDe(page).fill(PINES[0]);
    await bloqueo(page).waitFor({ state: "detached" });
    await page.getByText("Hola, Rober.").waitFor();
    await page.locator('[data-ui="operador-del-club"]').getByText("Rober", { exact: true }).waitFor();
    assert.deepEqual(errores, []);
    await contexto.close();
  });

  test("jornada real en el celular (390 px): el bloqueo entra sin scroll de costado y con objetivos de 44 px", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    if (!css) return t.skip("no se pudo compilar el CSS de la app (los 44 px dependen de él)");
    const contexto = await browser!.newContext({ viewport: { width: 390, height: 844 }, locale: "es-AR" });
    await contexto.route(ORIGEN, (r) => r.fulfill({ contentType: "text/html; charset=utf-8", body: html() }));
    const errores: string[] = [];
    const page = await abrir(contexto, errores, "real", "OWNER", true);
    await bloqueo(page).getByRole("group", { name: "¿Quién entra?" }).waitFor();
    await capturar(page, "390-bloqueada-quien-entra");
    await bloqueo(page).getByRole("button", { name: /^Majo/ }).click();
    await bloqueo(page).getByLabel("PIN de Majo").waitFor();
    assert.deepEqual(await chicos(page), []);
    assert.equal(await bloqueo(page).evaluate((d) => d.scrollWidth - d.clientWidth), 0, "sin scroll de costado");
    await capturar(page, "390-bloqueada-pin");
    await pinDe(page).fill(PINES[1]);
    await bloqueo(page).waitFor({ state: "detached" });
    await capturar(page, "390-adentro");
    assert.deepEqual(errores, []);
    await contexto.close();
  });

  test("demo: no bloquea; «Cambiar de usuario» prueba con otro usuario y su PIN (sin mostrar ningún PIN)", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const contexto = await browser!.newContext({ viewport: { width: 1024, height: 768 }, locale: "es-AR" });
    await contexto.route(ORIGEN, (r) => r.fulfill({ contentType: "text/html; charset=utf-8", body: html() }));
    const errores: string[] = [];
    const page = await abrir(contexto, errores, "demo", "OWNER");
    const barra = page.locator('[data-ui="operador-del-club"]');
    await barra.getByText("Rober", { exact: true }).waitFor();
    assert.equal(await bloqueo(page).count(), 0, "la demo no se bloquea");
    await page.locator("body").click({ position: { x: 5, y: 5 } });
    await page.keyboard.press("l");
    assert.equal(await bloqueo(page).count(), 0, "ni con la L");

    await barra.getByRole("button", { name: "Cambiar de usuario" }).click();
    const hoja = page.getByRole("dialog", { name: "¿Quién usa el sistema?" });
    await hoja.waitFor();
    await sinPines(page, 'dialog[data-ui="hoja"]');
    await hoja.getByRole("button", { name: /^Lu/ }).click();
    await hoja.getByLabel("PIN de Lu").fill("00");
    await hoja.getByRole("button", { name: "Entrar" }).click();
    await hoja.getByRole("status").filter({ hasText: "PIN incorrecto (1 de 5)." }).waitFor();
    await capturar(page, "1024-demo-cambiar-de-usuario");
    await hoja.getByLabel("PIN de Lu").fill(PINES[2]);
    await hoja.getByRole("button", { name: "Entrar" }).click();
    await hoja.waitFor({ state: "hidden" });
    await page.getByText("Hola, Lu.").waitFor();
    await barra.getByText("Lu (recepción tarde)").waitFor();
    assert.deepEqual(errores, []);
    await contexto.close();
  });

  test("jornada real recién abierta (sin configurar, sin PIN): se ve SÓLO la consola de configuración, nada más del club", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const contexto = await browser!.newContext({ viewport: { width: 1024, height: 768 }, locale: "es-AR" });
    await contexto.route(ORIGEN, (r) => r.fulfill({ contentType: "text/html; charset=utf-8", body: html() }));
    const errores: string[] = [];
    const p = await contexto.newPage();
    p.on("pageerror", (e) => errores.push(e.message));
    await p.goto(ORIGEN);
    await p.addScriptTag({ content: bundle });
    // Sin nada guardado: la jornada real arranca en blanco (`configurado: false`, los dueños sin PIN).
    await p.evaluate(() => (window as unknown as Ventana).__montar("demo-club", "u_x", "OWNER", "real"));
    const consola = p.getByRole("region", { name: "Configuración inicial del club" });
    await consola.getByRole("heading", { name: "Configuración" }).waitFor();
    assert.equal(await p.getByRole("tablist").count(), 0, "sin solapas: sólo la consola");
    assert.equal(await p.getByRole("heading", { name: "Agenda de canchas" }).count(), 0);
    assert.equal(await p.getByText(/Entrá con tu PIN para ver y operar el club/).count(), 0, "no dice «Bloqueado»: nadie tiene PIN todavía");
    // Quien no es dueño del panel no ve la consola (la solapa es soloDuenos).
    const q = await contexto.newPage();
    await q.goto(ORIGEN);
    await q.addScriptTag({ content: bundle });
    await q.evaluate(() => (window as unknown as Ventana).__montar("demo-club", "u_y", "RECEPTION", "real"));
    await q.getByText("Falta la configuración inicial").waitFor();
    assert.equal(await q.getByRole("tablist").count(), 0);
    assert.deepEqual(errores, []);
    await contexto.close();
  });

  // ───────────── primera vez: la consola de arranque (configuración inicial) ─────────────

  /** Objetivos de menos de 44 px dentro de un contenedor (botones, campos). */
  const chicosEn = (page: Page, selector: string) =>
    page.locator(selector).first().evaluate((raiz) =>
      [...raiz.querySelectorAll("button, input:not([type=radio]):not([type=checkbox]), select, summary")]
        .map((el) => ({ el, r: el.getBoundingClientRect() }))
        .filter(({ r }) => r.width > 1 && (r.height < 44 || r.width < 44))
        .map(({ el, r }) => `${(el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 30)} (${Math.round(r.width)}×${Math.round(r.height)})`),
    );
  const sinScrollDeCostado = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  const avisoDelClub = (page: Page, texto: string | RegExp) => page.getByRole("status").filter({ hasText: texto }).first().waitFor();
  const alertaDelClub = (page: Page, texto: string | RegExp) => page.getByRole("alert").filter({ hasText: texto }).first().waitFor();

  /** La jornada real NUEVA (nada guardado en este equipo): el almacén arranca con `crearClubReal`, sin configurar. */
  async function jornadaNueva(contexto: BrowserContext, errores: string[]): Promise<Page> {
    const p = await contexto.newPage();
    p.on("pageerror", (e) => errores.push(e.message));
    p.on("console", (m) => {
      if (m.type() === "error") errores.push(m.text());
    });
    await p.goto(ORIGEN);
    await p.addScriptTag({ content: bundle });
    await p.evaluate(() => (window as unknown as Ventana).__montar("demo-club", "u_x", "OWNER", "real"));
    await p.getByRole("heading", { name: "Primera vez: armá el club" }).waitFor();
    return p;
  }

  test("primera vez: Rober y Majo arman su PIN → entra Rober → recepción, precios y fondo → «Abrir el club» → bloqueado → entra con PIN", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const contexto = await browser!.newContext({ viewport: { width: 1024, height: 768 }, locale: "es-AR", acceptDownloads: true });
    await contexto.route(ORIGEN, (r) => r.fulfill({ contentType: "text/html; charset=utf-8", body: html() }));
    const errores: string[] = [];
    const page = await jornadaNueva(contexto, errores);

    // Sin configurar y sin nadie adentro: SÓLO la consola. Nada que opere (jornada, archivar, limpieza), ni solapas.
    const consola = page.getByRole("region", { name: "Configuración inicial del club" });
    assert.equal(await page.getByRole("tablist").count(), 0, "sin solapas");
    assert.equal(await page.getByRole("heading", { name: "Agenda de canchas" }).count(), 0);
    for (const titulo of ["Jornada", "Archivar días cerrados", "Limpieza para el go-live", "Usuarios y accesos"])
      assert.equal(await consola.getByRole("heading", { name: titulo, exact: true }).count(), 0, `sin «${titulo}» antes de entrar`);
    assert.equal(await bloqueo(page).count(), 0, "sin configurar no bloquea");
    assert.equal(await consola.getByRole("button", { name: "Abrir el club" }).count(), 0, "sin un dueño con PIN no se abre");
    if (css) assert.deepEqual(await chicosEn(page, '[aria-label="Configuración inicial del club"]'), [], "objetivos de 44 px");
    assert.equal(await sinScrollDeCostado(page), 0);
    await capturar(page, "arranque-1024-1-consola");

    // 1. Cada dueño arma su PIN (repetido, distintos entre sí).
    const rober = consola.getByRole("form", { name: "PIN de Roberto Ronco" });
    assert.equal(await rober.getByLabel("PIN (4 números)").getAttribute("maxlength"), "4", "el PIN de dueño son 4 números");
    await rober.getByLabel("PIN (4 números)").fill("47");
    await rober.getByLabel("Repetilo").fill("47");
    await rober.getByRole("button", { name: "Guardar el PIN de Roberto" }).click();
    await alertaDelClub(page, "El PIN de Roberto Ronco son 4 números.");
    await rober.getByLabel("PIN (4 números)").fill("4747");
    await rober.getByLabel("Repetilo").fill("4848");
    await rober.getByRole("button", { name: "Guardar el PIN de Roberto" }).click();
    await alertaDelClub(page, "Los dos PIN no coinciden: escribilo igual las dos veces.");
    // Uno fácil no se guarda: se dice por qué, en criollo (pinFacil del motor).
    for (const [p, motivo] of [
      ["1234", "Una escalera (como 1234 o 4321) se adivina fácil: elegí otro."],
      ["1111", "Ese es un PIN de ejemplo de la demo: elegí otro."],
    ] as const) {
      await rober.getByLabel("PIN (4 números)").fill(p);
      await rober.getByLabel("Repetilo").fill(p);
      await rober.getByRole("button", { name: "Guardar el PIN de Roberto" }).click();
      await alertaDelClub(page, motivo);
    }
    await rober.getByLabel("PIN (4 números)").fill("4747");
    await rober.getByLabel("Repetilo").fill("4747");
    await rober.getByRole("button", { name: "Guardar el PIN de Roberto" }).click();
    await avisoDelClub(page, "PIN de Roberto Ronco guardado. No se lo digas a nadie.");
    await consola.getByText("✔ Roberto Ronco ya armó su PIN.").waitFor();
    const majo = consola.getByRole("form", { name: "PIN de Majo Gimenez" });
    await majo.getByLabel("PIN (4 números)").fill("4747");
    await majo.getByLabel("Repetilo").fill("4747");
    await majo.getByRole("button", { name: "Guardar el PIN de Majo" }).click();
    await alertaDelClub(page, "Ese PIN ya lo usa otra persona: elegí otro.");
    await majo.getByLabel("PIN (4 números)").fill("5858");
    await majo.getByLabel("Repetilo").fill("5858");
    await majo.getByRole("button", { name: "Guardar el PIN de Majo" }).click();
    await consola.getByText("✔ Majo Gimenez ya armó su PIN.").waitFor();
    assert.ok(!(await consola.innerText()).match(/\b(4747|5858)\b/), "nunca se ve un PIN");
    await capturar(page, "arranque-1024-2-pines");

    // 2. Entra Rober con su PIN (uno mal cuenta el intento).
    const entrar = consola.getByRole("form", { name: "Entrar como Roberto" });
    await entrar.getByLabel("PIN de Roberto").fill("1212");
    await entrar.getByRole("button", { name: "Entrar como Roberto" }).click();
    await alertaDelClub(page, "PIN incorrecto (1 de 5).");
    await entrar.getByLabel("PIN de Roberto").fill("4747");
    await entrar.getByRole("button", { name: "Entrar como Roberto" }).click();
    // Ya adentro: las solapas y, en Configuración, lo que falta y «Abrir el club».
    await page.getByRole("tab", { name: "Configuración", selected: true }).waitFor();
    const primera = page.getByRole("region", { name: "Primera vez: armá el club" });
    await primera.getByText("Entraste como Roberto.", { exact: false }).waitFor();
    await page.waitForFunction(() => document.activeElement?.id === "club-config-arranque");
    await avisoDelClub(page, "Hola, Roberto.");
    for (const titulo of ["Limpieza para el go-live", "Link para clientes"])
      assert.equal(await page.getByRole("heading", { name: titulo, exact: true }).count(), 0, `sin «${titulo}» hasta abrir el club`);

    // 3. Lo opcional: recepción (el PIN se ve UNA vez), precios y fondo de caja.
    const alta = page.getByRole("form", { name: "Dar de alta a alguien" });
    await alta.getByLabel("Nombre").fill("Lu");
    await alta.getByLabel("PIN de Roberto").fill("4747");
    await alta.getByRole("button", { name: "Dar de alta" }).click();
    const pinDeLu = page.getByRole("group", { name: /^✔ Lu · Recepción/ });
    await pinDeLu.waitFor();
    const pinLu = (await pinDeLu.locator("p.text-4xl").innerText()).trim();
    assert.match(pinLu, /^\d{2}$/);
    await pinDeLu.getByRole("button", { name: "Listo, ya se lo di" }).click();
    await primera.getByText("Recepción: Lu.").waitFor();
    const reglas = page.getByRole("form", { name: "Reglas y precios" });
    await reglas.getByLabel(/^Precio por hora valle/).fill("21000");
    await reglas.getByLabel(/^Precio por hora pico/).fill("29000");
    await reglas.getByLabel("Fondo de caja (el cambio que queda en el cajón)").fill("15000");
    await reglas.getByRole("button", { name: "Guardar reglas y precios" }).click();
    await avisoDelClub(page, /^Reglas y precios guardados/);
    await primera.getByText(/Precio por hora: valle \$ 21\.000 y pico \$ 29\.000\. Fondo de caja: \$ 15\.000\./).waitFor();
    await primera.scrollIntoViewIfNeeded();
    await capturar(page, "arranque-1024-3-adentro");

    // 4. «Abrir el club»: queda bloqueado y se entra con el PIN, como todos los días.
    await primera.getByRole("button", { name: "Abrir el club" }).click();
    await bloqueo(page).getByRole("heading", { name: "Pantalla bloqueada" }).waitFor();
    assert.equal(await page.getByRole("tablist").count(), 0, "bloqueado: no se ve nada del club");
    await capturar(page, "arranque-1024-4-bloqueado");
    const quien = bloqueo(page).getByRole("group", { name: "¿Quién entra?" });
    if (await quien.count()) await quien.getByRole("button", { name: /^Roberto/ }).click();
    await pinDe(page).fill("4747");
    await bloqueo(page).waitFor({ state: "detached" });
    await irASolapa(page, "Configuración");
    await page.getByRole("heading", { name: "Jornada", exact: true }).waitFor();
    assert.equal(await page.getByRole("heading", { name: "Primera vez: armá el club" }).count(), 0, "ya configurado: sin la consola");
    await page.getByRole("heading", { name: "Limpieza para el go-live", exact: true }).waitFor();
    assert.deepEqual(errores, []);
    await contexto.close();
  });

  test("restaurar con el almacén (jornada real): sin lugar para la copia no restaura; con lugar, copia lo de antes y sigue adentro", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const contexto = await browser!.newContext({ viewport: { width: 1024, height: 768 }, locale: "es-AR", acceptDownloads: true });
    await contexto.route(ORIGEN, (r) => r.fulfill({ contentType: "text/html; charset=utf-8", body: html() }));
    const errores: string[] = [];
    // Una jornada ya cargada en este equipo (la demo del día, con sus usuarios: Rober 11).
    const page = await abrir(contexto, errores, "real", "OWNER", true);
    const quien = bloqueo(page).getByRole("group", { name: "¿Quién entra?" });
    await quien.getByRole("button", { name: /^Rober/ }).click();
    await pinDe(page).fill(PINES[0]);
    await bloqueo(page).waitFor({ state: "detached" });
    await irASolapa(page, "Configuración");
    await page.getByRole("heading", { name: "Jornada", exact: true }).waitFor();
    const [bajado] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Descargar respaldo", exact: true }).click()]);
    const ruta = await bajado.path();

    // El equipo casi lleno: entra lo de siempre, no una copia más de la jornada.
    const relleno = await page.evaluate(() => {
      const puestos: string[] = [];
      for (const tam of [1 << 20, 1 << 16, 1 << 12, 1 << 8]) {
        const trozo = "x".repeat(tam);
        for (;;) {
          const k = `relleno-${puestos.length}`;
          try {
            localStorage.setItem(k, trozo);
            puestos.push(k);
          } catch {
            break;
          }
        }
      }
      // Lugar para que la jornada se siga guardando (unos 16 KB), no para una copia entera.
      let libre = 0;
      while (libre < 16_384 && puestos.length) {
        const k = puestos.pop()!;
        libre += localStorage.getItem(k)!.length;
        localStorage.removeItem(k);
      }
      return puestos;
    });
    assert.ok(relleno.length > 0, "el equipo quedó casi lleno");
    await page.getByLabel("Elegí el respaldo").setInputFiles(ruta);
    const form = page.getByRole("form", { name: "Restaurar este respaldo" });
    await form.getByLabel("PIN de Rober").fill(PINES[0]);
    await form.getByRole("button", { name: "Restaurar este respaldo" }).click();
    await alertaDelClub(page, "No hay lugar para guardar una copia de lo de ahora: archivá o descargá y borrá copias antes de restaurar. No se tocó nada.");
    assert.equal(await page.evaluate(() => Object.keys(localStorage).filter((k) => k.includes(":antes-de-restaurar:")).length), 0);
    await capturar(page, "restaurar-1024-sin-lugar");

    // Con lugar: restaura, deja la copia de lo de antes y Rober sigue adentro (mismo PIN en el respaldo).
    await page.evaluate((ks) => ks.forEach((k) => localStorage.removeItem(k)), relleno);
    await form.getByLabel("PIN de Rober").fill(PINES[0]);
    await form.getByRole("button", { name: "Restaurar este respaldo" }).click();
    await avisoDelClub(page, "Listo: se restauró el respaldo (lo de antes quedó copiado en este equipo).");
    assert.equal(await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("gsg-club:demo-club:jornada:v1:antes-de-restaurar:")).length), 1);
    assert.equal(await bloqueo(page).count(), 0, "sigue adentro");
    await page.getByText(/En este equipo la jornada ocupa [\d.]+ KB/).waitFor();
    assert.deepEqual(errores, []);
    await contexto.close();
  });

  test("primera vez en el celular (390 px): la consola sin scroll de costado y con objetivos de 44 px", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const contexto = await browser!.newContext({ viewport: { width: 390, height: 844 }, locale: "es-AR" });
    await contexto.route(ORIGEN, (r) => r.fulfill({ contentType: "text/html; charset=utf-8", body: html() }));
    const errores: string[] = [];
    const page = await jornadaNueva(contexto, errores);
    const consola = page.getByRole("region", { name: "Configuración inicial del club" });
    assert.equal(await sinScrollDeCostado(page), 0, "sin scroll de costado");
    if (css) assert.deepEqual(await chicosEn(page, '[aria-label="Configuración inicial del club"]'), []);
    await capturar(page, "arranque-390-1-consola");
    const rober = consola.getByRole("form", { name: "PIN de Roberto Ronco" });
    await rober.getByLabel("PIN (4 números)").fill("4747");
    await rober.getByLabel("Repetilo").fill("4747");
    await rober.getByRole("button", { name: "Guardar el PIN de Roberto" }).click();
    await consola.getByRole("form", { name: "Entrar como Roberto" }).waitFor();
    assert.equal(await sinScrollDeCostado(page), 0);
    if (css) assert.deepEqual(await chicosEn(page, '[aria-label="Configuración inicial del club"]'), []);
    await consola.getByRole("button", { name: "Abrir el club" }).scrollIntoViewIfNeeded();
    await capturar(page, "arranque-390-2-entrar");
    // Sin entrar, con un dueño con PIN, también se puede abrir: queda bloqueado.
    await consola.getByRole("button", { name: "Abrir el club" }).click();
    await bloqueo(page).getByRole("heading", { name: "Pantalla bloqueada" }).waitFor();
    await capturar(page, "arranque-390-3-bloqueado");
    assert.deepEqual(errores, []);
    await contexto.close();
  });

  test("las solapas siguen a QUIEN OPERA (el PIN), no al login del puesto; al cambiar de operador se cierra la cuenta abierta", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const deDuenos = SOLAPAS_DEL_CLUB.filter((s) => s.soloDuenos).map((s) => s.etiqueta);
    assert.ok(deDuenos.includes("Configuración"));
    for (const rolDelPuesto of ["OWNER", "RECEPTION"]) {
      const contexto = await browser!.newContext({ viewport: { width: 1024, height: 768 }, locale: "es-AR" });
      // El sábado de la jornada sembrada: con el reloj de hoy, otro día no tiene los turnos de la demo.
      await contexto.clock.install({ time: new Date(2026, 9, 17, 20, 0, 5) });
      await contexto.route(ORIGEN, (r) => r.fulfill({ contentType: "text/html; charset=utf-8", body: html() }));
      const errores: string[] = [];
      const page = await abrir(contexto, errores, "real", rolDelPuesto, true);
      const entrar = async (quien: RegExp, pin: string) => {
        const otro = bloqueo(page).getByRole("button", { name: "Entrar con otro usuario" });
        if (await otro.count()) await otro.click();
        await bloqueo(page).getByRole("group", { name: "¿Quién entra?" }).getByRole("button", { name: quien }).click();
        await pinDe(page).fill(pin);
        await bloqueo(page).waitFor({ state: "detached" });
        await page.getByRole("tablist", { name: "Recepción del club" }).waitFor();
      };
      const solapas = async () => nombresDeSolapas(page);
      const bloquearAMano = async () => {
        await page.locator("body").click({ position: { x: 5, y: 5 } });
        await page.keyboard.press("l");
        await bloqueo(page).getByText("Se bloqueó a mano.").waitFor();
      };

      // Lu (recepción) entra: no ve nada de dueño, aunque el puesto sea OWNER.
      await entrar(/^Lu \(recepción tarde\)/, "33");
      const deLu = await solapas();
      t.diagnostic(`puesto ${rolDelPuesto} · Lu ve: ${deLu.join(", ")}`);
      for (const d of deDuenos) assert.ok(!deLu.includes(d), `puesto ${rolDelPuesto}: Lu no ve «${d}»`);
      // Abre la cuenta de un turno…
      await page.getByRole("button", { name: /^Martín Ríos, Cancha 1,/ }).click();
      await page.getByRole("region", { name: "Martín Ríos" }).waitFor();

      // …y entra Majo (dueña): la cuenta de Lu se cerró y ve todo lo de dueño, aunque el puesto sea RECEPTION.
      await bloquearAMano();
      await entrar(/^Majo/, "2222");
      assert.equal(await page.getByRole("region", { name: "Martín Ríos" }).count(), 0, "la cuenta que tenía abierta Lu se cerró");
      const deMajo = await solapas();
      t.diagnostic(`puesto ${rolDelPuesto} · Majo ve: ${deMajo.join(", ")}`);
      for (const d of deDuenos) assert.ok(deMajo.includes(d), `puesto ${rolDelPuesto}: Majo ve «${d}»`);
      await irASolapa(page, "Configuración");
      await page.getByRole("tab", { name: "Configuración", selected: true }).waitFor();

      // Vuelve Lu: la solapa de dueño que estaba elegida ya no está → pasa a la agenda.
      await bloquearAMano();
      await entrar(/^Lu \(recepción tarde\)/, "33");
      await page.getByRole("tab", { name: "Agenda", selected: true }).waitFor();
      assert.equal(await tieneSolapa(page, "Configuración"), false);
      assert.equal(await page.getByRole("heading", { name: "Configuración", exact: true }).count(), 0, "ni su panel");
      assert.deepEqual(errores, []);
      await contexto.close();
    }
  });

  test("dueño con el PIN viejo de 2: entra con «Desbloquear» y antes de operar elige uno de 4 (también desde «Cambiar de usuario»)", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const contexto = await browser!.newContext({ viewport: { width: 1024, height: 768 }, locale: "es-AR" });
    await contexto.clock.install({ time: new Date(2026, 9, 17, 20, 0, 5) });
    await contexto.route(ORIGEN, (r) => r.fulfill({ contentType: "text/html; charset=utf-8", body: html() }));
    const errores: string[] = [];
    // La jornada de un dueño del piloto: Rober con el PIN viejo «11»; Majo ya con uno suyo de 4; recepción con 2.
    const page = await abrir(contexto, errores, "real", "OWNER", (e) => {
      e.usuarios.find((u) => u.id === "u-rober")!.pin = "11";
      e.usuarios.find((u) => u.id === "u-majo")!.pin = "8484";
    });
    const jornada = () => page.evaluate((k) => localStorage.getItem(k) ?? "", claveDeLaJornada("demo-club"));
    const quien = bloqueo(page).getByRole("group", { name: "¿Quién entra?" });
    await quien.getByRole("button", { name: /^Rober/ }).click();
    assert.equal(await pinDe(page).getAttribute("maxlength"), "4", "el campo del dueño espera 4");
    await bloqueo(page).getByText("¿Todavía tenés el PIN viejo de 2? Ponelo y tocá «Desbloquear».").waitFor();
    // Con 2 números no prueba solo (espera 4): se confirma con «Desbloquear».
    await pinDe(page).fill("11");
    assert.equal(await bloqueo(page).getByRole("heading", { name: "Pantalla bloqueada" }).count(), 1, "con 2 no prueba solo");
    await bloqueo(page).getByRole("button", { name: "Desbloquear" }).click();
    // El paso obligatorio: no entra hasta elegir uno de 4.
    await bloqueo(page).getByRole("heading", { name: "Elegí tu PIN nuevo" }).waitFor();
    await bloqueo(page).getByText("Tu PIN de dueño ahora es de 4 números. Elegí uno nuevo: lo cargado queda todo igual.").waitFor();
    assert.equal(await page.getByRole("tablist").count(), 0, "todavía no se ve nada del club");
    assert.equal(await page.locator('[data-ui="operador-del-club"]').count(), 0, "nadie opera");
    if (css) assert.deepEqual(await chicos(page), [], "objetivos de 44 px en el paso del PIN nuevo");
    await capturar(page, "1024-pin-viejo-elegir-nuevo");
    // «Ahora no»: queda bloqueada, con Rober elegido.
    await bloqueo(page).getByRole("button", { name: "Ahora no (queda bloqueada)" }).click();
    await bloqueo(page).getByRole("heading", { name: "Pantalla bloqueada" }).waitFor();
    await pinDe(page).fill("11");
    await bloqueo(page).getByRole("button", { name: "Desbloquear" }).click();
    const nuevo = bloqueo(page).getByLabel("PIN nuevo (4 números)");
    await nuevo.waitFor();
    // No coinciden / de 2 / el de otra persona: lo dice y sigue bloqueada.
    await nuevo.fill("4747");
    await bloqueo(page).getByLabel("Repetilo").fill("4748");
    await bloqueo(page).getByRole("button", { name: "Guardar y entrar" }).click();
    await bloqueo(page).getByRole("alert").filter({ hasText: "Los dos PIN no coinciden" }).waitFor();
    await nuevo.fill("8484");
    await bloqueo(page).getByLabel("Repetilo").fill("8484");
    await bloqueo(page).getByRole("button", { name: "Guardar y entrar" }).click();
    await bloqueo(page).getByRole("alert").filter({ hasText: "Ese PIN ya lo usa otra persona" }).waitFor();
    // Uno fácil (pinFacil del motor): se dice por qué, en criollo, y sigue bloqueada.
    for (const [p, motivo] of [
      ["1234", "Una escalera (como 1234 o 4321) se adivina fácil: elegí otro."],
      ["0000", "Con todos los números iguales se adivina fácil: elegí otro."],
      ["2222", "Ese es un PIN de ejemplo de la demo: elegí otro."],
    ] as const) {
      await nuevo.fill(p);
      await bloqueo(page).getByLabel("Repetilo").fill(p);
      await bloqueo(page).getByRole("button", { name: "Guardar y entrar" }).click();
      await bloqueo(page).getByRole("alert").filter({ hasText: motivo }).waitFor();
    }
    await capturar(page, "1024-pin-nuevo-facil");
    assert.equal(await page.locator('[data-ui="operador-del-club"]').count(), 0, "nunca opera con el PIN viejo");
    // Bien: entra con el nuevo; lo cargado queda igual y el viejo deja de andar.
    await nuevo.fill("4747");
    await bloqueo(page).getByLabel("Repetilo").fill("4747");
    await bloqueo(page).getByRole("button", { name: "Guardar y entrar" }).click();
    await bloqueo(page).waitFor({ state: "detached" });
    await page.getByText("Tu PIN nuevo quedó guardado. Hola, Rober.").waitFor();
    await page.locator('[data-ui="operador-del-club"]').getByText("Rober", { exact: true }).waitFor();
    await page.getByRole("button", { name: /^Martín Ríos, Cancha 1,/ }).waitFor();
    // Se guarda solo (con su demora): el PIN nuevo queda en la jornada y el viejo no.
    await page.waitForFunction((k) => /pin\\*":\\*"4747/.test(localStorage.getItem(k) ?? ""), claveDeLaJornada("demo-club"));
    const guardada = await jornada();
    assert.equal(/pin\\*":\\*"11\\*"/.test(guardada), false, "el PIN viejo ya no está guardado");
    assert.ok(guardada.includes("Martín Ríos"), "lo cargado sigue en la jornada guardada");
    await page.locator("body").click({ position: { x: 5, y: 5 } });
    await page.keyboard.press("l");
    await bloqueo(page).getByLabel("Tu PIN para seguir").waitFor();
    assert.equal(await bloqueo(page).getByText(/PIN viejo de 2/).count(), 0, "ya nadie tiene el viejo: sin la ayuda");
    await pinDe(page).fill("11");
    await bloqueo(page).getByRole("button", { name: "Desbloquear" }).click();
    await estadoDelBloqueo(page, "PIN incorrecto (1 de 5).");
    await pinDe(page).fill("4747");
    await bloqueo(page).waitFor({ state: "detached" });
    await page.getByText("Desbloqueado.").waitFor();
    assert.deepEqual(errores, []);
    await contexto.close();

    // Desde «Cambiar de usuario» (opera Lu): Rober con el viejo pasa por la pantalla bloqueada, directo al paso.
    const otro = await browser!.newContext({ viewport: { width: 390, height: 844 }, locale: "es-AR" });
    await otro.clock.install({ time: new Date(2026, 9, 17, 20, 0, 5) });
    await otro.route(ORIGEN, (r) => r.fulfill({ contentType: "text/html; charset=utf-8", body: html() }));
    const errores2: string[] = [];
    const p2 = await abrir(otro, errores2, "real", "RECEPTION", (e) => {
      e.usuarios.find((u) => u.id === "u-rober")!.pin = "11";
    });
    await bloqueo(p2).getByRole("group", { name: "¿Quién entra?" }).getByRole("button", { name: /^Lu \(recepción tarde\)/ }).click();
    await bloqueo(p2).getByText(/PIN viejo de 2/).count().then((n) => assert.equal(n, 0, "a recepción no se le muestra la ayuda del viejo"));
    await pinDe(p2).fill("33");
    await bloqueo(p2).waitFor({ state: "detached" });
    await p2.locator('[data-ui="operador-del-club"]').getByRole("button", { name: "Cambiar de usuario" }).click();
    const hoja = p2.getByRole("dialog", { name: "¿Quién usa el sistema?" });
    await hoja.getByRole("button", { name: /^Rober/ }).click();
    await hoja.getByLabel("PIN de Rober").fill("11");
    await hoja.getByRole("button", { name: "Entrar" }).click();
    await bloqueo(p2).getByRole("heading", { name: "Tu PIN es el viejo" }).waitFor();
    assert.equal(await bloqueo(p2).evaluate((d) => d.scrollWidth - d.clientWidth), 0, "sin scroll de costado a 390 px");
    if (css) assert.deepEqual(await chicos(p2), [], "objetivos de 44 px a 390 px");
    await capturar(p2, "390-pin-viejo-desde-cambiar-de-usuario");
    // G8 (21/10): en el puesto de recepción el PIN de un dueño no se cambia (el servidor lo volvería atrás sin aviso):
    // se dice dónde hacerlo, no hay campos para el PIN nuevo y la pantalla queda bloqueada, sin «quedó guardado».
    await bloqueo(p2).getByText(/Cambialo desde el puesto del dueño/).waitFor();
    assert.equal(await bloqueo(p2).getByLabel("PIN nuevo (4 números)").count(), 0, "en recepción no se ofrece cambiar el PIN del dueño");
    await bloqueo(p2).getByRole("button", { name: "Entendido (queda bloqueada)" }).click();
    await bloqueo(p2).getByRole("heading", { name: "Pantalla bloqueada" }).waitFor();
    assert.equal(await p2.getByText(/Tu PIN nuevo quedó guardado/).count(), 0);
    assert.equal(await p2.evaluate((k) => (JSON.parse(localStorage.getItem(k) ?? "{}") as { estado?: { usuarios?: { id: string; pin: string }[] } }).estado?.usuarios?.find((u) => u.id === "u-rober")?.pin ?? "11", claveDeLaJornada("demo-club")), "11", "el PIN de Rober no cambió");
    assert.deepEqual(errores2, []);
    await otro.close();
  });
});
