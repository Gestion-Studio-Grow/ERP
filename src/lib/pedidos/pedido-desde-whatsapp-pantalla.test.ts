// ============================================================================
// «NUEVO PEDIDO DE WHATSAPP» en un navegador de verdad (Magra, tanda 2 · 2B · MG-051…MG-053)
// ============================================================================
//
// El componente REAL (vender/PedidoDesdeWhatsApp.tsx) armado con esbuild y montado en Chromium,
// con las Server Actions reemplazadas por dobles que anotan lo que viaja. Lo que se prueba es la
// pantalla: que NADA viaje al servidor hasta confirmar cada renglón, qué manda `createOrder`
// cuando se registra, el WhatsApp de «te anotamos» con lo que devolvió el servidor y su constancia,
// el «a ajustar al pesar» del pedido por importe, y el faltante a futuro que avisa sin frenar.
// Los toques del caso de Ana se cuentan: desde la bandeja son 6.

import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Browser, Page } from "playwright";
import { sumarDias } from "./interpretar-whatsapp";

const RAIZ = fileURLToPath(new URL("../../../", import.meta.url));
const ORIGEN = "http://localhost:3998/admin/vender";
const HOY = "2026-10-22";

const ACCIONES_FALSAS = `
export async function createOrder(fd) {
  const o = {};
  for (const k of new Set(fd.keys())) o[k] = fd.getAll(k).map(String);
  window.__envios.push(o);
  const r = window.__respuesta;
  return typeof r === "function" ? r(o) : r;
}`;
const CLIENTES_FALSOS = `
export async function buscarClientesParaVenta(t) {
  window.__busquedas.push(t);
  return t === "1155551234" ? [{ id: "cli-ana", nombre: "Ana Pérez", telefono: "11 5555-1234", docTipo: null, docNro: null, razonSocial: null, condicionIva: null, coincide: "telefono" }] : [];
}`;
const CONSTANCIA_FALSA = `export async function registrarConfirmacionDeWhatsApp(id) { window.__constancias.push(id); }`;
const LINK_FALSO = `
import { createElement } from "react";
export default function Link({ href, prefetch, scroll, ...resto }) { return createElement("a", { href: String(href), ...resto }); }`;

const ENTRADA = `
import { createElement as h } from "react";
import { createRoot } from "react-dom/client";
import PedidoDesdeWhatsApp from "@/app/admin/(dashboard)/vender/PedidoDesdeWhatsApp";
window.__envios = [];
window.__busquedas = [];
window.__constancias = [];
window.__montar = (props) => createRoot(document.getElementById("root")).render(h(PedidoDesdeWhatsApp, props));
`;

const PRODUCTOS = [
  { id: "vacio", name: "Vacío", saleUnit: "WEIGHT", price: null, pricePerKg: 28600 },
  { id: "chorizo", name: "Chorizo", saleUnit: "UNIT", price: 1900, pricePerKg: null },
  { id: "picada", name: "Picada", saleUnit: "WEIGHT", price: null, pricePerKg: 9800 },
];
const PROPS = {
  productos: PRODUCTOS,
  stockById: { vacio: { stock: 0.8, trackStock: true }, chorizo: { stock: 50, trackStock: true } },
  hoy: HOY,
  negocio: "Magra",
  envios: null,
  boutique: true,
};

type Ventana = {
  __montar(p: unknown): void;
  __envios: Record<string, string[]>[];
  __busquedas: string[];
  __constancias: string[];
  __respuesta: unknown;
};

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

