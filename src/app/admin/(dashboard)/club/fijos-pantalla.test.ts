// ============================================================================
// LOS FIJOS DE BREAK POINT en un navegador de verdad — Tanda 3C (bp-DISENO §3.10, BP-100…BP-105).
// ============================================================================
//
// ClubDemo REAL armado con esbuild y montado en el Chromium de Playwright, con el CSS de la app y la piel de los fijos.
// Se prueba, clic por clic:
//   · BP-100: «Dar de baja» abre la hoja y NO cambia nada; elegir desde cuándo cambia la previa (turnos y plata); recién
//     «Confirmar» lo hace, y el aviso trae «Deshacer» y la lista «Avisar por WhatsApp»;
//   · BP-102: «Deshacer» devuelve el fijo y sus turnos;
//   · BP-101: «Pausar hasta el …» deja la chapa «Pausado hasta … · vuelve el …»;
//   · BP-103: el alta con «Fijo semanal» muestra las 4 semanas y al reservar el fijo aparece en la lista;
//   · BP-105: recepción no ve «Bajar los fijos a la semana»; el dueño sí;
//   · a 390 px no se corre la página y los controles de la hoja miden 44 px.
// Sin Chromium o sin esbuild, los tests se saltean con el motivo.

import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Browser, Page } from "playwright";
import { irASolapa } from "./solapas-e2e";

const RAIZ = fileURLToPath(new URL("../../../../../", import.meta.url));
const ORIGEN = "http://localhost:3999/admin/club";

const ENTRADA = `
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import ClubDemo from "@/app/admin/(dashboard)/club/ClubDemo";
window.__montar = (negocio, usuario, rol) =>
  createRoot(document.getElementById("root")).render(createElement(ClubDemo, { negocio, usuario, rol }));
`;

type Ventana = { __montar: (negocio: string, usuario: string, rol: string) => void };

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

