// ============================================================================
// LA BOLSA DE MAGRA EN UN NAVEGADOR DE VERDAD (UAT MAGRA 16/10)
// ============================================================================
//
// La vidriera REAL (MagraFront.tsx) armada con esbuild y montada en Chromium, con su CSS propio
// (va adentro del componente). Las Server Actions se reemplazan por dobles: lo que se prueba es
// la pantalla después de tocar «+», que en el HTML del servidor no existe (la bolsa es estado del
// navegador). A 390 px (el celular del reporte) y a 1440 px:
//
//   · la mini-barra fija ya no tapa «Pedir por WhatsApp», el último botón de la página;
//   · con un corte por kilo, el total dice «Total estimado» y la aclaración del rubro;
//   · la grilla dice la cantidad con unidad y coma («0,25 kg»), no «0.25».

import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Browser, Page } from "playwright";
import { getRetailRubro } from "@/blueprints/retail/rubros";

const RAIZ = fileURLToPath(new URL("../../../", import.meta.url));
const ORIGEN = "http://localhost:3998/tienda";
const NOTA = getRetailRubro("carniceria")?.wording.weightNote ?? "";

const ENTRADA = `
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import MagraFront from "@/app/tienda/MagraFront";
window.__montar = (props) => createRoot(document.getElementById("root")).render(createElement(MagraFront, props));
`;
const ACCIONES_FALSAS = `export async function placeOnlineOrder() { return { ok: false, error: "" }; }`;
const CUPONES_FALSOS = `export async function probarCuponEnPedido() { return { ok: false, error: "" }; }`;
const LINK_FALSO = `
import { createElement } from "react";
export default function Link({ href, children, prefetch, ...resto }) { return createElement("a", { href, ...resto }, children); }
`;

function rutaDeChromium(porDefecto: () => string): string | null {
  try {
    const p = porDefecto();
    if (existsSync(p)) return p;
  } catch {
    // sin el de Playwright: se busca en la carpeta de navegadores
  }
  const dir = process.env.PLAYWRIGHT_BROWSERS_PATH ?? "/opt/pw-browsers";
  if (existsSync(join(dir, "chromium"))) return join(dir, "chromium");
  if (!existsSync(dir)) return null;
  for (const n of readdirSync(dir).filter((x) => /^chromium-\d+$/.test(x)).sort().reverse()) {
    for (const sub of ["chrome-linux64", "chrome-linux"]) {
      const p = join(dir, n, sub, "chrome");
      if (existsSync(p)) return p;
    }
  }
  return null;
}

/** Los cortes: tres por kilo y uno por unidad (los dos primeros van a los bloques grandes). */
const CORTES = [
  { id: "c1", name: "Ojo de bife", saleUnit: "WEIGHT", price: null, pricePerKg: 31900, unit: "kg" },
  { id: "c2", name: "Vacío", saleUnit: "WEIGHT", price: null, pricePerKg: 21900, unit: "kg" },
  { id: "c3", name: "Entraña", saleUnit: "WEIGHT", price: null, pricePerKg: 27900, unit: "kg" },
  { id: "c4", name: "Chorizo (paquete)", saleUnit: "UNIT", price: 6900, pricePerKg: null, unit: "u" },
];
const LOCAL = { addressLine: "Av. Ficticia 1234", city: "Canning", hoursLabel: "Lun a Sáb 9–20h", whatsapp: "5491100000000", instagram: null, email: null };

