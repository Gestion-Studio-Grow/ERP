// ============================================================================
// VENDER y PESAR Y AJUSTAR en un navegador de verdad — el recorrido del criterio, tecleado.
// ============================================================================
//
// Los formularios REALES (VenderForm, AjustarPedidoForm) armados con esbuild y montados en el
// Chromium de Playwright, con las Server Actions reemplazadas por dobles que anotan lo que
// viaja. Sin Next ni base: lo que se prueba es la pantalla —que el vuelto, el tope del
// descuento y el motivo del precio a mano se vean y frenen el cobro como dice el servidor— y
// QUÉ manda al servidor. Sin el CSS de la app: el ancho de 412 px y los toques de 44 px los
// mide el gate visual con la app construida, no este test.

import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Browser, Page } from "playwright";

const RAIZ = fileURLToPath(new URL("../../../../../", import.meta.url));

const ACCIONES_FALSAS = `
function guardar(fd) {
  const o = {};
  for (const k of new Set(fd.keys())) o[k] = fd.getAll(k).map(String);
  window.__envios.push(o);
  return o;
}
export async function createOrder(fd) {
  const o = guardar(fd);
  if (window.__rechazo) return { ok: false, error: window.__rechazo };
  return {
    ok: true,
    mensaje: "Venta cobrada.",
    venta: {
      id: "ord_42", code: 42, creada: "2026-09-23T13:15:00.000Z",
      lineas: [
        { nombre: "Vacío", cantidad: 1.24, porPeso: true, precio: 12500, total: 15500, aMano: false },
        { nombre: "Entraña", cantidad: 0.95, porPeso: true, precio: 17500, total: 16625, aMano: false },
      ],
      subtotal: 32125, descuento: 3212.5, total: 28912.5, medio: (o.paymentMethod || [null])[0],
      cliente: null, telefono: null, anulada: false,
    },
  };
}
export async function updateOrderItems(_prev, fd) { guardar(fd); return { ok: true, mensaje: "ajustado" }; }
export async function buscarClienteParaVenta(tel) { return tel.includes("4000") ? { nombre: "María Pérez" } : null; }
export async function registrarAvisoWhatsApp() {}
`;
const NAVEGACION_FALSA = `export function useRouter() { return { refresh() { window.__refrescos = (window.__refrescos || 0) + 1; } }; }`;

const ENTRADA = `
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import ToastProvider from "@/app/admin/(dashboard)/ToastProvider";
import VenderForm from "@/app/admin/(dashboard)/vender/VenderForm";
import AjustarPedidoForm from "@/app/admin/(dashboard)/pedidos/AjustarPedidoForm";
window.__envios = [];
const productos = [
  { id: "p_vacio", name: "Vacío", saleUnit: "WEIGHT", price: null, pricePerKg: 12500, unit: "kg" },
  { id: "p_entrana", name: "Entraña", saleUnit: "WEIGHT", price: null, pricePerKg: 17500, unit: "kg" },
];
const stock = { p_vacio: { stock: 30, trackStock: true }, p_entrana: { stock: -0.14, trackStock: true } };
// "ajustar": el pedido online de 0,5 kg sin descuento. "ajustar-10kg": el de recepción con
// 10 kg de vacío y el 10 % ($12.500 sobre $125.000), el que se pesaba a 1 kg y quedaba en $0.
const PEDIDOS = {
  ajustar: { subtotal: 6250, descuento: 0, quantity: 0.5 },
  "ajustar-10kg": { subtotal: 125000, descuento: 12500, quantity: 10 },
};
window.__montar = (cual, tope) =>
  createRoot(document.getElementById("root")).render(
    createElement(ToastProvider, null,
      cual === "sin-precios"
        ? createElement(VenderForm, { products: [], stockById: {}, rapidos: [], negocio: "MAGRA Canning", topeDescuentoPct: tope })
        : cual === "vender" || cual === "pedido"
        ? createElement(VenderForm, { products: productos, stockById: stock, rapidos: ["p_vacio", "p_entrana"], negocio: "MAGRA Canning", topeDescuentoPct: tope, pedidoInicial: cual === "pedido" })
        : createElement(AjustarPedidoForm, { id: "ord_7", code: 7, subtotal: PEDIDOS[cual].subtotal, descuento: PEDIDOS[cual].descuento, items: [
            { productId: "p_vacio", name: "Vacío", saleUnit: "WEIGHT", quantity: PEDIDOS[cual].quantity, unitPrice: 12500, lineTotal: PEDIDOS[cual].subtotal },
          ] }),
    ),
  );
`;

