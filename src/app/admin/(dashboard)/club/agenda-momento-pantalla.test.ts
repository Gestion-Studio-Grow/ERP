// ============================================================================
// LA AGENDA DE BREAK POINT en un navegador de verdad — Tanda 2C (bp-DISENO §2.2, §3.2, §3.16).
// ============================================================================
//
// ClubDemo REAL armado con esbuild y montado en el Chromium de Playwright, con el CSS de la app y la piel de la agenda
// de Break Point. La demo del club arma el día a las 19:10 (Martín Ríos terminó y debe la cancha; el de las 18:30 en la
// Cancha 3 no llegó; Agustina, que debe de antes, juega a las 21). Se prueba, clic por clic:
//   · el botón del momento: «Cobrar $X» → los 4 medios → la cancha paga → «Cerrar» · «La mesa sigue» → cerrar;
//     «No vino» abre la cuenta con la falta desplegada; el punto rojo de «debe» se ve en el bloque;
//   · «Buscar lugar»: hora + duración → la cancha que entra primero → tocarla abre el alta en esa cancha y hora;
//   · «Compartir lo libre»: el texto con los huecos, el precio y el link, y «Copiar el texto»;
//   · y los toques de 44 px (la chapa de 26 px a la vista, el área de toque con el `::after`).
// Sin Chromium o sin esbuild, los tests se saltean con el motivo.

import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Browser, Page } from "playwright";

const RAIZ = fileURLToPath(new URL("../../../../../", import.meta.url));
const ORIGEN = "http://localhost:3999/admin/club";

const ENTRADA = `
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import ClubDemo from "@/app/admin/(dashboard)/club/ClubDemo";
window.__montar = (negocio, usuario) =>
  createRoot(document.getElementById("root")).render(createElement(ClubDemo, { negocio, usuario, rol: "RECEPTION" }));
`;

type Ventana = { __montar: (negocio: string, usuario: string) => void };

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