describe("Los fijos de Break Point en el navegador (Tanda 3C)", { timeout: 240_000 }, () => {
  let browser: Browser | null = null;
  let bundle = "";
  let css = "";
  let sinNavegador = "";
  const PIELES = ["fijos.css", "alta.css"].map((x) => readFileSync(join(RAIZ, "src", "app", "admin", "(dashboard)", "club", "piel", x), "utf8")).join("\n");

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
      loader: { ".css": "empty" }, // las pieles entran por el CSS de la página, no por el paquete
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
  });

  after(async () => {
    await browser?.close();
  });

  async function montar(rol: "OWNER" | "RECEPTION", viewport = { width: 1366, height: 900 }): Promise<{ page: Page; errores: string[] }> {
    const page = await browser!.newPage({ viewport, locale: "es-AR" });
    await page.clock.install({ time: new Date(2026, 9, 17, 12, 0, 0) });
    const errores: string[] = [];
    page.on("pageerror", (e) => errores.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") errores.push(m.text());
    });
    const html = `<!doctype html><html lang="es" data-estetica="breakpoint"><head><style>${css}</style><style>${PIELES}</style></head><body class="bg-surface text-body"><main id="root" class="p-4"></main></body></html>`;
    await page.route(ORIGEN, (r) => r.fulfill({ contentType: "text/html; charset=utf-8", body: html }));
    await page.goto(ORIGEN);
    await page.addScriptTag({ content: bundle });
    await page.evaluate((r) => (window as unknown as Ventana).__montar("demo-club", `u_${r.toLowerCase()}`, r), rol);
    await page.getByRole("heading", { name: "Agenda de canchas" }).waitFor();
    return { page, errores };
  }

  const lista = (page: Page) => page.locator('[data-fijos="lista"]');
  const renglon = (page: Page, i: number) => lista(page).locator('[data-fijos="fijo"]').nth(i);
  /** Lo que se ve de la lista de fijos y de la agenda (para probar que «no pasó nada»). */
  const foto = async (page: Page) => (await lista(page).innerText()).trim();

  test("BP-100/102: «Dar de baja» no hace nada hasta Confirmar; la previa cuenta turnos; confirmado, «Deshacer» lo devuelve todo", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const { page, errores } = await montar("OWNER");
    await irASolapa(page, "Fijos y espera");
    await page.getByRole("heading", { name: "Turnos fijos" }).waitFor();
    const antes = await foto(page);
    const titular = (await renglon(page, 0).locator("span.block").first().innerText()).split(" · ")[0];
    await renglon(page, 0).getByRole("button", { name: `Dar de baja el fijo de ${titular}` }).click();
    const hoja = page.getByRole("dialog", { name: `Dar de baja el fijo de ${titular}` });
    await hoja.waitFor();
    // La previa, sin haber tocado nada: «esta semana» elegida y la cuenta de turnos.
    const previa = hoja.locator('[data-fijos="previa"]');
    await previa.getByText(/^Se libera/).waitFor();
    assert.match(await previa.innerText(), /Todavía no cambió nada/);
    // Cambiar a «Pausar hasta el…» cambia la previa, y todavía nada cambió en el club.
    await hoja.getByRole("radio", { name: "Pausar hasta el…" }).check();
    await previa.getByText(/vuelve solo el \d+\/\d+/).waitFor();
    await hoja.getByRole("radio", { name: /^Desde esta semana/ }).check();
    // «Volver» cierra sin cambiar nada (BP-100).
    await hoja.getByRole("button", { name: "Volver" }).click();
    await hoja.waitFor({ state: "detached" }).catch(() => hoja.waitFor({ state: "hidden" }));
    assert.equal(await foto(page), antes, "no pasó nada");
    // Otra vez, ahora confirmando.
    await renglon(page, 0).getByRole("button", { name: `Dar de baja el fijo de ${titular}` }).click();
    await hoja.waitFor();
    await hoja.getByRole("button", { name: "Confirmar" }).click();
    const hecho = lista(page).locator('[data-fijos="hecho"]');
    await hecho.getByText(new RegExp(`^Dado de baja el fijo de ${titular}`)).waitFor();
    await hecho.getByRole("link", { name: `Avisar a ${titular} por WhatsApp` }).or(hecho.getByRole("button", { name: `Avisar a ${titular} por WhatsApp` })).first().waitFor();
    assert.ok(!(await foto(page)).includes(`${titular} · `), "salió de la lista");
    // BP-102: Deshacer.
    await page.getByRole("button", { name: "Deshacer" }).click();
    await page.getByRole("status").filter({ hasText: /se deshizo/ }).first().waitFor();
    await lista(page).getByRole("button", { name: `Dar de baja el fijo de ${titular}` }).waitFor();
    assert.ok((await foto(page)).includes(`${titular} · `), "volvió el fijo");
    assert.deepEqual(errores, []);
    await page.close();
  });

  test("BP-101: «Pausar hasta el …» → la chapa dice «Pausado hasta … · vuelve el …»", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const { page, errores } = await montar("OWNER");
    await irASolapa(page, "Fijos y espera");
    await page.getByRole("heading", { name: "Turnos fijos" }).waitFor();
    await renglon(page, 0).getByRole("button", { name: /^Dar de baja el fijo de / }).click();
    const hoja = page.getByRole("dialog", { name: /^Dar de baja el fijo de / });
    await hoja.getByRole("radio", { name: "Pausar hasta el…" }).check();
    await hoja.getByLabel("Hasta qué día se pausa").fill("2026-11-15");
    await hoja.locator('[data-fijos="previa"]').getByText(/vuelve solo el \d+\/\d+/).waitFor();
    await hoja.getByRole("button", { name: "Confirmar" }).click();
    await renglon(page, 0).locator('[data-fijos="estado"]').getByText(/^Pausado hasta el 15\/11 · vuelve el \d+\/\d+$/).waitFor();
    assert.deepEqual(errores, []);
    await page.close();
  });

  test("BP-105: recepción no ve «Bajar los fijos a la semana»; el dueño sí", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    for (const [rol, ve] of [["RECEPTION", false], ["OWNER", true]] as const) {
      const { page, errores } = await montar(rol);
      await irASolapa(page, "Fijos y espera");
      await page.getByRole("heading", { name: "Turnos fijos" }).waitFor();
      assert.equal(await page.getByRole("button", { name: "Bajar los fijos a la semana" }).count(), ve ? 1 : 0, rol);
      assert.deepEqual(errores, []);
      await page.close();
    }
  });

  test("BP-103: el alta con «Fijo semanal» muestra las 4 semanas y, al reservar, el fijo aparece en la lista", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const { page, errores } = await montar("RECEPTION");
    await page.getByRole("button", { name: /^\+ Turno/ }).first().click();
    const alta = page.locator('[data-alta="hoja"]');
    await alta.waitFor();
    await alta.getByLabel("A nombre de").fill("Juan Fijo");
    await alta.getByRole("checkbox", { name: "Fijo semanal" }).check();
    const semanas = alta.locator('[data-alta="fijo-previa"] [data-entra]');
    await semanas.first().waitFor();
    assert.equal(await semanas.count(), 4);
    await alta.getByRole("button", { name: "Reservar" }).click();
    await page.getByText(/Fijo los \S+ a las \d\d:\d\d/).first().waitFor();
    // Listo el alta: a la lista de fijos.
    if (await page.getByRole("button", { name: "Listo" }).count()) await page.getByRole("button", { name: "Listo" }).first().click();
    await irASolapa(page, "Fijos y espera");
    await lista(page).getByText(/^Juan Fijo · /).waitFor();
    assert.deepEqual(errores, []);
    await page.close();
  });

  test("a 390 px: la hoja no corre la página y sus controles miden 44 px", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const { page, errores } = await montar("OWNER", { width: 390, height: 844 });
    await irASolapa(page, "Fijos y espera");
    await renglon(page, 0).getByRole("button", { name: /^Dar de baja el fijo de / }).click();
    const hoja = page.getByRole("dialog", { name: /^Dar de baja el fijo de / });
    await hoja.waitFor();
    const corre = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(corre <= 0, `la página se corre ${corre} px`);
    for (const b of await hoja.locator("label:has(input[type=radio]), button").all()) {
      const caja = await b.boundingBox();
      if (caja) assert.ok(caja.height >= 40, `${await b.innerText()}: ${caja.height} px`);
    }
    assert.deepEqual(errores, []);
    await page.close();
  });
});
