// ============================================================================
// LA BOLSA DE MAGRA EN UN NAVEGADOR DE VERDAD (UAT MAGRA 16/10)
// ============================================================================
//
// La vidriera REAL (magra/MagraPiel.tsx: el CSS y la parte del navegador que sirve MagraFront.tsx,
// sin las letras de next/font) armada con esbuild y montada en Chromium. Las Server Actions se
// reemplazan por dobles: lo que se prueba es la pantalla después de tocar «+», que en el HTML del
// servidor no existe (la bolsa es estado del navegador). A 390 px (el celular del reporte) y a 1440 px:
//
//   · la barra de la bolsa está siempre abajo y abre la hoja con el pedido; nada queda tapado;
//   · con un corte por kilo, el total dice «Total estimado» y la aclaración del rubro;
//   · la carta dice la cantidad con unidad y coma («0,25 kg»), no «0.25»;
//   · «¿Para cuántos comen?» carga los kilos de la estimación de la casa;
//   · un WhatsApp de relleno («0000 0000») no se ofrece en ningún lado.

import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Browser, Page } from "playwright";
import { getRetailRubro } from "@/blueprints/retail/rubros";
import { CONFIG_MAGRA } from "./envio-de-la-tienda.fixture";

const RAIZ = fileURLToPath(new URL("../../../", import.meta.url));
const ORIGEN = "http://localhost:3998/tienda";
const NOTA = getRetailRubro("carniceria")?.wording.weightNote ?? "";

