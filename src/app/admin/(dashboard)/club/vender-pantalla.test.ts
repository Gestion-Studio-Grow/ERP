// ============================================================================
// «VENDER» (Tanda 2A) en un navegador de verdad — clic por clic, con el ClubDemo REAL (esbuild) y el CSS de la app.
// ============================================================================
//
//   · BP-040: desde la Agenda, la tecla V abre la hoja «Vender»; el lector (ráfaga de teclas + Enter) suma «Agua 500 ml
//     · $ 2.000» aunque el foco esté en un favorito, y el Enter del lector NO aprieta el botón enfocado.
//   · BP-041: $ 3.800, «Paga con 10.000» → «Vuelto $ 6.200»; «Efectivo» cobra de una y la caja del día sube $ 3.800.
//     Con menos de lo que sale, el aviso (role="alert") y «Efectivo» apagado.
//   · BP-042: la fila de 8 favoritos; tocar uno suma +1.
//   · BP-043: «Pasar a la cuenta de…» manda el consumo a una cuenta abierta: la caja no se mueve.
//   · Teclado y celular: Escape cierra y el foco vuelve a «Vender»; el carrito sobrevive a cerrar; a 390 px, con la
//     piel de Break Point, nada de menos de 44 px ni scroll de costado.
// El CSS de las pieles no entra al bundle: lo pone la página, como en la app. Sin Chromium o sin esbuild, se saltea.

import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Browser, Locator, Page } from "playwright";
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

const plata = (texto: string | null) => Number(String(texto ?? "").replace(/[^\d]/g, ""));