describe("Nuevo pedido de WhatsApp en el navegador", { timeout: 120_000 }, () => {
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
    const falsos: Record<string, string> = { acciones: ACCIONES_FALSAS, clientes: CLIENTES_FALSOS, constancia: CONSTANCIA_FALSA, link: LINK_FALSO };
    const r = await esbuild.build({
      stdin: { contents: ENTRADA, loader: "tsx", resolveDir: RAIZ },
      bundle: true,
      write: false,
      format: "iife",
      jsx: "automatic",
      tsconfig: join(RAIZ, "tsconfig.json"),
      define: { "process.env.NODE_ENV": '"production"' },
      logLevel: "silent",
      loader: { ".css": "empty" },
      plugins: [
        {
          name: "falsos",
          setup(b) {
            b.onResolve({ filter: /^@\/lib\/order-actions$/ }, () => ({ path: "acciones", namespace: "falso" }));
            b.onResolve({ filter: /^@\/lib\/clientes\/buscar-para-venta$/ }, () => ({ path: "clientes", namespace: "falso" }));
            b.onResolve({ filter: /acciones-pedido-whatsapp$/ }, () => ({ path: "constancia", namespace: "falso" }));
            b.onResolve({ filter: /^next\/link$/ }, () => ({ path: "link", namespace: "falso" }));
            b.onLoad({ filter: /.*/, namespace: "falso" }, (a) => ({ contents: falsos[a.path], loader: "js", resolveDir: RAIZ }));
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

  async function montar(hash = "#whatsapp", props: Record<string, unknown> = {}): Promise<{ page: Page; errores: string[] }> {
    const page = await browser!.newPage({ viewport: { width: 390, height: 844 }, locale: "es-AR" });
    const errores: string[] = [];
    page.on("pageerror", (e) => errores.push(e.message));
    await page.route(`${ORIGEN}*`, (r) => r.fulfill({ contentType: "text/html; charset=utf-8", body: '<!doctype html><html lang="es"><body><div id="root"></div></body></html>' }));
    await page.goto(`${ORIGEN}${hash}`);
    await page.addScriptTag({ content: bundle });
    await page.evaluate((p) => (window as unknown as Ventana).__montar(p), { ...PROPS, ...props });
    return { page, errores };
  }
  const envios = (page: Page) => page.evaluate(() => (window as unknown as Ventana).__envios);

  test("MG-051/053: el chat de Ana — nada viaja hasta confirmar cada renglón; registrar manda createOrder y «Confirmar por WhatsApp» deja constancia", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const { page, errores } = await montar();
    const manana = sumarDias(HOY, 1);
    await page.evaluate(
      (dia) =>
        ((window as unknown as Ventana).__respuesta = {
          ok: true,
          venta: {
            id: "o-128",
            code: 128,
            creada: `${dia}T12:00:00.000Z`,
            lineas: [
              { nombre: "Vacío", cantidad: 2, porPeso: true, precio: 28600, total: 57200, aMano: false },
              { nombre: "Chorizo", cantidad: 6, porPeso: false, precio: 1900, total: 11400, aMano: false },
            ],
            subtotal: 68600,
            descuento: 0,
            total: 68600,
            medio: null,
            cliente: "Ana Pérez",
            telefono: "11 5555-1234",
            anulada: false,
          },
        }),
      manana,
    );
    let toques = 1; // «Nuevo pedido de WhatsApp» en la bandeja (llega con #whatsapp y se abre solo)

    // Abierto por el #, con el foco en el cuadro para pegar.
    const cuadro = page.getByLabel("Pegá el mensaje de la clienta");
    await cuadro.waitFor();
    assert.equal(await cuadro.evaluate((el) => el === document.activeElement), true, "el foco va al cuadro");
    await cuadro.fill("hola, soy Ana 11 5555-1234, para mañana a la tarde 2 kg de vacío y 6 chorizos");
    toques++; // pegar

    // La propuesta: teléfono, nombre, ficha, dos renglones, la franja elegida.
    assert.equal(await page.getByLabel("Teléfono").inputValue(), "11 5555-1234");
    assert.equal(await page.getByLabel("Nombre").inputValue(), "Ana");
    await page.getByText("ya tiene ficha").waitFor();
    assert.match((await page.getByRole("status").filter({ hasText: "ficha" }).textContent()) ?? "", /Es Ana Pérez/);
    const renglones = page.locator("li").filter({ has: page.getByLabel("Producto") });
    assert.equal(await renglones.count(), 2);
    assert.equal(await page.getByRole("button", { name: /Mañana tarde/ }).getAttribute("aria-pressed"), "true");

    // MG-051: nada se registra sin confirmar. «Registrar» está apagado y dice qué falta.
    const registrar = page.getByRole("button", { name: "Registrar pedido" });
    assert.equal(await registrar.isDisabled(), true);
    await page.getByText("Confirmá los 2 renglones que faltan.").waitFor();
    await page.getByRole("button", { name: "Está bien" }).first().click();
    toques++;
    await page.getByText("Confirmá el renglón que falta.").waitFor();
    assert.equal(await registrar.isDisabled(), true);
    assert.deepEqual(await envios(page), [], "nada viajó al servidor");
    await page.getByRole("button", { name: "Está bien" }).first().click();
    toques++;
    assert.equal(await registrar.isDisabled(), false);
    await registrar.click();
    toques++;

    // Lo que viaja: el alta de siempre, ONLINE, sin cobrar, con la ficha, la franja y la clave.
    await page.getByRole("heading", { name: "Pedido #128 anotado" }).waitFor();
    const [e, ...otros] = await envios(page);
    assert.equal(otros.length, 0);
    assert.deepEqual(e.channel, ["ONLINE"]);
    assert.deepEqual(e.fulfillment, ["PICKUP"]);
    assert.deepEqual(e.productId, ["vacio", "chorizo"]);
    assert.deepEqual(e.quantity, ["2", "6"]);
    assert.deepEqual(e.scheduledFor, [`${manana}T17:00`]);
    assert.deepEqual(e.clientId, ["cli-ana"]);
    assert.deepEqual(e.customerName, ["Ana"]);
    assert.deepEqual(e.conTicket, ["1"]);
    assert.ok(e.idempotencyKey?.[0], "lleva clave de idempotencia");
    assert.equal(e.paid, undefined, "no se cobra");
    assert.match(e.notes[0], /^Pedido por WhatsApp · Franja: Mañana tarde \(17 a 20 h\)$/);

    // MG-053: el WhatsApp con lo que devolvió el servidor, y la constancia al tocarlo.
    const wa = page.getByRole("link", { name: "Confirmar por WhatsApp" });
    const href = (await wa.getAttribute("href")) ?? "";
    assert.ok(href.startsWith("https://wa.me/5491155551234?text="), href);
    const texto = decodeURIComponent(href.split("?text=")[1]);
    assert.equal(
      texto,
      "¡Hola Ana! Te anotamos para mañana tarde (17 a 20 h) (para retirar en el local): 2 kg de Vacío y 6 Chorizo. Total estimado $68.600: lo ajustamos cuando lo pesamos. Tu pedido es el #128. ¡Gracias! — Magra",
    );
    await wa.evaluate((a) => {
      a.removeAttribute("target");
      a.addEventListener("click", (ev) => ev.preventDefault());
    });
    await wa.click();
    toques++;
    await page.getByRole("link", { name: "Confirmar por WhatsApp de nuevo" }).waitFor();
    assert.deepEqual(await page.evaluate(() => (window as unknown as Ventana).__constancias), ["o-128"]);
    assert.ok(toques <= 6, `pedido de WhatsApp en ${toques} toques`);
    assert.deepEqual(errores, []);
    await page.close();
  });

  test("MG-052: «$15.000 de picada» queda a ajustar al pesar con el total estimado; corregir un renglón lo vuelve a pedir confirmar", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const { page, errores } = await montar();
    await page.getByLabel("Pegá el mensaje de la clienta").fill("11 4000-7919 para mañana a la mañana $15.000 de picada");
    await page.getByText("A ajustar al pesar · pidió $15.000").waitFor();
    assert.equal(await page.getByLabel("Kilos").inputValue(), "1,531");
    await page.getByText("$15.003,80").first().waitFor();
    await page.getByRole("button", { name: "Está bien" }).click();
    await page.getByText("✓ Confirmado").waitFor();
    // Cambiar la cantidad saca la confirmación: no se graba algo que no se miró.
    await page.getByLabel("Kilos").fill("1,6");
    assert.equal(await page.getByRole("button", { name: "Registrar pedido" }).isDisabled(), true);
    await page.getByText("Confirmá el renglón que falta.").waitFor();
    assert.deepEqual(errores, []);
    await page.close();
  });

  test("faltante: para mañana avisa y deja confirmar; para hoy frena el renglón con su motivo", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    let { page } = await montar();
    await page.getByLabel("Pegá el mensaje de la clienta").fill("para mañana a la tarde 2 kg de vacío");
    await page.getByText("Hoy quedan 0,8 kg de Vacío. Como es para otro día, se anota igual: acordate de envasar.").waitFor();
    assert.equal(await page.getByRole("button", { name: "Está bien" }).isDisabled(), false);
    await page.close();

    ({ page } = await montar());
    await page.getByLabel("Pegá el mensaje de la clienta").fill("2 kg de vacío");
    // Sin franja todavía: es para hoy, no alcanza y el renglón no se puede confirmar.
    await page.getByRole("alert").filter({ hasText: "Quedan 0,8 kg de Vacío: no alcanza para hoy" }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Está bien" }).isDisabled(), true);
    // Elegir mañana lo pasa a aviso; volver a hoy (a las 23) lo vuelve a frenar.
    await page.getByRole("button", { name: /Mañana tarde/ }).click();
    await page.getByRole("status").filter({ hasText: "se anota igual" }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Está bien" }).isDisabled(), false);
    await page.getByLabel("Otro día y hora").fill(`${HOY}T23:00`);
    await page.getByRole("alert").filter({ hasText: "no alcanza para hoy" }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Está bien" }).isDisabled(), true);
    await page.close();
  });

  test("sin el # el bloque arranca cerrado, con su tecla; «Cerrar» lo vuelve a cerrar", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const { page } = await montar("");
    const tecla = page.getByRole("button", { name: "Nuevo pedido de WhatsApp" });
    await tecla.waitFor();
    assert.equal(await page.getByLabel("Pegá el mensaje de la clienta").count(), 0);
    await tecla.click();
    await page.getByLabel("Pegá el mensaje de la clienta").waitFor();
    await page.getByRole("button", { name: "Cerrar" }).click();
    await tecla.waitFor();
    await page.close();
  });
});
