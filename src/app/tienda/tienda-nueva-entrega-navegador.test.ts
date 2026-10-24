// ============================================================================
// LA VIDRIERA NUEVA («Diseño nuevo», TiendaNueva) CON LOS ENVÍOS DEL NEGOCIO, en un Chromium de verdad
// (reingeniería Magra 1I: el hueco que dejó 1H)
// ============================================================================
//
// Con «Diseño nuevo» prendido, Magra se vende por TiendaNueva y no por MagraFront: sin selector de
// zona, el envío a domicilio lo rechazaba `placeOnlineOrder`. Acá la vidriera REAL armada con esbuild
// (CSS de módulo con nombres locales, sin estilos), las Server Actions reemplazadas por dobles que
// guardan lo que se mandó, en la PC (la bolsa es el riel de la derecha):
//   · MG-032 con la zona: el envío y «te faltan $X», la franja que hace falta y lo que viaja al servidor;
//   · MG-034 bajo el mínimo: «Retiro en el local» a un toque;
//   · MG-036 tienda pausada: el mensaje del dueño y los botones frenados;
//   · sin Envíos guardados (Magra y la genérica): la bolsa de siempre, sin un campo de más.

import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Browser, Page } from "playwright";
import { CONFIG_MAGRA } from "./envio-de-la-tienda.fixture";

const RAIZ = fileURLToPath(new URL("../../../", import.meta.url));
const ORIGEN = "http://localhost:3995/tienda";

const ENTRADA = `
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import TiendaNueva from "@/app/tienda/vidriera/TiendaNueva";
import { getStorefrontCopy } from "@/tenants/storefront";
import { getRetailRubro } from "@/blueprints/retail/rubros";
window.__montar = (marca, extra) => {
  const magra = marca === "magra";
  const rubro = getRetailRubro(magra ? "carniceria" : "almacen") ?? getRetailRubro("carniceria");
  createRoot(document.getElementById("root")).render(
    createElement(TiendaNueva, {
      nombre: magra ? "MAGRA" : "Almacén Prueba",
      branding: { shortLabel: null, city: "Canning", addressLine: "Av. Ficticia 1234", hoursLabel: "Lun a Sáb 9–20h", whatsapp: "5491100000000", instagram: null, email: null, contactNote: null },
      wording: rubro.wording,
      copy: magra ? getStorefrontCopy("magra") : null,
      productos: window.__productos,
      tenantKey: marca + "-test",
      front: magra ? "magra" : null,
      brandId: magra ? "magra" : null,
      imagery: null,
      acento: "#7a2e2e",
      searchParams: {},
      ...extra,
    }),
  );
};
`;
// Las acciones: el alta guarda lo que viajó y contesta un rechazo (la bolsa queda y se puede mirar).
const ACCIONES_FALSAS = `
export async function placeOnlineOrder(_prev, fd) { window.__enviado = Object.fromEntries(fd.entries()); return { ok: false, error: "Doble de prueba: no se grabó." }; }
`;
const CUPONES_FALSOS = `export async function probarCuponEnPedido() { return { ok: false, error: "" }; }`;
const LINK_FALSO = `
import { createElement } from "react";
export default function Link({ href, children, prefetch, scroll, ...resto }) { return createElement("a", { href: String(href), ...resto }, children); }
`;
const IMAGEN_FALSA = `
import { createElement } from "react";
export default function Image({ src, alt, fill, priority, sizes, placeholder, blurDataURL, quality, ...resto }) { return createElement("img", { src: typeof src === "string" ? src : "", alt, ...resto }); }
`;
const DINAMICO_FALSO = `export default function dynamic() { return function Nada() { return null; }; }`;
const FALSOS: Record<string, string> = {
  acciones: ACCIONES_FALSAS,
  cupones: CUPONES_FALSOS,
  link: LINK_FALSO,
  imagen: IMAGEN_FALSA,
  dinamico: DINAMICO_FALSO,
};

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

/** La caja de $45.000 y un chorizo de $12.000 (los del test de la acción contra la base). */
const PRODUCTOS = [
  { id: "caja", name: "Caja parrillera", saleUnit: "UNIT", price: 45000, pricePerKg: null, unit: "u" },
  { id: "chorizo", name: "Chorizo", saleUnit: "UNIT", price: 12000, pricePerKg: null, unit: "u" },
];

