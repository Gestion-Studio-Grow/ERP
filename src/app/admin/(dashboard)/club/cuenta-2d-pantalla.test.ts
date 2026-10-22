// ============================================================================
// TANDA 2D en un navegador de verdad — clic por clic: la cancha ocupada, la mesa sigue dividido, la mesa en Buffet y
// el WhatsApp de la falta.
// ============================================================================
//
// El mismo armado que cuenta-y-buffet-pantalla.test.ts (ClubDemo REAL con esbuild y el CSS real de la app), sobre la
// demo de las 19:10 (Martín Ríos en la Cancha 1 debiendo $ 21.000; Lucas Fernández llega a las 20:30):
//   · BP-070/072 · la cuenta de Lucas dice «Cancha 1 sigue ocupada por Martín Ríos», no ofrece «Abrir la cancha», y un
//     toque cobra a Martín, la cierra (su mesa sigue) y abre la de Lucas;
//   · BP-074/075 · la mesa de Martín vive en Buffet con sus 4: dos platos a Sofía, se le cobra lo suyo y se cierra la
//     mesa sin salir de Buffet;
//   · BP-073 · «La mesa sigue · dividido»: cada uno elige su medio (nada viene elegido), un toque cobra a los tres y
//     suelta la cancha (a 390 px, 44 px y sin scroll de costado);
//   · BP-056 · «No vino»: la hoja queda con «Avisar por WhatsApp» y el texto lleva lo que le quedó en su cuenta.
// Sin Chromium o sin esbuild, se saltea con el motivo.

import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Browser, Page } from "playwright";
import { irASolapa } from "./solapas-e2e";

const RAIZ = fileURLToPath(new URL("../../../../../", import.meta.url));
const ORIGEN = "http://localhost:3997/admin/club";

const ENTRADA = `
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import ClubDemo from "@/app/admin/(dashboard)/club/ClubDemo";
window.__montar = () =>
  createRoot(document.getElementById("root")).render(createElement(ClubDemo, { negocio: "demo-club", usuario: "u_recepcion", rol: "RECEPTION" }));
`;

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

/** Lo tocable de menos de 44 px dentro de `raiz` (el ::after de `data-tactil="compacto"` cuenta). */
function chicosEn(page: Page, raiz: string) {
  return page.evaluate((sel) => {
    const r0 = document.querySelector(sel);
    if (!r0) return ["no está " + sel];
    return [...r0.querySelectorAll("button, select, summary, a, input:not([type=radio]):not([type=checkbox]), label:has(input[type=radio]), label:has(input[type=checkbox])")]
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter(({ r }) => r.width > 0 && (r.height < 44 || r.width < 44))
      .map(({ el, r }) => `${(el.getAttribute("aria-label") ?? el.textContent ?? "").slice(0, 40)} (${Math.round(r.width)}×${Math.round(r.height)})`);
  }, raiz);
}

