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
//   · nunca se ve un PIN; objetivos táctiles de 44 px en el bloqueo; 390 y 1024 px.
// Con CAPTURAS_BLOQUEO=<carpeta> deja capturas. Sin Chromium o sin esbuild, se saltea con el motivo.

import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Browser, BrowserContext, Page } from "playwright";
import * as M from "@/lib/club/motor.mjs";
import { claveDeLaJornada, textoDeLaDemo, textoDelEstado } from "./almacen";
import { claveDeIntentosDelBloqueo } from "./bloqueo-core";

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

  async function abrir(contexto: BrowserContext, errores: string[], reloj: "real" | "demo", rol = "RECEPTION", sembrar = false): Promise<Page> {
    const p = await contexto.newPage();
    p.on("pageerror", (e) => errores.push(e.message));
    p.on("console", (m) => {
      if (m.type() === "error") errores.push(m.text());
    });
    await p.goto(ORIGEN);
    if (sembrar) {
      // Una jornada ya cargada en este equipo (la demo del día, con sus usuarios y sus PIN).
      const guardado = textoDeLaDemo(textoDelEstado(M.generarDemo("2026-10-17")), "2026-10-17", 1);
      await p.evaluate(([k, v]) => localStorage.setItem(k, v), [claveDeLaJornada("demo-club"), guardado]);
    }
    await montarEn(p, reloj, rol);
    return p;
  }
  async function montarEn(p: Page, reloj: "real" | "demo", rol: string) {
    await p.addScriptTag({ content: bundle });
    await p.evaluate(([r, ro]) => (window as unknown as Ventana).__montar("demo-club", "u_x", ro, r), [reloj, rol]);
    await p.getByRole("heading", { name: "Agenda de canchas" }).waitFor();
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
    assert.equal(
      await page.evaluate(() => {
        const tab = document.querySelector('[role="tab"]')!.getBoundingClientRect();
        const arriba = document.elementFromPoint(tab.x + tab.width / 2, tab.y + tab.height / 2);
        return !!arriba?.closest('dialog[data-ui="bloqueo-del-club"]');
      }),
      true,
      "lo de atrás no se puede tocar",
    );
    await page.keyboard.press("Escape");
    assert.equal(await bloqueo(page).evaluate((d) => (d as HTMLDialogElement).open), true, "Escape no la cierra");
    await page.keyboard.press("Tab");
    assert.equal(await page.evaluate(() => !!document.activeElement?.closest('dialog[data-ui="bloqueo-del-club"]')), true, "el foco queda adentro");

    // Nadie estaba (recarga): se elige quién entra. Sin PINs a la vista.
    const quien = bloqueo(page).getByRole("group", { name: "¿Quién entra?" });
    await quien.waitFor();
    assert.equal(await quien.getByRole("button").count(), 4);
    await sinPines(page, 'dialog[data-ui="bloqueo-del-club"]');
    assert.deepEqual(await chicos(page), [], "objetivos de 44 px");
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
    assert.ok(await page.evaluate((k) => localStorage.getItem(k), claveDeIntentosDelBloqueo(undefined)), "los intentos quedan en el equipo");

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
    assert.equal(await page.evaluate((k) => localStorage.getItem(k), claveDeIntentosDelBloqueo(undefined)), null, "un PIN bueno limpia los intentos");
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
});