describe("La bolsa de MAGRA en el navegador", { timeout: 120_000 }, () => {
  let browser: Browser | null = null;
  let bundle = "";
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
      plugins: [
        {
          name: "falsos",
          setup(b) {
            b.onResolve({ filter: /^@\/lib\/order-actions$/ }, () => ({ path: "acciones", namespace: "falso" }));
            b.onResolve({ filter: /^@\/lib\/coupon-actions$/ }, () => ({ path: "cupones", namespace: "falso" }));
            b.onResolve({ filter: /^next\/link$/ }, () => ({ path: "link", namespace: "falso" }));
            b.onLoad({ filter: /.*/, namespace: "falso" }, (a) => ({
              contents: a.path === "acciones" ? ACCIONES_FALSAS : a.path === "cupones" ? CUPONES_FALSOS : LINK_FALSO,
              loader: "js",
              resolveDir: RAIZ,
            }));
          },
        },
      ],
    });
    bundle = r.outputFiles[0].text;
    browser = await playwright.chromium.launch({ executablePath: chrome });
  });

  after(async () => {
    await browser?.close();
  });

  async function montar(ancho: number, notaDePeso: string | null = NOTA): Promise<{ page: Page; errores: string[] }> {
    const page = await browser!.newPage({ viewport: { width: ancho, height: ancho < 600 ? 844 : 900 }, locale: "es-AR" });
    const errores: string[] = [];
    page.on("pageerror", (e) => errores.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") errores.push(m.text());
    });
    // Las fotos de los cortes (/tenants/magra/…): una imagen vacía, para que la página no pida afuera.
    await page.route(/\/tenants\//, (r) => r.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg"/>' }));
    await page.route(ORIGEN, (r) =>
      r.fulfill({ contentType: "text/html; charset=utf-8", body: '<!doctype html><html lang="es"><body style="margin:0"><div id="root"></div></body></html>' }),
    );
    await page.goto(ORIGEN);
    await page.addScriptTag({ content: bundle });
    await page.evaluate(
      ([products, branding, nota]) =>
        (window as unknown as { __montar: (p: unknown) => void }).__montar({ products, branding, tenantKey: "magra", notaDePeso: nota }),
      [CORTES, LOCAL, notaDePeso] as const,
    );
    await page.getByRole("button", { name: "Agregar Entraña" }).first().waitFor();
    return { page, errores };
  }

  test("390 px: con la bolsa llena, la mini-barra no tapa «Pedir por WhatsApp» al final de la página", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const { page, errores } = await montar(390);
    await page.getByRole("button", { name: "Agregar Entraña" }).first().click();
    const barra = page.locator(".mf-minibar");
    await barra.waitFor();
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const wa = page.locator(".mf-rail-wa");
    const [b, w] = await Promise.all([barra.boundingBox(), wa.boundingBox()]);
    assert.ok(b && w);
    assert.ok(w.y + w.height <= b.y, `«Pedir por WhatsApp» termina en ${w.y + w.height} y la barra empieza en ${b.y}: lo tapa`);
    // Y se puede tocar: el centro del botón es el botón, no la barra.
    const arriba = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest(".mf-rail-wa") !== null, [w.x + w.width / 2, w.y + w.height / 2]);
    assert.equal(arriba, true, "el toque en el centro de «Pedir por WhatsApp» cae en el botón");
    assert.deepEqual(errores, []);
    await page.close();
  });

  test("con un corte por kilo el total dice «Total estimado» y la aclaración del rubro; sólo por unidad, «Total»", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    assert.ok(NOTA.length > 0, "el rubro carnicería tiene su aclaración de peso");
    const { page, errores } = await montar(1440);
    await page.getByRole("button", { name: "Agregar Chorizo (paquete)" }).first().click();
    const rail = page.locator("#pedido");
    await rail.getByText("Total", { exact: true }).waitFor();
    assert.equal(await rail.getByText(NOTA).count(), 0, "sin nada por kilo, no hay nada que ajustar");
    await page.getByRole("button", { name: "Agregar Entraña" }).first().click();
    await rail.getByText("Total estimado", { exact: true }).waitFor();
    await rail.getByText(NOTA).waitFor();
    assert.equal(await page.locator(".mf-minibar").isVisible(), false, "en la PC no hay mini-barra");
    assert.deepEqual(errores, []);
    await page.close();
  });

  test("la grilla dice la cantidad con unidad y coma: «0,25 kg» por kilo, «1 u» por unidad", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const { page, errores } = await montar(390);
    await page.getByRole("group", { name: "Cantidad de Entraña" }).first().getByRole("button", { name: "Agregar Entraña" }).click();
    await page.getByRole("group", { name: "Cantidad de Chorizo (paquete)" }).first().getByRole("button", { name: "Agregar Chorizo (paquete)" }).click();
    const grilla = page.locator(".mf-grid");
    await grilla.getByText("0,25 kg", { exact: true }).waitFor();
    await grilla.getByText("1 u", { exact: true }).waitFor();
    assert.equal(await grilla.getByText("0.25").count(), 0);
    assert.deepEqual(errores, []);
    await page.close();
  });
});