describe("La agenda de Break Point en el navegador (Tanda 2C)", { timeout: 180_000 }, () => {
  let browser: Browser | null = null;
  let bundle = "";
  let css = "";
  let sinNavegador = "";
  const PIEL_AGENDA = readFileSync(join(RAIZ, "src", "app", "admin", "(dashboard)", "club", "piel", "agenda.css"), "utf8");

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
      loader: { ".css": "empty" }, // la piel entra por el CSS de la página, no por el paquete
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

  async function montar(): Promise<{ page: Page; errores: string[] }> {
    const page = await browser!.newPage({ viewport: { width: 1366, height: 900 }, locale: "es-AR" });
    await page.clock.install({ time: new Date(2026, 9, 17, 12, 0, 0) });
    const errores: string[] = [];
    page.on("pageerror", (e) => errores.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") errores.push(m.text());
    });
    const html = `<!doctype html><html lang="es" data-estetica="breakpoint"><head><style>${css}</style><style>${PIEL_AGENDA}</style></head><body class="bg-surface text-body"><main id="root" class="p-4"></main></body></html>`;
    await page.route(ORIGEN, (r) => r.fulfill({ contentType: "text/html; charset=utf-8", body: html }));
    await page.goto(ORIGEN);
    await page.addScriptTag({ content: bundle });
    await page.evaluate(() => (window as unknown as Ventana).__montar("demo-club", "u_recepcion"));
    await page.getByRole("heading", { name: "Agenda de canchas" }).waitFor();
    return { page, errores };
  }

  /** El bloque (`li`) de un turno, por el principio de su etiqueta. */
  const bloque = (page: Page, titular: RegExp) => page.locator("li").filter({ has: page.getByRole("button", { name: titular }) });

  test("botón del momento: «Cobrar $X» → medio → «Cerrar» · «La mesa sigue» → cerrar, sin abrir la hoja; toque de 44 px", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const { page, errores } = await montar();
    // El bloque por su id (la etiqueta cambia al cobrar: deja de decir «debe»).
    const id = await page.getByRole("button", { name: /^Martín Ríos, Cancha 1,.*En cancha, debe/ }).getAttribute("id");
    const martin = page.locator("li").filter({ has: page.locator(`[id="${id}"]`) });
    const cobrar = martin.getByRole("button", { name: /^Cobrar \$\s?[\d.]+ de la cancha de Martín Ríos$/ });
    await cobrar.waitFor();
    assert.match((await cobrar.textContent()) ?? "", /^Cobrar \$/);
    // A la vista una chapa chica; el área de toque llega a 44 px (el `::after` de la piel).
    const caja = (await cobrar.boundingBox())!;
    assert.ok(caja.height < 44, `la chapa mide ${caja.height} px a la vista`);
    const toque = await cobrar.evaluate((b) => {
      const a = getComputedStyle(b, "::after");
      return b.getBoundingClientRect().height - parseFloat(a.top) - parseFloat(a.bottom);
    });
    assert.ok(toque >= 44, `área de toque ${toque} px`);
    await cobrar.click();
    const menu = page.getByRole("menu", { name: /^Cobrar \$\s?[\d.]+: ¿cómo paga\?$/ });
    await menu.waitFor();
    assert.deepEqual(await menu.getByRole("menuitem").allTextContents(), ["Efectivo", "Mercado Pago (QR)", "Transferencia", "Débito / crédito", "Dividir o cobrar por jugador…"]);
    await menu.getByRole("menuitem", { name: "Mercado Pago (QR)" }).click();
    // Paga: «Cerrar» y «La mesa sigue», y la hoja nunca se abrió.
    await martin.getByRole("button", { name: "Cerrar la cancha de Martín Ríos", exact: true }).waitFor();
    await martin.getByRole("button", { name: /la mesa sigue en el buffet$/ }).waitFor();
    assert.equal(await page.locator('[data-ui="hoja-del-turno"]').count(), 0, "sin abrir la hoja");
    await martin.getByRole("button", { name: "Cerrar la cancha de Martín Ríos", exact: true }).click();
    await page.getByRole("button", { name: /^Martín Ríos, Cancha 1,.*Cancha cerrada/ }).waitFor();
    assert.equal(await bloque(page, /^Martín Ríos, Cancha 1/).locator("[data-momento]").count(), 0, "cerrada: sin botón del momento");
    assert.deepEqual(errores, []);
    await page.close();
  });

  test("«No vino» abre la cuenta con la falta desplegada; el punto rojo de «debe» en el bloque de quien debe de antes", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const { page, errores } = await montar();
    // Agustina debe de antes: su bloque lleva el punto rojo (en todos los bloques, no sólo los altos).
    await bloque(page, /^Agustina Romero, Cancha 4, de 21:00.*tiene saldo deudor/).locator("[data-turno-deuda]").waitFor();
    // El de las 18:30 en la Cancha 3 no llegó (van 40 min): «No vino».
    const noVino = page.getByRole("button", { name: /no vino: marcar la falta$/ });
    await noVino.first().click();
    const hoja = page.locator('[data-ui="hoja-del-turno"]');
    await hoja.waitFor();
    await hoja.locator('[data-cuenta="pie"] button[aria-expanded="true"]', { hasText: "No vino" }).waitFor();
    assert.deepEqual(errores, []);
    await page.close();
  });

  test("«Buscar lugar»: 21:00 · 90 → primero la cancha que entra a esa hora; tocarla abre el alta en esa cancha y hora", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const { page, errores } = await montar();
    const abrir = page.getByRole("button", { name: "Buscar lugar" });
    await abrir.click();
    assert.equal(await abrir.getAttribute("aria-expanded"), "true");
    const panel = page.getByRole("region", { name: "Buscar lugar" });
    await panel.getByLabel("Hora", { exact: true }).selectOption({ label: "21:00" });
    await panel.getByRole("group", { name: "Duración" }).getByRole("button", { name: "90 min" }).click();
    const chips = panel.getByRole("list", { name: "Dónde hay lugar" }).getByRole("button");
    await chips.first().waitFor();
    const primero = chips.first();
    assert.equal(await primero.getAttribute("data-lugar"), "entra", "la que entra a esa hora va primero");
    const texto = (await primero.textContent()) ?? "";
    assert.match(texto, /^Cancha \d · 21:00 · \$/);
    // Las que entran a la hora pedida, antes que las «cerca».
    const tipos = await chips.evaluateAll((bs) => bs.map((b) => b.getAttribute("data-lugar")));
    assert.deepEqual(tipos, [...tipos].sort((a, b) => Number(b === "entra") - Number(a === "entra")));
    await primero.click();
    const alta = page.getByRole("region", { name: "Dar un turno" });
    await alta.waitFor();
    const cancha = texto.match(/^Cancha (\d)/)![1];
    assert.equal(await alta.getByLabel("Cancha", { exact: true }).inputValue(), `c${cancha}`);
    assert.equal(await alta.getByLabel("Hora", { exact: true }).inputValue(), String(21 * 60));
    assert.equal(await page.getByRole("region", { name: "Buscar lugar" }).count(), 0, "el panel se cierra al elegir");
    assert.deepEqual(errores, []);
    await page.close();
  });

  test("«Compartir lo libre»: hoy · noche → el texto con huecos de 90, el precio y el link; Copiar avisa", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const { page, errores } = await montar();
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"], { origin: "http://localhost:3999" });
    await page.getByRole("button", { name: "Compartir lo libre" }).click();
    const panel = page.getByRole("region", { name: "Compartir lo libre" });
    assert.equal(await panel.getByRole("group", { name: "Qué día" }).getByRole("button", { name: "Hoy" }).getAttribute("aria-pressed"), "true");
    assert.equal(await panel.getByRole("group", { name: "Qué franja" }).getByRole("button", { name: "Noche" }).getAttribute("aria-pressed"), "true");
    const texto = (await panel.locator('[data-agenda="texto-libre"]').textContent()) ?? "";
    assert.match(texto, /^¡Hola! Esto es lo que nos queda libre en .+ hoy \(sáb 17\/10\) a la noche, turnos de 90 min:/);
    assert.match(texto, /• \d\d:\d\d · Cancha \d.* · (desde )?\$\s?[\d.]+/);
    assert.match(texto, /Reservalo desde acá: http:\/\/localhost:3999\/turnero\?modo=pedido/);
    const wa = panel.getByRole("link", { name: /^Abrir WhatsApp/ });
    assert.match((await wa.getAttribute("href")) ?? "", /^https:\/\/wa\.me\/\?text=/);
    await panel.getByRole("button", { name: "Copiar el texto" }).click();
    await panel.getByRole("status").filter({ hasText: /^(Copiado|No se pudo copiar)/ }).waitFor();
    // Mañana a la tarde: otro texto.
    await panel.getByRole("group", { name: "Qué día" }).getByRole("button", { name: "Mañana" }).click();
    await panel.getByRole("group", { name: "Qué franja" }).getByRole("button", { name: "Tarde" }).click();
    assert.match((await panel.locator('[data-agenda="texto-libre"]').textContent()) ?? "", /mañana \(dom 18\/10\) a la tarde/);
    assert.deepEqual(errores, []);
    await page.close();
  });
});