describe("Tanda 2D en el navegador", { timeout: 180_000 }, () => {
  let browser: Browser | null = null;
  let bundle = "";
  let css = "";
  let piel = "";
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
      loader: { ".css": "empty" }, // la piel (piel/*.css) entra por el CSS de la página, no por el paquete
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
    const dir = join(RAIZ, "src", "app", "admin", "(dashboard)", "club", "piel");
    piel = ["buffet.css", "cuenta.css"].map((f) => readFileSync(join(dir, f), "utf8")).join("\n");
    browser = await playwright.chromium.launch({ executablePath: chrome });
  });

  after(async () => {
    await browser?.close();
  });

  async function montar(viewport = { width: 1024, height: 768 }): Promise<{ page: Page; errores: string[] }> {
    const page = await browser!.newPage({ viewport, locale: "es-AR" });
    const errores: string[] = [];
    page.on("pageerror", (e) => errores.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") errores.push(m.text());
    });
    const html = `<!doctype html><html lang="es" data-skin="fable" data-estetica="breakpoint"><head><style>${css}${piel}</style></head><body class="bg-surface text-body"><main id="root" class="p-4"></main></body></html>`;
    await page.route(ORIGEN, (r) => r.fulfill({ contentType: "text/html; charset=utf-8", body: html }));
    await page.goto(ORIGEN);
    await page.addScriptTag({ content: bundle });
    await page.evaluate(() => (window as unknown as { __montar: () => void }).__montar());
    await page.getByRole("heading", { name: "Agenda de canchas" }).waitFor();
    return { page, errores };
  }

  const aviso = (page: Page, texto: string | RegExp) => page.getByRole("status").filter({ hasText: texto }).waitFor();
  /** Los medios son radios nativos tapados (sr-only): se toca su etiqueta, como la persona. */
  const elegir = (grupo: ReturnType<Page["locator"]>, medio: string) => grupo.locator(`label:has(input[value="${medio}"])`).click();

  test("BP-070/072 + BP-074/075 · «Cerrar la de Martín y abrir» de un toque; su mesa sigue en Buffet con los 4, se carga y se cobra sin salir de Buffet", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const { page, errores } = await montar();
    await page.getByRole("button", { name: /^Lucas Fernández, Cancha 1, de 20:30/ }).click();
    const cuenta = page.getByRole("region", { name: "Lucas Fernández", exact: true });
    await cuenta.waitFor();
    const ocupada = cuenta.getByRole("region", { name: "Cancha 1 sigue ocupada por Martín Ríos (17:30)" });
    await ocupada.waitFor();
    assert.equal(await cuenta.getByRole("button", { name: "Abrir la cancha", exact: true }).count(), 0, "no ofrece «Abrir la cancha» (diría «sigue ocupada»)");
    await ocupada.getByLabel(/^Se quedan a comer: la mesa de Martín Ríos sigue en Buffet$/).check({ force: true });
    await ocupada.getByRole("button", { name: "Martín Ríos paga $ 21.000 en Efectivo y se abre la de Lucas Fernández" }).click();
    await aviso(page, /^Cerrada la de Martín Ríos \(cobrados \$ 21\.000 en Efectivo\)\. Su mesa sigue en Buffet\. Cancha abierta para Lucas Fernández y luz prendida\.$/);
    await cuenta.getByText(/Cancha 1 · 20:30–22:00 · .* · En cancha/).waitFor();
    assert.equal(await cuenta.getByRole("region", { name: /sigue ocupada/ }).count(), 0);

    // Buffet: la mesa de Martín con sus 4 comensales; dos platos a Sofía y se le cobra lo suyo, sin cambiar de solapa.
    await irASolapa(page, "Buffet");
    const mesas = page.getByRole("region", { name: "Mesas que siguen cargando" });
    const mesa = mesas.getByRole("article", { name: "Mesa de Martín Ríos" });
    await mesa.waitFor();
    assert.equal(await mesa.getByRole("list", { name: "Comensales de la mesa de martín ríos" }).getByRole("listitem").count(), 4);
    assert.equal(await page.getByRole("region", { name: "Cuentas abiertas" }).getByRole("article", { name: "Martín Ríos" }).count(), 0, "su cuenta va dentro de la mesa, no repetida abajo");
    await mesa.getByRole("radio", { name: "Sofía Gómez" }).check({ force: true });
    const plato = mesa.getByRole("group", { name: "Sumarle un plato a Sofía Gómez" }).getByRole("button").first();
    await plato.click();
    await aviso(page, /a la cuenta de Sofía Gómez\.$/);
    await plato.click();
    await mesa.getByText(/^2 × /).waitFor();
    const cobrar = mesa.getByRole("button", { name: /^Sofía Gómez paga \$ [\d.]+ en Efectivo$/ });
    await cobrar.click();
    await aviso(page, /^Cobrado \$ [\d.]+ a Sofía Gómez/);
    await mesas.waitFor();
    assert.equal(await page.getByRole("heading", { name: "Agenda de canchas" }).isVisible(), false, "no salió de Buffet");
    assert.equal(await mesa.getByRole("button", { name: /^Sofía Gómez paga/ }).count(), 0, "Sofía quedó al día");

    // Cobrar todo y cerrar la mesa: sale de Buffet.
    await mesa.getByRole("button", { name: /^Cobrar todo \$ [\d.]+ y cerrar la mesa en Mercado Pago/ }).click();
    await aviso(page, /^Cargos cerrados: cobrados/);
    await mesas.getByText(/^Ninguna:/).waitFor();
    assert.deepEqual(errores, []);
    await page.close();
  });

  test("BP-073 · «La mesa sigue · dividido» a 390 px: cada uno con su medio (nada elegido de entrada), un toque cobra a los tres y suelta la cancha; 44 px, sin scroll de costado", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    if (!css) return t.skip("no se pudo compilar el CSS de la app");
    const { page, errores } = await montar({ width: 390, height: 844 });
    await page.getByRole("button", { name: /^Martín Ríos, Cancha 1,.*En cancha, debe/ }).click();
    const cuenta = page.getByRole("region", { name: "Martín Ríos", exact: true });
    await cuenta.getByRole("button", { name: "La mesa sigue · dividido" }).click();
    const panel = cuenta.getByRole("region", { name: "La mesa sigue · cada uno paga su parte de la cancha" });
    await panel.waitFor();
    const cobrar = panel.getByRole("button", { name: "Cobrar $ 21.000 a cada uno y cerrar · la mesa sigue" });
    assert.equal(await cobrar.isDisabled(), true, "hasta que cada uno elija su medio");
    assert.equal(await panel.getByRole("radio", { checked: true }).count(), 0, "ningún medio viene elegido");
    assert.deepEqual(await chicosEn(page, '[data-cuenta="dividido"]'), []);
    assert.ok((await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 0);
    await elegir(panel.getByRole("group", { name: "Sofía Gómez · $ 7.000" }), "mercadopago");
    await elegir(panel.getByRole("group", { name: "Tomás Medina · $ 7.000" }), "efectivo");
    assert.equal(await cobrar.isDisabled(), true, "falta Lucía");
    // Teclado: con el foco en el primer medio de Lucía, la flecha elige el siguiente (radios nativos).
    const lucia = panel.getByRole("group", { name: "Lucía Torres · $ 7.000" });
    await lucia.getByRole("radio", { name: "Efectivo" }).focus();
    await page.keyboard.press("ArrowRight");
    assert.equal(await lucia.getByRole("radio", { name: /^Mercado Pago/ }).isChecked(), true);
    await elegir(lucia, "transferencia");
    await cobrar.click();
    await aviso(page, /^Cancha cerrada y libre \(cobrados \$ 21\.000: Efectivo \$ 7\.000 · Mercado Pago .*\$ 7\.000 · Transferencia \$ 7\.000\)\. La mesa sigue en Buffet con sus 4\.$/);
    await cuenta.getByText("Cancha cerrada · la mesa sigue").waitFor();
    // La mesa en Buffet a 390 px: todo lo tocable de 44 px y sin scroll de costado.
    await irASolapa(page, "Buffet");
    await page.getByRole("article", { name: "Mesa de Martín Ríos" }).waitFor();
    assert.deepEqual(await chicosEn(page, '[data-buffet="mesa"]'), []);
    assert.ok((await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 0);
    assert.deepEqual(errores, []);
    await page.close();
  });

  test("BP-056 · «No vino»: la hoja no se cierra y queda «Avisar por WhatsApp» con lo que le quedó en su cuenta", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const { page, errores } = await montar();
    await page.getByRole("button", { name: /^Camila Sosa, Cancha 3/ }).click();
    const cuenta = page.getByRole("region", { name: "Camila Sosa", exact: true });
    await cuenta.getByRole("button", { name: "No vino" }).click();
    // Recepción no ve «Sin cargo» (lo decide un dueño con su PIN).
    assert.equal(await cuenta.getByText("Sin cargo (decide el dueño)").count(), 0);
    await cuenta.getByRole("button", { name: "Marcar que no vino" }).click();
    await aviso(page, /^Falta de Camila Sosa: /);
    const falta = page.getByRole("group", { name: "Falta marcada: avisale a Camila Sosa" });
    await falta.waitFor();
    await falta.getByText(/te quedó \$\s21\.000 en tu cuenta/).waitFor();
    const wa = falta.getByRole("link", { name: "Avisar por WhatsApp a Camila Sosa lo que le quedó por la falta" });
    const href = (await wa.getAttribute("href")) ?? "";
    assert.match(decodeURIComponent(href), /te quedó \$\s21\.000 en tu cuenta/);
    assert.deepEqual(errores, []);
    await page.close();
  });
});