describe("Vender (hoja global, tecla V) en el navegador", { timeout: 180_000 }, () => {
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
    const club = join(RAIZ, "src", "app", "admin", "(dashboard)", "club", "piel");
    piel = ["armazon.css", "vender.css"].map((f) => readFileSync(join(club, f), "utf8")).join("\n");
    browser = await playwright.chromium.launch({ executablePath: chrome });
  });

  after(async () => {
    await browser?.close();
  });

  async function montar(viewport = { width: 1024, height: 768 }, conPiel = false): Promise<{ page: Page; errores: string[] }> {
    const page = await browser!.newPage({ viewport, locale: "es-AR" });
    const errores: string[] = [];
    page.on("pageerror", (e) => errores.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") errores.push(m.text());
    });
    const raiz = conPiel ? ' data-skin="fable" data-estetica="breakpoint"' : "";
    const html = `<!doctype html><html lang="es"${raiz}><head><style>${css}${conPiel ? piel : ""}</style></head><body class="bg-surface text-body"><main id="root" class="p-4"></main></body></html>`;
    await page.route(ORIGEN, (r) => r.fulfill({ contentType: "text/html; charset=utf-8", body: html }));
    await page.goto(ORIGEN);
    await page.addScriptTag({ content: bundle });
    await page.evaluate(() => (window as unknown as { __montar: () => void }).__montar());
    await page.getByRole("heading", { name: "Agenda de canchas" }).waitFor();
    return { page, errores };
  }

  /** «Ingresos» de la Caja del día, al costado de la agenda. */
  const ingresos = async (page: Page) => plata(await page.locator('[data-ui="caja-del-dia"] dd').nth(1).textContent());

  async function abrirConV(page: Page): Promise<Locator> {
    await page.locator("body").click({ position: { x: 2, y: 2 } });
    await page.keyboard.press("v");
    const hoja = page.getByRole("dialog", { name: "Vender" });
    await hoja.waitFor();
    return hoja;
  }

  /** Lo que hace un lector de barras: tipea el código de un tirón (~5 ms por tecla) y manda Enter. */
  async function pasarElLector(page: Page, codigo: string) {
    await page.keyboard.type(codigo, { delay: 5 });
    await page.keyboard.press("Enter");
  }

  test("BP-040 / BP-042 · V abre la hoja; 8 favoritos; el lector suma «Agua 500 ml · $ 2.000» con el foco en un favorito", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const { page, errores } = await montar();
    const hoja = await abrirConV(page);
    // El foco arranca en el buscador (el lector también escribe ahí).
    await page.waitForFunction(() => (document.activeElement as HTMLElement | null)?.closest("dialog") && document.activeElement?.tagName === "INPUT");
    assert.equal(await page.evaluate(() => (document.activeElement as HTMLInputElement).labels?.[0]?.textContent), "Buscar o pasar el lector");
    const favoritos = hoja.getByRole("list", { name: /^Favoritos/ }).getByRole("button");
    assert.equal(await favoritos.count(), 8, "la fila de 8 favoritos");
    await hoja.getByText(/Lector escuchando/).waitFor();

    // El foco en un favorito (sin tocarlo) y pasa el lector: suma el agua y el Enter NO aprieta el favorito.
    await favoritos.nth(3).focus();
    await pasarElLector(page, "7790000000028");
    const lineas = hoja.getByRole("list", { name: "Lo que lleva" }).getByRole("listitem");
    await lineas.first().waitFor();
    assert.equal(await lineas.count(), 1, "una sola línea: el Enter del lector no sumó el favorito enfocado");
    assert.match((await lineas.first().textContent()) ?? "", /Agua 500 ml.*1.*\$ 2\.000/);
    assert.equal(plata(await hoja.locator('[data-vender="total"]').textContent()), 2000);

    // Con el foco en el buscador, el lector escribe ahí y su Enter suma otra agua (por el código del club).
    await hoja.getByLabel("Buscar o pasar el lector").focus();
    await pasarElLector(page, "BP-002");
    await hoja.getByLabel("2 de Agua 500 ml").waitFor();
    assert.equal(plata(await hoja.locator('[data-vender="total"]').textContent()), 4000);

    // Un favorito tocado suma +1.
    const nombreFav = ((await favoritos.first().textContent()) ?? "").replace(/^Sumar /, "").replace(/\$.*$/, "").trim();
    await favoritos.first().click();
    await hoja.getByRole("button", { name: `Uno más de ${nombreFav}` }).waitFor();

    // Un código que no existe se dice adentro de la hoja (lo de atrás queda inerte).
    await favoritos.nth(2).focus();
    await pasarElLector(page, "0000000000000");
    await hoja.getByRole("alert").filter({ hasText: "El código 0000000000000 no está cargado" }).waitFor();
    assert.deepEqual(errores, []);
    await page.close();
  });

  test("BP-041 · $ 3.800 en efectivo, «Paga con 10.000» → vuelto $ 6.200; «Efectivo» cobra de una y la caja sube $ 3.800", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const { page, errores } = await montar();
    const antes = await ingresos(page);
    const hoja = await abrirConV(page);
    await hoja.getByLabel("Buscar o pasar el lector").fill("BP-004");
    await page.keyboard.press("Enter");
    assert.equal(plata(await hoja.locator('[data-vender="total"]').textContent()), 3800, "una cerveza");

    const pagaCon = hoja.getByLabel("Paga con (efectivo)");
    await pagaCon.fill("2.000");
    await hoja.getByRole("alert").filter({ hasText: "Con eso no alcanza: faltan $ 1.800." }).waitFor();
    const efectivo = hoja.getByRole("button", { name: "Cobrar $ 3.800 en Efectivo" });
    assert.equal(await efectivo.isDisabled(), true, "con menos de lo que sale, no se cobra en efectivo");

    await pagaCon.fill("10.000");
    await hoja.getByText("Vuelto $ 6.200").waitFor();
    assert.equal(await efectivo.isDisabled(), false);
    await efectivo.click();
    await hoja.getByRole("status").filter({ hasText: "Venta cobrada: $ 3.800 (Efectivo)." }).waitFor();
    await hoja.getByText("Última venta: $ 3.800 en Efectivo · vuelto $ 6.200.").waitFor();
    assert.equal(await hoja.getByRole("list", { name: "Lo que lleva" }).count(), 0, "el carrito queda vacío para el siguiente");

    // La venta siguiente no hereda nada: otra cerveza, MP de un toque.
    await hoja.getByLabel("Buscar o pasar el lector").fill("BP-004");
    await page.keyboard.press("Enter");
    assert.equal(await hoja.getByLabel("Paga con (efectivo)").inputValue(), "", "el «paga con» arranca vacío");
    await hoja.getByRole("button", { name: "Cobrar $ 3.800 en MP" }).click();
    await hoja.getByRole("status").filter({ hasText: /^Venta cobrada: \$ 3\.800 \(Mercado Pago/ }).waitFor();

    await page.keyboard.press("Escape");
    await hoja.waitFor({ state: "detached" });
    assert.equal((await ingresos(page)) - antes, 7600, "entraron las dos ventas a la caja del día, ni un peso más");
    assert.deepEqual(errores, []);
    await page.close();
  });

  test("BP-043 · «Pasar a la cuenta de…»: el consumo va a la cuenta abierta y no a la caja (con «Deshacer»)", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const { page, errores } = await montar();
    const antes = await ingresos(page);
    const hoja = await abrirConV(page);
    await hoja.getByLabel("Buscar o pasar el lector").fill("BP-002");
    await page.keyboard.press("Enter");
    await hoja.getByLabel("Buscar o pasar el lector").fill("BP-004");
    await page.keyboard.press("Enter");
    const boton = hoja.getByRole("button", { name: /^Pasar a la cuenta de/ });
    assert.equal(await boton.getAttribute("aria-expanded"), "false");
    await boton.click();
    assert.equal(await boton.getAttribute("aria-expanded"), "true");
    const cuentas = hoja.getByRole("list", { name: "Cuentas abiertas" }).getByRole("button");
    assert.ok((await cuentas.count()) >= 1, "la demo trae cuentas abiertas");
    const nombre = (await cuentas.first().innerText()).trim();
    assert.match(nombre, /^Pasar \$ 5\.800 a la cuenta de/, "el nombre del botón dice qué hace");
    const titular = (await cuentas.first().locator("span.truncate").innerText()).replace(/^Pasar \$ 5\.800 a la cuenta de/, "").trim();
    t.diagnostic(`a la cuenta de ${titular} («${nombre.replace(/\s+/g, " ")}»)`);
    await cuentas.first().click();
    await hoja.getByRole("status").filter({ hasText: `$ 5.800 a la cuenta de ${titular}` }).waitFor();
    await hoja.getByText(`Última venta: $ 5.800 a la cuenta de ${titular}.`).waitFor();
    await hoja.getByRole("button", { name: "Deshacer" }).waitFor();
    await page.keyboard.press("Escape");
    await hoja.waitFor({ state: "detached" });
    assert.equal(await ingresos(page), antes, "la caja del día no se movió");
    // En Buffet, la cuenta de esa persona ya tiene lo que se llevó.
    await irASolapa(page, "Buffet");
    await page.getByRole("article", { name: titular }).getByText(/Agua 500 ml/).first().waitFor();
    assert.deepEqual(errores, []);
    await page.close();
  });

  test("teclado: Escape cierra y el foco vuelve a «Vender»; el carrito sobrevive a cerrar la hoja", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const { page, errores } = await montar();
    const vender = page.getByRole("button", { name: /^Vender/ });
    assert.equal(await vender.getAttribute("aria-keyshortcuts"), "V");
    await vender.click();
    const hoja = page.getByRole("dialog", { name: "Vender" });
    await hoja.getByRole("list", { name: /^Favoritos/ }).getByRole("button").first().click();
    await page.keyboard.press("Escape");
    await hoja.waitFor({ state: "detached" });
    await page.waitForFunction(() => (document.activeElement as HTMLElement | null)?.dataset.casa === "vender");
    await vender.click();
    await hoja.getByRole("list", { name: "Lo que lleva" }).getByRole("listitem").first().waitFor();
    // ✕ saca la línea entera.
    const linea = hoja.getByRole("list", { name: "Lo que lleva" }).getByRole("listitem").first();
    await linea.getByRole("button", { name: /^Sacar / }).click();
    await hoja.getByText("Tocá un favorito o pasá el lector.").waitFor();
    // Con la hoja abierta, una «v» en el buscador es una letra (no reabre nada) y la N no da un turno.
    await hoja.getByLabel("Buscar o pasar el lector").fill("");
    await hoja.getByLabel("Buscar o pasar el lector").press("v");
    assert.equal(await hoja.getByLabel("Buscar o pasar el lector").inputValue(), "v");
    assert.deepEqual(errores, []);
    await page.close();
  });

  test("celular (390 px) con la piel de Break Point: la hoja de abajo sin objetivos de menos de 44 px ni scroll de costado", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    if (!css) return t.skip("no se pudo compilar el CSS de la app");
    const { page, errores } = await montar({ width: 390, height: 844 }, true);
    await page.getByRole("button", { name: /^Vender/ }).click();
    const hoja = page.getByRole("dialog", { name: "Vender" });
    await hoja.getByLabel("Buscar o pasar el lector").fill("BP-004");
    await page.keyboard.press("Enter");
    await hoja.getByLabel("Paga con (efectivo)").fill("5000");
    await hoja.getByText("Vuelto $ 1.200").waitFor();
    await hoja.getByRole("button", { name: /^Pasar a la cuenta de/ }).click();
    const medidas = await page.evaluate(() => {
      const d = document.querySelector("dialog[open]")!;
      const caja = d.getBoundingClientRect();
      const chicos = [...d.querySelectorAll("button, input")]
        .map((el) => ({ el, r: el.getBoundingClientRect() }))
        .filter(({ r }) => r.width > 0 && (r.height < 44 || r.width < 44))
        .map(({ el, r }) => `${(el.getAttribute("aria-label") ?? el.textContent ?? "").slice(0, 40)} (${Math.round(r.width)}×${Math.round(r.height)})`);
      const radio = getComputedStyle(d).borderTopLeftRadius;
      return { chicos, ancho: caja.width, sobra: d.scrollWidth - d.clientWidth, abajo: Math.round(window.innerHeight - caja.bottom), radio };
    });
    t.diagnostic(`hoja a 390 px: ${JSON.stringify(medidas)}`);
    assert.deepEqual(medidas.chicos, []);
    assert.ok(medidas.sobra <= 0, "sin scroll de costado en la hoja");
    assert.ok(medidas.ancho <= 390);
    assert.equal(medidas.abajo, 0, "es la hoja de abajo");
    assert.equal(medidas.radio, "3px", "radio de chapa (piel)");
    assert.ok((await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 0);
    assert.deepEqual(errores, []);
    await page.close();
  });

  test("PC (1366 px) con la piel: la hoja es un panel lateral a la derecha, de alto completo", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    if (!css) return t.skip("no se pudo compilar el CSS de la app");
    const { page, errores } = await montar({ width: 1366, height: 768 }, true);
    // Con «menos movimiento» la hoja aparece quieta en su lugar final (y se mide sin esperar la entrada).
    await page.emulateMedia({ reducedMotion: "reduce" });
    await abrirConV(page);
    const caja = await page.evaluate(() => {
      const r = document.querySelector("dialog[open]")!.getBoundingClientRect();
      return { derecha: Math.round(window.innerWidth - r.right), arriba: Math.round(r.top), alto: Math.round(r.height), ancho: Math.round(r.width) };
    });
    t.diagnostic(`hoja a 1366 px: ${JSON.stringify(caja)}`);
    assert.equal(caja.derecha, 0);
    assert.equal(caja.arriba, 0);
    assert.equal(caja.alto, 768);
    assert.ok(caja.ancho <= 560);
    assert.deepEqual(errores, []);
    await page.close();
  });
});