const ENTRADA = `
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import MagraFront from "@/app/tienda/magra/MagraPiel";
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
// El WhatsApp relevado de Canning (magra-content.ts, MAGRA_CANNING_LOCALIZACION): uno de verdad, para
// que la vía «whatsapp» exista. El de relleno («0000 0000») se prueba aparte: no se ofrece.
const LOCAL = { addressLine: "Av. Ficticia 1234", city: "Canning", hoursLabel: "Lun a Sáb 9–20h", whatsapp: "5491161354042", instagram: null, email: null };
const RELLENO = "5491100000000";

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

  async function montar(
    ancho: number,
    notaDePeso: string | null = NOTA,
    extra: Record<string, unknown> = {},
    local: Record<string, unknown> = LOCAL,
  ): Promise<{ page: Page; errores: string[] }> {
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
      ([products, branding, nota, mas]) =>
        (window as unknown as { __montar: (p: unknown) => void }).__montar({ products, branding, tenantKey: "magra", notaDePeso: nota, ...mas }),
      [CORTES, local, notaDePeso, extra] as const,
    );
    await page.getByRole("button", { name: "Agregar Entraña" }).first().waitFor();
    return { page, errores };
  }

  test("390 px: la barra de la bolsa está siempre, abre la hoja con el pedido y no tapa el pie", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const { page, errores } = await montar(390);
    const barra = page.locator(".mg-barra");
    await barra.getByText("Mi bolsa · 0").waitFor();
    assert.equal(await page.locator("#pedido").isVisible(), false, "en el celular la bolsa no se apila debajo del pie");
    await page.getByRole("button", { name: "Agregar Entraña" }).first().click();
    await barra.getByText("1 corte").waitFor();
    // Un toque en la barra: la hoja con el formulario, por encima de todo (top layer).
    await barra.getByRole("button").click();
    const hoja = page.locator("#pedido");
    await hoja.waitFor();
    assert.equal(await hoja.evaluate((d) => d.matches(":modal")), true, "la hoja es un <dialog> modal");
    const wa = hoja.getByRole("button", { name: "Pedir por WhatsApp" });
    await wa.scrollIntoViewIfNeeded();
    const w = await wa.boundingBox();
    assert.ok(w);
    const arriba = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest(".mg-bolsa-wa") !== null, [w.x + w.width / 2, w.y + w.height / 2]);
    assert.equal(arriba, true, "el toque en el centro de «Pedir por WhatsApp» cae en el botón");
    await hoja.getByRole("button", { name: "Cerrar mi bolsa" }).click();
    // Al final de la página, el pie (la línea legal) termina por encima de la barra.
    // Instantáneo: la vidriera tiene `scroll-behavior: smooth` y hay que medir al llegar, no durante el viaje.
    await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }));
    const [b, legal] = await Promise.all([barra.boundingBox(), page.locator(".mg-pie-legal").boundingBox()]);
    assert.ok(b && legal);
    assert.ok(legal.y + legal.height <= b.y, `el pie termina en ${legal.y + legal.height} y la barra empieza en ${b.y}: lo tapa`);
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
    assert.equal(await page.locator(".mg-barra").isVisible(), false, "en la PC no hay barra: la bolsa es el riel");
    assert.deepEqual(errores, []);
    await page.close();
  });

  test("la carta dice la cantidad con unidad y coma: «0,25 kg» por kilo, «1 u» por unidad", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const { page, errores } = await montar(390);
    await page.getByRole("group", { name: "Cantidad de Entraña" }).first().getByRole("button", { name: "Agregar Entraña" }).click();
    await page.getByRole("group", { name: "Cantidad de Chorizo (paquete)" }).first().getByRole("button", { name: "Agregar Chorizo (paquete)" }).click();
    const grilla = page.locator(".mg-carta");
    await grilla.getByText("0,25 kg", { exact: true }).waitFor();
    await grilla.getByText("1 u", { exact: true }).waitFor();
    assert.equal(await grilla.getByText("0.25").count(), 0);
    assert.deepEqual(errores, []);
    await page.close();
  });

  // ── ENVÍOS DEL NEGOCIO (reingeniería Magra 1H): zona, «te faltan $X», mínimo, franja y pausa ──
  const CON_ENVIOS = { entrega: CONFIG_MAGRA, hoy: "2026-10-22" };

  test("MG-032 · con zonas: elegir la zona suma su envío y dice cuánto falta para el gratis; sin franja no se manda", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const { page, errores } = await montar(1440, NOTA, CON_ENVIOS);
    const rail = page.locator("#pedido");
    for (let i = 0; i < 4; i++) await page.getByRole("button", { name: "Agregar Ojo de bife" }).first().click(); // 1 kg · $31.900
    const enviar = rail.getByRole("button", { name: "Enviar pedido" });
    await rail.getByText("Elegí la zona", { exact: true }).waitFor();
    await rail.getByText("Elegí a qué zona va el envío.").waitFor();
    assert.equal(await enviar.isDisabled(), true, "sin zona no se manda");

    await rail.getByLabel("Zona *").selectOption("barrios");
    await rail.getByText("Envío · Canning – barrios cerrados").waitFor();
    await rail.getByText(/Te faltan \$\s?28\.100 para el envío gratis/).waitFor();
    await rail.getByText(/\$\s?35\.900,00/).waitFor(); // 31.900 + 4.000
    await rail.getByText("Elegí en qué franja te queda mejor.").waitFor();
    assert.equal(await enviar.isDisabled(), true, "con franjas, hay que elegir una");

    await rail.getByText("L-S 17-19", { exact: true }).click();
    await page.waitForFunction(() => !(document.querySelector('#pedido button[value="tienda"]') as HTMLButtonElement | null)?.disabled);
    assert.equal(await rail.locator('select[name="dia"]').inputValue(), "2026-10-22");
    assert.deepEqual(errores, []);
    await page.close();
  });

  test("MG-034 · bajo el mínimo de envío avisa cuánto falta y «Retiro en el local» lo resuelve en un toque", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const { page, errores } = await montar(390, NOTA, CON_ENVIOS);
    const rail = page.locator("#pedido");
    await page.getByRole("button", { name: "Agregar Chorizo (paquete)" }).first().click(); // $6.900
    await page.locator(".mg-barra").getByRole("button").click(); // en el celular, la bolsa es la hoja
    await rail.getByLabel("Zona *").selectOption("barrios");
    await rail.getByText(/El envío es para pedidos desde \$20\.000: te faltan \$13\.100/).waitFor();
    await rail.getByRole("button", { name: "Retiro en el local" }).click();
    await rail.getByText("Sin cargo", { exact: true }).waitFor();
    assert.equal(await rail.getByLabel("Entrega").inputValue(), "PICKUP");
    assert.equal(await rail.getByRole("button", { name: "Enviar pedido" }).isDisabled(), false);
    assert.deepEqual(errores, []);
    await page.close();
  });

  test("MG-036 · tienda pausada: se ve el mensaje del dueño y no se puede mandar", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const pausada = { ...CON_ENVIOS, entrega: { ...CONFIG_MAGRA, tiendaPausada: { mensaje: "Hoy no tomamos pedidos por la web" } } };
    const { page, errores } = await montar(1440, NOTA, pausada);
    await page.getByRole("status").filter({ hasText: "Hoy no tomamos pedidos por la web" }).first().waitFor();
    await page.getByRole("button", { name: "Agregar Chorizo (paquete)" }).first().click();
    const rail = page.locator("#pedido");
    assert.equal(await rail.getByRole("button", { name: "Enviar pedido" }).isDisabled(), true);
    assert.equal(await rail.getByRole("button", { name: "Pedir por WhatsApp" }).isDisabled(), true);
    assert.deepEqual(errores, []);
    await page.close();
  });

  test("ficha: «¿Para cuántos comen?» 4 → 1,5 kg, y «Agregar a mi bolsa» lo deja en el riel con el total estimado", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const { page, errores } = await montar(1440);
    await page.locator(".mg-eti-abrir", { hasText: "Ojo de bife" }).click();
    const ficha = page.locator("dialog.mg-ficha");
    await ficha.getByRole("heading", { name: "Ojo de bife" }).waitFor();
    await ficha.getByText("¿Para cuántos comen?").waitFor();
    await ficha.getByLabel("4", { exact: true }).check();
    await ficha.getByText("1,5 kg", { exact: true }).waitFor();
    await ficha.getByRole("button", { name: "Agregar a mi bolsa" }).click();
    await page.waitForFunction(() => !(document.querySelector("dialog.mg-ficha") as HTMLDialogElement).open);
    const rail = page.locator("#pedido");
    await rail.getByText("Total estimado", { exact: true }).waitFor();
    await rail.getByText(/\$\s?47\.850,00/).first().waitFor(); // 1,5 kg × $31.900
    assert.deepEqual(errores, []);
    await page.close();
  });

  test("con el WhatsApp de relleno («0000 0000») no hay botón ni línea de WhatsApp: el pedido sólo va por la tienda", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const { page, errores } = await montar(1440, NOTA, {}, { ...LOCAL, whatsapp: RELLENO });
    await page.getByRole("button", { name: "Agregar Entraña" }).first().click();
    await page.locator("#pedido").getByRole("button", { name: "Enviar pedido" }).waitFor();
    assert.equal(await page.getByText(/WhatsApp\s*\+?54/).count(), 0, "ningún número a la vista");
    assert.equal(await page.getByRole("button", { name: /Pedir por WhatsApp/ }).count(), 0, "ningún botón de WhatsApp");
    assert.equal(await page.locator('a[href^="https://wa.me/"]').count(), 0, "ningún link a wa.me");
    assert.deepEqual(errores, []);
    await page.close();
  });
});