type Envio = Record<string, string[]>;
type Montaje = "vender" | "pedido" | "sin-precios" | "ajustar" | "ajustar-10kg";
type Ventana = { __envios: Envio[]; __rechazo?: string; __montar: (cual: Montaje, tope: number | null) => void };

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

describe("Vender en el navegador", { timeout: 120_000 }, () => {
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
            b.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: "navegacion", namespace: "falso" }));
            b.onLoad({ filter: /.*/, namespace: "falso" }, (a) => ({
              contents: a.path === "acciones" ? ACCIONES_FALSAS : NAVEGACION_FALSA,
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

  async function montar(cual: Montaje, tope: number | null = 10): Promise<{ page: Page; errores: string[] }> {
    const page = await browser!.newPage({ viewport: { width: 412, height: 915 }, locale: "es-AR" });
    const errores: string[] = [];
    page.on("pageerror", (e) => errores.push(e.message));
    await page.setContent('<!doctype html><html lang="es"><body><div id="root"></div></body></html>');
    await page.addScriptTag({ content: bundle });
    await page.evaluate(([c, t]) => (window as unknown as Ventana).__montar(c as Montaje, t as number | null), [
      cual,
      tope,
    ] as const);
    return { page, errores };
  }

  test("Vacío 1,240 + Entraña 0,950 con los botones rápidos, efectivo, pagó con $50.000 → vuelto $17.875", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const { page, errores } = await montar("vender");
    // Botón rápido → salta directo al peso; se tipea con coma, como en la balanza.
    await page.getByRole("button", { name: "Vacío" }).click();
    await page.keyboard.type("1,240");
    await page.getByRole("button", { name: "Entraña" }).click();
    await page.keyboard.type("0,950");
    assert.equal(await page.inputValue("#qty-1"), "1,240");
    await page.getByRole("radio", { name: "Efectivo" }).click();
    await page.getByLabel("Pagó con").fill("50.000");
    await page.getByText("Vuelto $17.875,00").waitFor();
    assert.ok(await page.getByRole("button", { name: "Cobrar $32.125,00" }).isEnabled());
    assert.deepEqual(errores, []);
    await page.close();
  });

  test("descuento: 15 % con recepción frena el cobro; 10 % pasa y el vuelto se recalcula sobre el total", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const { page, errores } = await montar("vender", 10);
    await page.getByRole("button", { name: "Vacío" }).click();
    await page.keyboard.type("1,240");
    await page.getByRole("button", { name: "Entraña" }).click();
    await page.keyboard.type("0,950");
    await page.getByRole("radio", { name: "Efectivo" }).click();
    await page.getByLabel("Pagó con").fill("50.000");

    await page.getByRole("button", { name: "Descuento", exact: true }).click();
    await page.keyboard.type("15");
    await page.getByRole("alert").filter({ hasText: "hasta el 10 %" }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Revisá el descuento" }).isDisabled(), true);

    await page.fill("#descuento-valor", "10");
    await page.getByText("Vuelto $21.087,50").waitFor();
    const cobrar = page.getByRole("button", { name: "Cobrar $28.912,50" });
    assert.ok(await cobrar.isEnabled());

    // Precio a mano sin motivo: frena; con motivo, pasa.
    await page.getByRole("button", { name: "Precio a mano" }).click();
    await page.keyboard.type("Bolsa");
    await page.getByPlaceholder("$ Importe").fill("500");
    await page.getByRole("alert").filter({ hasText: "por qué «Bolsa» va con precio a mano" }).waitFor();
    assert.equal(await page.getByRole("button", { name: /^Cobrar/ }).isDisabled(), true);
    await page.getByPlaceholder(/^Motivo/).fill("sin precio cargado");
    const conBolsa = page.getByRole("button", { name: "Cobrar $29.362,50" });
    assert.ok(await conBolsa.isEnabled());

    await conBolsa.click();
    await page.waitForFunction(() => (window as unknown as Ventana).__envios.length >= 1);
    const envio = await page.evaluate(() => (window as unknown as Ventana).__envios[0]);
    assert.deepEqual(envio.productId, ["p_vacio", "p_entrana"]);
    assert.deepEqual(envio.quantity, ["1.24", "0.95"], "viaja el valor canónico, con punto");
    assert.deepEqual(envio.paymentMethod, ["EFECTIVO"]);
    assert.deepEqual(envio.channel, ["COUNTER"]);
    assert.deepEqual([envio.descuentoTipo, envio.descuentoValor], [["porcentaje"], ["10"]]);
    assert.deepEqual([envio.manualNombre, envio.manualImporte, envio.manualMotivo], [["Bolsa"], ["500"], ["sin precio cargado"]]);
    assert.deepEqual(envio.conTicket, ["1"]);
    assert.ok(envio.idempotencyKey?.[0], "cada ticket lleva su clave");
    assert.equal(envio.customerPhone, undefined, "sin abrir Cliente, no viaja teléfono");

    // Cobrado: el ticket queda a mano y el formulario, limpio para el siguiente.
    await page.getByText("Venta #42 cobrada").waitFor();
    await page.getByText("No válido como factura").waitFor();
    const wa = await page.getByRole("link", { name: "Mandar por WhatsApp" }).getAttribute("href");
    assert.ok(wa?.startsWith("https://wa.me/?text="), "sin teléfono, WhatsApp elige el contacto");
    assert.match(decodeURIComponent(wa!), /No válido como factura/);
    // Imprimir arma un documento propio de 58 mm (sin el resto de la pantalla).
    await page.getByRole("button", { name: "Imprimir (58 mm)" }).click();
    const doc = await page.locator("iframe[srcdoc]").getAttribute("srcdoc");
    assert.match(doc ?? "", /size:58mm auto/);
    assert.match(doc ?? "", /Ticket #42/);
    assert.equal(await page.getByRole("radio", { name: "Efectivo" }).getAttribute("aria-checked"), "false");
    assert.equal(await page.locator("#descuento-valor").count(), 0, "el descuento no queda puesto para el próximo");
    assert.deepEqual(errores, []);
    await page.close();
  });

  test("la dueña no tiene tope: 15 % pasa", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const { page, errores } = await montar("vender", null);
    await page.getByRole("button", { name: "Vacío" }).click();
    await page.keyboard.type("1");
    await page.getByRole("radio", { name: "Mercado Pago" }).click();
    await page.getByRole("button", { name: "Descuento", exact: true }).click();
    await page.keyboard.type("15");
    assert.ok(await page.getByRole("button", { name: "Cobrar $10.625,00" }).isEnabled());
    assert.equal(await page.getByLabel("Pagó con").count(), 0, "el vuelto es sólo con efectivo");
    assert.deepEqual(errores, []);
    await page.close();
  });

  test("cliente por teléfono: la ficha se encuentra con el número escrito de otra forma", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const { page, errores } = await montar("vender");
    await page.getByRole("button", { name: "Cliente", exact: true }).click();
    await page.getByLabel(/Teléfono/).fill("11 4000-7919");
    await page.getByRole("button", { name: "Buscar" }).click();
    await page.getByText("Cliente: María Pérez. La venta queda en su ficha.").waitFor();
    assert.equal(await page.getByLabel(/Nombre/).inputValue(), "María Pérez");
    assert.deepEqual(errores, []);
    await page.close();
  });

  test("pesar y ajustar: el pedido de 0,5 kg se guarda con 1,240 y el total nuevo se ve antes de guardar", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const { page, errores } = await montar("ajustar");
    await page.getByRole("button", { name: "Pesar y ajustar" }).click();
    const peso = page.getByLabel(/Vacío/);
    assert.equal(await peso.inputValue(), "0,5", "con coma, no 0.5");
    await peso.fill("1,240");
    await page.getByText("Total nuevo $15.500,00").waitFor();
    await page.getByRole("button", { name: "Guardar peso real" }).click();
    await page.waitForFunction(() => (window as unknown as Ventana).__envios.length >= 1);
    const envio = await page.evaluate(() => (window as unknown as Ventana).__envios[0]);
    assert.deepEqual(envio, { id: ["ord_7"], productId: ["p_vacio"], quantity: ["1.24"] });
    assert.deepEqual(errores, []);
    await page.close();
  });
  test("pesar y ajustar con descuento: 10 kg con el 10 % pesados a 1 kg quedan con el 10 %, no en $0", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const { page, errores } = await montar("ajustar-10kg");
    await page.getByRole("button", { name: "Pesar y ajustar" }).click();
    await page.getByLabel(/Vacío/).fill("1");
    // Antes: "Descuento −$12.500,00 · Total nuevo $0,00". Ahora el % con que se cargó la venta.
    await page.getByText("Descuento del 10 %, el de la venta: −$1.250,00").waitFor();
    await page.getByText("Total nuevo $11.250,00").waitFor();
    await page.getByLabel(/Vacío/).fill("0,5");
    await page.getByText("Total nuevo $5.625,00").waitFor();
    assert.deepEqual(errores, []);
    await page.close();
  });

  test("tomar un pedido: si el servidor rechaza, horario, dirección y nota quedan escritos", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const { page, errores } = await montar("pedido");
    await page.getByRole("button", { name: "Vacío" }).click();
    await page.keyboard.type("2");
    await page.getByLabel(/Nombre/).fill("María Pérez");
    await page.getByLabel("Entrega").selectOption("DELIVERY");
    await page.getByLabel("Horario deseado").fill("2026-09-26T10:00");
    await page.getByLabel(/Dirección/).fill("Av. Mitre 1234, Canning");
    await page.getByLabel("Nota").fill("cortar en bifes");
    await page.evaluate(() => {
      (window as unknown as Ventana).__rechazo = "Sin stock suficiente de \"Vacío\" para descontar 2.";
    });
    await page.getByRole("button", { name: "Registrar pedido" }).click();
    await page.waitForFunction(() => (window as unknown as Ventana).__envios.length >= 1);
    await page.getByText("Sin stock suficiente").first().waitFor();
    const envio = await page.evaluate(() => (window as unknown as Ventana).__envios[0]);
    assert.deepEqual([envio.scheduledFor, envio.address, envio.notes], [["2026-09-26T10:00"], ["Av. Mitre 1234, Canning"], ["cortar en bifes"]]);
    // Lo cargado sigue ahí para corregir y volver a mandar.
    assert.equal(await page.getByLabel("Horario deseado").inputValue(), "2026-09-26T10:00");
    assert.equal(await page.getByLabel(/Dirección/).inputValue(), "Av. Mitre 1234, Canning");
    assert.equal(await page.getByLabel("Nota").inputValue(), "cortar en bifes");
    assert.equal(await page.getByLabel(/Nombre/).inputValue(), "María Pérez");
    assert.equal(await page.inputValue("#qty-1"), "2");
    assert.deepEqual(errores, []);
    await page.close();
  });
  test("sin ningún producto con precio, el formulario sigue: se cobra con precio a mano", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const { page, errores } = await montar("sin-precios");
    await page.getByRole("button", { name: "Precio a mano" }).click();
    await page.keyboard.type("Bondiola");
    await page.getByPlaceholder("$ Importe").fill("6.543,50");
    await page.getByPlaceholder(/^Motivo/).fill("sin precio cargado");
    await page.getByRole("radio", { name: "Efectivo" }).click();
    const cobrar = page.getByRole("button", { name: "Cobrar $6.543,50" });
    assert.ok(await cobrar.isEnabled());
    await cobrar.click();
    await page.waitForFunction(() => (window as unknown as Ventana).__envios.length >= 1);
    const envio = await page.evaluate(() => (window as unknown as Ventana).__envios[0]);
    assert.equal(envio.productId, undefined, "no viaja ningún producto");
    assert.deepEqual([envio.manualNombre, envio.manualImporte], [["Bondiola"], ["6543.5"]]);
    assert.deepEqual(errores, []);
    await page.close();
  });
});