type Ventana = { __montar: (marca: string, extra: Record<string, unknown>) => void; __productos: unknown; __enviado?: Record<string, string> };

describe("TiendaNueva con los envíos del negocio, en el navegador", { timeout: 180_000 }, () => {
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
      outdir: join(RAIZ, ".esbuild-tienda-nueva"),
      format: "iife",
      jsx: "automatic",
      tsconfig: join(RAIZ, "tsconfig.json"),
      define: { "process.env.NODE_ENV": '"production"' },
      loader: { ".css": "local-css" },
      logLevel: "silent",
      plugins: [
        {
          name: "falsos",
          setup(b) {
            b.onResolve({ filter: /^@\/lib\/order-actions$/ }, () => ({ path: "acciones", namespace: "falso" }));
            b.onResolve({ filter: /^@\/lib\/coupon-actions$/ }, () => ({ path: "cupones", namespace: "falso" }));
            b.onResolve({ filter: /^next\/link$/ }, () => ({ path: "link", namespace: "falso" }));
            b.onResolve({ filter: /^next\/image$/ }, () => ({ path: "imagen", namespace: "falso" }));
            b.onResolve({ filter: /^next\/dynamic$/ }, () => ({ path: "dinamico", namespace: "falso" }));
            b.onLoad({ filter: /.*/, namespace: "falso" }, (a) => ({ contents: FALSOS[a.path], loader: "js", resolveDir: RAIZ }));
          },
        },
      ],
    });
    bundle = r.outputFiles.find((f) => f.path.endsWith(".js"))!.text;
    browser = await playwright.chromium.launch({ executablePath: chrome });
  });

  after(async () => {
    await browser?.close();
  });

  async function montar(marca: "magra" | "generica", extra: Record<string, unknown>): Promise<{ page: Page; errores: string[] }> {
    const page = await browser!.newPage({ viewport: { width: 1440, height: 900 }, locale: "es-AR" });
    const errores: string[] = [];
    page.on("pageerror", (e) => errores.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") errores.push(m.text());
    });
    await page.route(/\/tenants\//, (r) => r.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg"/>' }));
    await page.route(ORIGEN, (r) =>
      r.fulfill({ contentType: "text/html; charset=utf-8", body: '<!doctype html><html lang="es"><body style="margin:0"><div id="root"></div></body></html>' }),
    );
    await page.goto(ORIGEN);
    await page.addScriptTag({ content: bundle });
    await page.evaluate(([productos, m, mas]) => {
      const w = window as unknown as Ventana;
      w.__productos = productos;
      w.__montar(m as string, mas as Record<string, unknown>);
    }, [PRODUCTOS, marca, extra] as const);
    await page.getByRole("button", { name: /Sumar .*Caja parrillera/ }).first().waitFor();
    return { page, errores };
  }

  /** Suma la caja ($45.000) o el chorizo ($12.000) y llena los datos de la clienta. */
  async function armarPedido(page: Page, producto: "Caja parrillera" | "Chorizo") {
    await page.getByRole("button", { name: new RegExp(`Sumar .*${producto}`) }).first().click();
    const bolsa = page.locator("#pedido");
    await bolsa.getByLabel("Nombre y apellido").fill("Ana UAT");
    await bolsa.getByLabel("Tu WhatsApp").fill("11 5555 1234");
    return bolsa;
  }

  const CON_ENVIOS = { entrega: CONFIG_MAGRA, hoy: "2026-10-22" };

  test("MG-032 · Magra con «Diseño nuevo»: elegir la zona suma su envío, dice cuánto falta para el gratis y la franja viaja al servidor", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const { page, errores } = await montar("magra", CON_ENVIOS);
    const bolsa = await armarPedido(page, "Caja parrillera");
    const enviar = bolsa.getByRole("button", { name: /^Enviar pedido/ });
    await bolsa.getByText("Elegí la zona", { exact: true }).waitFor();
    await bolsa.getByText("Elegí a qué zona va el envío.").waitFor();
    assert.equal(await enviar.isDisabled(), true, "sin zona no se manda (antes lo rechazaba el servidor)");

    await bolsa.getByLabel("Zona *").selectOption("barrios");
    await bolsa.getByText("Envío · Canning – barrios cerrados").waitFor();
    await bolsa.getByText(/Te faltan \$\s?15\.000 para el envío gratis/).waitFor();
    await bolsa.getByText("Elegí en qué franja te queda mejor.").waitFor();
    assert.equal(await enviar.isDisabled(), true, "con franjas, hay que elegir una");
    assert.match((await enviar.textContent()) ?? "", /49\.000/, "el total del botón ya suma el envío de la zona");

    await bolsa.getByText("L-S 17-19", { exact: true }).click();
    await bolsa.getByLabel("Día").selectOption("2026-10-23");
    await bolsa.getByLabel("Dirección").fill("Los Álamos 123");
    await page.waitForFunction(() => !(document.querySelector('#pedido button[value="tienda"]') as HTMLButtonElement | null)?.disabled);
    await enviar.click();
    await page.waitForFunction(() => Boolean((window as unknown as Ventana).__enviado));
    const enviado = await page.evaluate(() => (window as unknown as Ventana).__enviado!);
    assert.equal(enviado.fulfillment, "DELIVERY");
    assert.equal(enviado.envioZona, "barrios");
    assert.equal(enviado.franja, "L-S 17-19");
    assert.equal(enviado.dia, "2026-10-23");
    assert.equal(enviado.address, "Los Álamos 123");
    assert.equal("envioCosto" in enviado, false, "el costo no viaja: lo recalcula el servidor");
    assert.deepEqual(errores, []);
    await page.close();
  });

  test("MG-034 · bajo el mínimo de envío avisa cuánto falta y «Retiro en el local» lo resuelve en un toque", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const { page, errores } = await montar("magra", CON_ENVIOS);
    const bolsa = await armarPedido(page, "Chorizo");
    await bolsa.getByLabel("Zona *").selectOption("barrios");
    await bolsa.getByText(/El envío es para pedidos desde \$20\.000: te faltan \$8\.000/).waitFor();
    await bolsa.getByRole("button", { name: "Retiro en el local" }).click();
    assert.equal(await bolsa.getByRole("radio", { name: "Retiro en el local" }).isChecked(), true);
    await bolsa.getByText("Sin cargo", { exact: true }).waitFor();
    await bolsa.getByText("Retirás en Av. Ficticia 1234 · Lun a sáb 9–19").waitFor();
    assert.equal(await bolsa.getByRole("button", { name: /^Enviar pedido/ }).isDisabled(), false);
    assert.equal(await bolsa.getByLabel("Zona *").count(), 0, "en retiro no se pide zona");
    assert.deepEqual(errores, []);
    await page.close();
  });

  test("MG-036 · tienda pausada: se ve el mensaje del dueño y no se puede mandar", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const pausada = { ...CON_ENVIOS, entrega: { ...CONFIG_MAGRA, tiendaPausada: { mensaje: "Hoy no tomamos pedidos por la web" } } };
    const { page, errores } = await montar("magra", pausada);
    const bolsa = await armarPedido(page, "Chorizo");
    await bolsa.getByRole("status").filter({ hasText: "Hoy no tomamos pedidos por la web" }).waitFor();
    assert.equal(await bolsa.getByRole("button", { name: /^Enviar pedido/ }).isDisabled(), true);
    assert.equal(await bolsa.getByRole("button", { name: "Pedir por WhatsApp" }).isDisabled(), true);
    assert.deepEqual(errores, []);
    await page.close();
  });

  for (const marca of ["magra", "generica"] as const) {
    test(`sin Envíos guardados (${marca}): la bolsa de siempre, sin zona, franja ni freno`, async (t) => {
      if (sinNavegador) return t.skip(sinNavegador);
      const { page, errores } = await montar(marca, { entrega: null, hoy: "2026-10-22" });
      const bolsa = await armarPedido(page, "Caja parrillera");
      await bolsa.getByRole("radio", { name: "Envío a domicilio" }).check();
      await bolsa.getByLabel("Dirección").fill("Los Álamos 123");
      assert.equal(await bolsa.locator('select[name="envioZona"], input[name="franja"], select[name="dia"]').count(), 0);
      assert.equal(await bolsa.locator("[data-ui='freno-de-entrega'], [data-ui='entrega-de-la-bolsa']").count(), 0);
      assert.equal(await bolsa.getByRole("radio", { name: "Retiro en el local" }).count(), 1, "el retiro sigue");
      assert.equal(await bolsa.getByRole("button", { name: /^Enviar pedido/ }).isDisabled(), false);
      assert.deepEqual(errores, []);
      await page.close();
    });
  }
});
