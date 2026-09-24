// ============================================================================
// VENDER y PESAR Y AJUSTAR en un navegador de verdad — el recorrido del criterio, tecleado.
// ============================================================================
//
// Los formularios REALES (VenderForm, AjustarPedidoForm) armados con esbuild y montados en el
// Chromium de Playwright, con las Server Actions reemplazadas por dobles que anotan lo que
// viaja. Sin Next ni base: lo que se prueba es la pantalla —que el vuelto, el tope del
// descuento y el motivo del precio a mano se vean y frenen el cobro como dice el servidor— y
// QUÉ manda al servidor. Casi todos corren sin el CSS de la app. Los del celular (la barra de
// cobrar fija, los toques de la venta de 2 cortes) cargan el CSS REAL, compilado de
// globals.css con el mismo Tailwind del build, y miden a 412 px; la pantalla entera con el
// shell la sigue midiendo el gate visual con la app construida.

import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Browser, Page } from "playwright";
import { TIEMPO_MAXIMO_DEL_COBRO_MS, claveDelAlmacen } from "./cobro-sin-conexion";

const RAIZ = fileURLToPath(new URL("../../../../../", import.meta.url));
const ORIGEN = "http://localhost:3999/admin/vender";

const ACCIONES_FALSAS = `
import {
  comoQuedo,
  compararConLoGrabado,
  mensajeDeYaGrabadaIgual,
  pedidoDelReintento,
  textoDeYaGrabada,
} from "@/lib/reintento-de-venta";
import { ventaDeOrden } from "@/app/admin/(dashboard)/vender/reglas-venta";
function guardar(fd) {
  const o = {};
  for (const k of new Set(fd.keys())) o[k] = fd.getAll(k).map(String);
  window.__envios.push(o);
  return o;
}
// Lo que el "servidor" arma con lo que llega, como createOrder: lo pedido con
// \`pedidoDelReintento\` (sin precios ni ficha) y, si se graba, la fila con los precios de la "base".
const PRECIOS = { p_vacio: ["Vacío", 12500, "WEIGHT"], p_entrana: ["Entraña", 17500, "WEIGHT"], p_crema: ["Crema", 9000, "UNIT"] };
const CATALOGO = new Map(Object.entries(PRECIOS).map(([id, [nombre, , u]]) => [id, { nombre, porPeso: u === "WEIGHT" }]));
const r2 = (n) => Math.round(n * 100) / 100;
const num = (x) => Number(String(x).replace(",", "."));
function leer(o) {
  const uno = (k) => (o[k] || [""])[0];
  const aCuenta = uno("aCuenta") === "1";
  const paid = !aCuenta && uno("paid") === "on";
  const input = {
    channel: uno("channel") === "ONLINE" ? "ONLINE" : "COUNTER",
    fulfillment: uno("fulfillment") === "DELIVERY" ? "DELIVERY" : "PICKUP",
    customerName: uno("customerName") || "Mostrador",
    customerPhone: uno("customerPhone"),
    address: uno("address") || null,
    notes: uno("notes") || null,
    scheduledFor: uno("scheduledFor") ? new Date(uno("scheduledFor")) : null,
    paid,
    paymentMethod: paid ? uno("paymentMethod") || null : null,
    items: (o.productId || []).map((id, i) => ({ productId: id, qty: num(o.quantity[i]) })),
    lineasAMano: (o.manualNombre || []).map((n, i) => ({ nombre: n, importe: num(o.manualImporte[i]) })),
  };
  const descuento = uno("descuentoValor") ? { pedido: { tipo: uno("descuentoTipo") === "monto" ? "monto" : "porcentaje", valor: num(uno("descuentoValor")) } } : null;
  return { input, opts: { cupon: uno("cupon") || null, descuento, aCuenta } };
}
function grabar(input, opts) {
  const items = [
    ...input.items.map((l) => { const [name, precio, saleUnit] = PRECIOS[l.productId]; return { productId: l.productId, name, saleUnit, quantity: l.qty, unitPrice: precio, lineTotal: r2(l.qty * precio) }; }),
    ...input.lineasAMano.map((m) => ({ productId: null, name: m.nombre, saleUnit: "UNIT", quantity: 1, unitPrice: m.importe, lineTotal: m.importe })),
  ];
  const subtotal = r2(items.reduce((s, it) => s + it.lineTotal, 0));
  const cupon = (opts.cupon || "").trim().toUpperCase() || null;
  const d = opts.descuento ? opts.descuento.pedido : null;
  const discount = cupon === "VERANO10" ? r2(subtotal * 0.1) : d ? (d.tipo === "monto" ? d.valor : r2((subtotal * d.valor) / 100)) : 0;
  return {
    id: "ord_42", code: 42, createdAt: "2026-09-23T13:15:00.000Z", status: "DELIVERED",
    channel: input.channel, fulfillment: input.fulfillment, customerName: input.customerName, customerPhone: input.customerPhone,
    address: input.address, scheduledFor: input.scheduledFor, notes: input.notes,
    subtotal, discount, total: r2(subtotal - discount),
    paid: opts.aCuenta ? true : input.paid, paymentMethod: opts.aCuenta ? null : input.paymentMethod,
    items, cupon,
  };
}
// Las ventas que el "servidor" ya grabó, por clave de ticket. Un reintento con la misma clave se
// COMPARA con lo grabado, como createOrder (respuesta-al-reintento.ts): igual → la grabada;
// distinta o anulada → «ya-grabada-distinta», sin grabar nada.
const grabadas = new Map();
window.__grabadas = grabadas;
export async function createOrder(fd) {
  if (window.__colgado) { guardar(fd); return new Promise(() => {}); }
  const o = guardar(fd);
  const clave = (o.idempotencyKey || [""])[0];
  const { input, opts } = leer(o);
  // Se corta la señal DESPUÉS de que el servidor grabó: la respuesta no vuelve.
  if (window.__respuestaPerdida) {
    window.__respuestaPerdida = false;
    grabadas.set(clave, { o: grabar(input, opts), anulada: false });
    throw new TypeError("Failed to fetch");
  }
  // Grabó y falló al contestar (la transacción, la conexión): el servidor dice que no sabe.
  if (window.__sinConfirmar) {
    window.__sinConfirmar = false;
    grabadas.set(clave, { o: grabar(input, opts), anulada: false });
    return { ok: false, tipo: "sin-confirmar", error: "No pudimos confirmar si la venta se grabó. Antes de cobrarla de nuevo, fijate en Ventas del día; si la reintentás desde esta pantalla sin cambiarla, no se cobra dos veces." };
  }
  if (window.__rechazo) return { ok: false, error: window.__rechazo };
  const previa = clave ? grabadas.get(clave) : null;
  if (previa) {
    const g = previa.o;
    const esPedido = g.channel === "ONLINE";
    const ticket = ventaDeOrden({ ...g, status: previa.anulada ? "CANCELLED" : g.status });
    const { diferencias, faltante } = compararConLoGrabado(g, pedidoDelReintento(input, opts), CATALOGO);
    if (diferencias.length === 0 && !previa.anulada) {
      return { ok: true, mensaje: mensajeDeYaGrabadaIgual({ code: 42, esPedido, cobrada: Boolean(g.paid && g.paymentMethod) }), venta: ticket };
    }
    const grabada = { id: "ord_42", code: 42, esPedido, total: g.total, como: comoQuedo(g, esPedido), cliente: ticket.cliente, telefono: ticket.telefono, anulada: previa.anulada, diferencias: diferencias.map((x) => x.texto), faltante: previa.anulada ? null : faltante, ticket };
    return { ok: false, tipo: "ya-grabada-distinta", error: textoDeYaGrabada(grabada), grabada };
  }
  if (clave) grabadas.set(clave, { o: grabar(input, opts), anulada: false });
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
      ...(o.aCuenta ? { aCuenta: true } : {}),
    },
  };
}
// «Anular…» de la bandeja: rechaza con el texto del servidor, o se corta la señal.
export async function anularVenta(_prev, fd) {
  guardar(fd);
  if (window.__respuestaPerdida) { window.__respuestaPerdida = false; throw new TypeError("Failed to fetch"); }
  if (window.__rechazo) return { ok: false, error: window.__rechazo };
  return { ok: true, mensaje: "Pedido #7 anulado." };
}
export async function updateOrderItems(_prev, fd) { guardar(fd); return { ok: true, mensaje: "ajustado" }; }
export async function buscarClienteParaVenta(tel) { return tel.includes("4000") ? { nombre: "María Pérez" } : tel.includes("5000") ? { nombre: "Juan Gómez" } : null; }
export async function registrarAvisoWhatsApp() {}
export async function placeOnlineOrder() { return null; }
// Con la facturación apagada: no se emite nada y la fila dice por qué (order-actions.ts).
export async function facturarVenta(_prev, fd) {
  guardar(fd);
  const motivo = "La facturación electrónica no está encendida en este negocio: la venta queda sin factura. Reintentá cuando esté encendida.";
  return { ok: false, error: motivo, factura: { estado: "sin-factura", texto: "Sin factura: " + motivo } };
}
`;
// La vista previa del cupón (coupon-actions.ts), con la misma respuesta que da el servidor.
const CUPONES_FALSOS = `
export async function probarCuponEnPedido(codigo, base) {
  window.__cupones = (window.__cupones || []).concat([{ codigo, base }]);
  if (codigo.trim().toUpperCase() === "VERANO10") {
    return { ok: true, codigo: "VERANO10", tipo: "PERCENT", valor: 10, descuento: Math.round(base * 10) / 100 };
  }
  if (codigo.trim().toUpperCase() === "AGOTADO") {
    return { ok: false, error: "El cupón AGOTADO ya se usó todas las veces que permitía." };
  }
  return { ok: false, error: "Ese cupón no existe o no está activo. Revisá cómo está escrito." };
}
`;
const NAVEGACION_FALSA = `
export function useRouter() { return { refresh() { window.__refrescos = (window.__refrescos || 0) + 1; } }; }
export function usePathname() { return "/admin/vender"; }
`;
// La barra de espacios del celular usa <Link>: acá alcanza con un <a> (no se navega).
const LINK_FALSO = `
import { createElement } from "react";
export default function Link({ href, prefetch, ...resto }) { return createElement("a", { href: String(href), ...resto }); }
`;

const ENTRADA = `
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import ToastProvider from "@/app/admin/(dashboard)/ToastProvider";
import VenderForm from "@/app/admin/(dashboard)/vender/VenderForm";
import AjustarPedidoForm from "@/app/admin/(dashboard)/pedidos/AjustarPedidoForm";
import AnularPedidoForm from "@/app/admin/(dashboard)/pedidos/AnularPedidoForm";
import PosForm from "@/app/admin/(dashboard)/pedidos/PosForm";
import BarraInferior from "@/app/admin/(dashboard)/inicio/BarraInferior";
import { REGISTRO_APPS } from "@/apps/registro";
window.__envios = [];
// La barra de espacios REAL del celular (la que el shell monta en todo negocio por apps, MAGRA
// incluida), con todas las apps: es la que tapaba el botón de cobrar.
window.__montarBarra = () =>
  createRoot(document.getElementById("barra")).render(
    createElement(BarraInferior, { apps: REGISTRO_APPS, esMostrador: true, onBuscar() {} }),
  );
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
window.__montar = (cual, tope, extra) =>
  createRoot(document.getElementById("root")).render(
    createElement(ToastProvider, null,
      cual === "pos"
        ? createElement(PosForm, { products: productos, stockById: stock })
        : cual === "anular"
        ? createElement(AnularPedidoForm, { id: "ord_7", code: 7, paid: true, total: 15500, motivoObligatorio: true })
        : cual === "sin-precios"
        ? createElement(VenderForm, { products: [], stockById: {}, rapidos: [], negocio: "MAGRA Canning", topeDescuentoPct: tope })
        : cual === "vender" || cual === "pedido"
        ? createElement(VenderForm, { products: productos, stockById: stock, rapidos: ["p_vacio", "p_entrana"], negocio: "MAGRA Canning", topeDescuentoPct: tope, pedidoInicial: cual === "pedido", ...(extra || {}) })
        : createElement(AjustarPedidoForm, { id: "ord_7", code: 7, subtotal: PEDIDOS[cual].subtotal, descuento: PEDIDOS[cual].descuento, items: [
            { productId: "p_vacio", name: "Vacío", saleUnit: "WEIGHT", quantity: PEDIDOS[cual].quantity, unitPrice: 12500, lineTotal: PEDIDOS[cual].subtotal },
          ] }),
    ),
  );
`;

type Envio = Record<string, string[]>;
type Montaje = "vender" | "pedido" | "sin-precios" | "ajustar" | "ajustar-10kg" | "anular" | "pos";
/** Lo que el "servidor" falso tiene grabado por clave (la fila, como la lee `leerVentaGrabada`). */
type Grabada = {
  anulada: boolean;
  o: {
    paymentMethod: string | null;
    address: string | null;
    total: number;
    items: { productId: string | null; name: string; quantity: number; unitPrice: number; lineTotal: number }[];
  };
};
type Ventana = {
  __envios: Envio[];
  __rechazo?: string;
  __respuestaPerdida?: boolean;
  __colgado?: boolean;
  __sinConfirmar?: boolean;
  __grabadas: Map<string, Grabada>;
  __cupones?: { codigo: string; base: number }[];
  __montar: (cual: Montaje, tope: number | null, extra?: Record<string, unknown>) => void;
  __montarBarra: () => void;
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

/** El CSS de la app, compilado como en el build (globals.css + Tailwind). "" si no se pudo. */
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

describe("Vender en el navegador", { timeout: 120_000 }, () => {
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
      plugins: [
        {
          name: "falsos",
          setup(b) {
            b.onResolve({ filter: /^@\/lib\/order-actions$/ }, () => ({ path: "acciones", namespace: "falso" }));
            b.onResolve({ filter: /^@\/lib\/coupon-actions$/ }, () => ({ path: "cupones", namespace: "falso" }));
            b.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: "navegacion", namespace: "falso" }));
            b.onResolve({ filter: /^next\/link$/ }, () => ({ path: "link", namespace: "falso" }));
            b.onLoad({ filter: /.*/, namespace: "falso" }, (a) => ({
              contents:
                a.path === "acciones"
                  ? ACCIONES_FALSAS
                  : a.path === "cupones"
                    ? CUPONES_FALSOS
                    : a.path === "link"
                      ? LINK_FALSO
                      : NAVEGACION_FALSA,
              loader: "js",
              resolveDir: RAIZ,
            }));
          },
        },
      ],
    });
    bundle = r.outputFiles[0].text;
    css = await cssDeLaApp();
    browser = await playwright.chromium.launch({ executablePath: chrome });
  });

  after(async () => {
    await browser?.close();
  });

  async function montar(
    cual: Montaje,
    tope: number | null = 10,
    extra?: Record<string, unknown>,
    celular?: { encabezado: number; alto: number },
    opciones?: { antes?: (p: Page) => Promise<void> },
  ): Promise<{ page: Page; errores: string[] }> {
    const page = await browser!.newPage({ viewport: { width: 412, height: celular?.alto ?? 915 }, locale: "es-AR" });
    const errores: string[] = [];
    page.on("pageerror", (e) => errores.push(e.message));
    if (opciones?.antes) await opciones.antes(page);
    // En modo celular: el CSS real y el armado del shell de un negocio por apps —la raíz con
    // `--alto-barra-inferior` (layout.tsx), el contenido con su padding de abajo (AdminShell) y la
    // barra de espacios REAL fija abajo—, más, arriba del formulario, lo que ocupa la página de
    // verdad (barra del shell, título, solapas) para que el formulario no entre en la pantalla.
    // Las clases de la raíz y del contenido son las mismas de layout.tsx y AdminShell.tsx.
    // Se sirve desde un origen de verdad (localhost, contexto seguro): en about:blank el
    // navegador no deja usar el sessionStorage, y la duda del cobro vive ahí.
    const html = celular
        ? `<!doctype html><html lang="es"><head><style>${css}</style></head><body class="bg-surface"><div class="min-h-screen bg-surface text-body [--alto-barra-inferior:calc(3.5rem_+_env(safe-area-inset-bottom))] lg:[--alto-barra-inferior:0px]"><div id="contenido" class="flex-1 pb-[var(--alto-barra-inferior,0px)]"><div style="height:${celular.encabezado}px">encabezado</div><div id="root" class="px-4"></div></div><div id="barra"></div></div></body></html>`
        : '<!doctype html><html lang="es"><body><div id="root"></div></body></html>';
    await page.route(ORIGEN, (r) => r.fulfill({ contentType: "text/html; charset=utf-8", body: html }));
    await page.goto(ORIGEN);
    await page.addScriptTag({ content: bundle });
    if (celular) await page.evaluate(() => (window as unknown as Ventana).__montarBarra());
    await page.evaluate(
      ([c, t, x]) => (window as unknown as Ventana).__montar(c as Montaje, t as number | null, x as Record<string, unknown>),
      [cual, tope, extra ?? {}] as const,
    );
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

  test("cupón en el mostrador: sin «Aplicar» no se cobra; aplicado, viaja el código y no un descuento a mano", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const { page, errores } = await montar("vender", 10);
    await page.getByRole("button", { name: "Vacío" }).click();
    await page.keyboard.type("1,240");
    await page.getByRole("radio", { name: "Efectivo" }).click();
    await page.getByRole("button", { name: "Descuento", exact: true }).click();
    await page.getByRole("radio", { name: "Cupón" }).click();
    await page.fill("#descuento-valor", "agotado");
    assert.equal(await page.getByRole("button", { name: "Aplicá el cupón" }).isDisabled(), true);
    await page.getByRole("button", { name: "Aplicar" }).click();
    await page.getByRole("alert").filter({ hasText: "ya se usó todas las veces" }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Aplicá el cupón" }).isDisabled(), true);

    // El cupón lo cargó la dueña: su 10 % no pasa por el tope de recepción, pero se ve igual.
    await page.fill("#descuento-valor", "verano10");
    await page.getByRole("button", { name: "Aplicar" }).click();
    await page.getByText("Cupón VERANO10: −$1.550,00").waitFor();
    const cobrar = page.getByRole("button", { name: "Cobrar $13.950,00" });
    assert.ok(await cobrar.isEnabled());
    await cobrar.click();
    await page.waitForFunction(() => (window as unknown as Ventana).__envios.length >= 1);
    const envio = await page.evaluate(() => (window as unknown as Ventana).__envios[0]);
    assert.deepEqual(envio.cupon, ["VERANO10"]);
    assert.equal(envio.descuentoTipo, undefined, "un cupón y un descuento a mano no viajan juntos");
    assert.equal(envio.descuentoValor, undefined);
    const probados = await page.evaluate(() => (window as unknown as Ventana).__cupones ?? []);
    assert.deepEqual(probados.at(-1), { codigo: "verano10", base: 15500 }, "se prueba sobre lo que se compra");
    assert.deepEqual(errores, []);
    await page.close();
  });

  test("a cuenta: sin la ficha del cliente no se deja; con la ficha viaja aCuenta=1 y ningún medio", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const { page, errores } = await montar("vender", 10, { aCuentaDisponible: true });
    await page.getByRole("button", { name: "Vacío" }).click();
    await page.keyboard.type("1");
    await page.getByRole("radio", { name: "A cuenta" }).click();
    await page.getByRole("alert").filter({ hasText: "buscá al cliente por su teléfono" }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Buscá al cliente" }).isDisabled(), true);
    await page.getByLabel(/Teléfono/).fill("11 4000-7919");
    await page.getByRole("button", { name: "Buscar" }).click();
    await page.getByText("Queda en la cuenta corriente de María Pérez.", { exact: false }).waitFor();
    const dejar = page.getByRole("button", { name: "Dejar a cuenta $12.500,00" });
    assert.ok(await dejar.isEnabled());
    await dejar.click();
    await page.waitForFunction(() => (window as unknown as Ventana).__envios.length >= 1);
    const envio = await page.evaluate(() => (window as unknown as Ventana).__envios[0]);
    assert.deepEqual(envio.aCuenta, ["1"]);
    assert.equal(envio.paymentMethod, undefined, "a cuenta no es un medio de cobro");
    await page.getByText("Venta #42 a cuenta").waitFor();
    await page.getByText("Queda a cuenta").first().waitFor();
    assert.deepEqual(errores, []);
    await page.close();
  });

  test("sin cuentas corrientes, «A cuenta» no se ofrece", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const { page, errores } = await montar("vender", 10);
    await page.getByRole("button", { name: "Vacío" }).click();
    await page.keyboard.type("1");
    assert.equal(await page.getByRole("radio", { name: "A cuenta" }).count(), 0);
    assert.deepEqual(errores, []);
    await page.close();
  });

  test("Facturar con la facturación apagada: la venta queda «Sin factura», con el porqué, y se ofrece reintentar", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const { page, errores } = await montar("vender", null, { puedeFacturar: true });
    await page.getByRole("button", { name: "Vacío" }).click();
    await page.keyboard.type("1");
    await page.getByRole("radio", { name: "Efectivo" }).click();
    await page.getByRole("button", { name: "Cobrar $12.500,00" }).click();
    await page.getByText("Venta #42 cobrada").waitFor();
    assert.equal(await page.getByText("Sin factura", { exact: true }).count(), 1);
    await page.getByRole("button", { name: "Facturar" }).click();
    await page.getByText("Sin factura: La facturación electrónica no está encendida", { exact: false }).waitFor();
    await page.getByRole("button", { name: "Reintentar" }).waitFor();
    const envio = await page.evaluate(() => (window as unknown as Ventana).__envios.at(-1));
    assert.deepEqual(envio, { id: ["ord_42"] });
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

  test("anular en la bandeja: el rechazo del servidor y el corte de señal se ven en la fila, sin tirar la pantalla", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const { page, errores } = await montar("anular");
    await page.getByRole("button", { name: "Anular…" }).click();
    await page.evaluate(() => {
      (window as unknown as Ventana).__rechazo = "Escribí por qué se anula: recepción no anula sin motivo.";
    });
    await page.getByRole("button", { name: "Sí, anular" }).click();
    await page.getByRole("group").getByRole("alert").filter({ hasText: "Escribí por qué se anula" }).waitFor();
    assert.equal(await page.getByRole("textbox").getAttribute("aria-invalid"), "true");

    // Con motivo, se corta la señal: el formulario sigue ahí, con el motivo escrito.
    await page.getByRole("textbox").fill("se pesó mal");
    await page.evaluate(() => {
      const w = window as unknown as Ventana;
      w.__rechazo = undefined;
      w.__respuestaPerdida = true;
    });
    await page.getByRole("button", { name: "Sí, anular" }).click();
    await page.getByRole("group").getByRole("alert").filter({ hasText: "si ya se había anulado, no se anula dos veces" }).waitFor();
    assert.equal(await page.getByRole("textbox").inputValue(), "se pesó mal");
    assert.equal((await page.evaluate(() => (window as unknown as Ventana).__envios)).length, 2);
    assert.deepEqual(errores, []);
    await page.close();
  });

  test("precio a mano con recepción: un producto del catálogo no se esquiva a mano, y hay un máximo", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const { page, errores } = await montar("vender", 10, { topePrecioAMano: { bajaPct: 10, maximo: 50000 } });
    await page.getByRole("radio", { name: "Efectivo" }).click();
    await page.getByRole("button", { name: "Precio a mano" }).click();
    await page.keyboard.type("vacio");
    await page.getByPlaceholder("$ Importe").fill("100");
    await page.getByPlaceholder(/^Motivo/).fill("le hice precio");
    await page.getByRole("alert").filter({ hasText: "se vende por kilo" }).waitFor();
    assert.equal(await page.getByRole("button", { name: /^(Cobrar|Revisá)/ }).isDisabled(), true);

    await page.getByPlaceholder(/^Qué se vende/).fill("Bolsa grande");
    await page.getByPlaceholder("$ Importe").fill("60.000");
    await page.getByRole("alert").filter({ hasText: /llega hasta \$\s?50\.000,00/ }).waitFor();
    assert.equal(await page.getByRole("button", { name: /^(Cobrar|Revisá)/ }).isDisabled(), true);

    await page.getByPlaceholder("$ Importe").fill("500");
    assert.ok(await page.getByRole("button", { name: /^Cobrar \$\s?500,00$/ }).isEnabled());
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

  test("celular 412 px: 2 cortes en 7 toques o menos, con el botón de cobrar a la vista sin bajar", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    if (!css) return t.skip("no se pudo compilar el CSS de la app");
    // 412 × 700: el alto útil de un celular con la barra del navegador. Arriba, 360 px de
    // encabezado (shell, título y solapas de la pantalla real).
    for (const camino of ["rápidos", "buscador"] as const) {
      const { page, errores } = await montar("vender", 10, undefined, { encabezado: 360, alto: 700 });
      let toques = 0;
      const tocar = async (l: ReturnType<Page["getByRole"]>) => {
        toques++;
        await l.click();
      };
      if (camino === "rápidos") {
        await tocar(page.getByRole("button", { name: "Vacío" }));
        await page.keyboard.type("1,240");
        await tocar(page.getByRole("button", { name: "Entraña" }));
        await page.keyboard.type("0,950");
      } else {
        // Sin botones rápidos (un local que recién arranca): buscar, elegir, pesar, Enter.
        await tocar(page.getByRole("combobox", { name: "Producto" }).first());
        await page.keyboard.type("vac");
        await tocar(page.getByRole("option", { name: /Vacío/ }));
        await page.keyboard.type("1,240");
        toques++; // el Enter del teclado del celular cuenta como toque
        await page.keyboard.press("Enter");
        await page.keyboard.type("entr");
        await tocar(page.getByRole("option", { name: /Entraña/ }));
        await page.keyboard.type("0,950");
      }
      await tocar(page.getByRole("radio", { name: "Efectivo" }));
      // El botón está en pantalla SIN scrollear: la barra fija lo trae (Playwright scrollearía
      // solo al tocarlo, así que se mide antes).
      const cobrar = page.getByRole("button", { name: "Cobrar $32.125,00" });
      const caja = await cobrar.boundingBox();
      assert.ok(caja, "el botón existe");
      assert.ok(caja.y >= 0 && caja.y + caja.height <= 700, `el botón de cobrar se ve sin bajar (y=${caja.y})`);
      assert.ok(caja.height >= 44, `toque de 44 px o más (${caja.height})`);
      // Y no está TAPADO: la barra de espacios del celular está fija abajo (z-40). Lo que hay en
      // el centro del botón es el botón, no «Mostrador»; y el botón termina arriba de la barra.
      const barra = await page.getByRole("navigation", { name: "Espacios" }).boundingBox();
      assert.ok(barra && barra.height >= 56, "la barra de espacios está montada");
      assert.ok(caja.y + caja.height <= barra.y, `el botón (hasta y=${caja.y + caja.height}) queda arriba de la barra (y=${barra.y})`);
      const encima = await page.evaluate(
        ([x, y]) => document.elementFromPoint(x, y)?.closest("button")?.textContent?.trim() ?? "",
        [caja.x + caja.width / 2, caja.y + caja.height / 2] as const,
      );
      assert.equal(encima, "Cobrar $32.125,00", "tocar el centro del botón es tocar Cobrar");
      const total = page.getByText("$32.125,00", { exact: true });
      assert.ok(await total.isVisible(), "el total también está en la barra");
      await tocar(cobrar);
      await page.getByText("Venta #42 cobrada").waitFor();
      assert.ok(toques <= 7, `${camino}: ${toques} toques`);
      // La confirmación es el bloque de la última venta: ningún aviso flotante queda encima del
      // botón de cobrar de la venta siguiente (el de 4 s lo tapaba).
      assert.equal(await page.locator(".fixed.bottom-4 > *").count(), 0);
      const ancho = await page.evaluate(() => document.documentElement.scrollWidth);
      assert.ok(ancho <= 412, `sin scroll horizontal (${ancho})`);
      assert.deepEqual(errores, []);
      await page.close();
    }
  });

  test("se corta la señal a mitad del cobro: lo cargado queda, se reintenta con la misma venta y no se cobra dos veces", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const { page, errores } = await montar("vender");
    await page.getByRole("button", { name: "Vacío" }).click();
    await page.keyboard.type("1,240");
    await page.getByRole("radio", { name: "Efectivo" }).click();
    await page.evaluate(() => {
      (window as unknown as Ventana).__respuestaPerdida = true;
    });
    await page.getByRole("button", { name: "Cobrar $15.500,00" }).click();
    const aviso = page.locator("form").getByRole("alert").filter({ hasText: "no sabemos si la venta se grabó" });
    await aviso.waitFor();
    assert.match((await aviso.textContent()) ?? "", /no se cobra dos veces/);
    // Nada se perdió: el peso y el medio siguen ahí.
    assert.equal(await page.inputValue("#qty-1"), "1,240");
    assert.equal(await page.getByRole("radio", { name: "Efectivo" }).getAttribute("aria-checked"), "true");
    await page.getByRole("button", { name: "Reintentar cobro $15.500,00" }).click();
    // Queda escrito arriba del formulario, no en el aviso flotante que tapaba el botón.
    await page.getByRole("status").filter({ hasText: "Esa venta ya estaba registrada (#42): no se cobró dos veces." }).waitFor();
    assert.equal(await page.locator(".fixed.bottom-4 > *").count(), 0, "ningún aviso flotante");
    const envios = await page.evaluate(() => (window as unknown as Ventana).__envios);
    assert.equal(envios.length, 2);
    assert.equal(envios[0].idempotencyKey[0], envios[1].idempotencyKey[0], "el reintento es la misma venta");
    // Resuelto: el aviso se va y el ticket queda limpio para el próximo.
    assert.equal(await aviso.count(), 0);
    assert.equal(await page.getByRole("radio", { name: "Efectivo" }).getAttribute("aria-checked"), "false");

    // La venta siguiente lleva otra clave.
    await page.getByRole("button", { name: "Vacío" }).click();
    await page.keyboard.type("1");
    await page.getByRole("radio", { name: "Mercado Pago" }).click();
    await page.getByRole("button", { name: "Cobrar $12.500,00" }).click();
    await page.waitForFunction(() => (window as unknown as Ventana).__envios.length >= 3);
    const tercera = await page.evaluate(() => (window as unknown as Ventana).__envios[2]);
    assert.notEqual(tercera.idempotencyKey[0], envios[0].idempotencyKey[0]);
    assert.deepEqual(errores, []);
    await page.close();
  });

  test("se corta y el cajero suma un corte: no se reintenta con la clave de la cortada; «Es otra venta» estrena clave", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const { page, errores } = await montar("vender");
    await page.getByRole("button", { name: "Vacío" }).click();
    await page.keyboard.type("1,240");
    await page.getByRole("radio", { name: "Efectivo" }).click();
    await page.evaluate(() => {
      (window as unknown as Ventana).__respuestaPerdida = true;
    });
    await page.getByRole("button", { name: "Cobrar $15.500,00" }).click();
    await page.locator("form").getByRole("alert").filter({ hasText: "no sabemos si la venta se grabó" }).waitFor();

    // Suma la Entraña: el botón ya no invita a "reintentar" con otro monto.
    await page.getByRole("button", { name: "Entraña" }).click();
    await page.keyboard.type("0,950");
    const cambio = page.locator("form").getByRole("alert").filter({ hasText: "Cambiaste la venta después del corte." });
    await cambio.waitFor();
    assert.match((await cambio.textContent()) ?? "", /era de \$\s?15\.500,00/);
    assert.equal(await page.getByRole("button", { name: "Revisá la venta cortada" }).isDisabled(), true);
    assert.equal(await page.getByRole("button", { name: /^Reintentar cobro/ }).count(), 0);

    // La deja como estaba: vuelve a ser la misma venta y se ofrece reintentar.
    await page.getByRole("button", { name: "Quitar línea" }).nth(1).click();
    await page.getByRole("button", { name: "Reintentar cobro $15.500,00" }).waitFor();
    assert.equal(await cambio.count(), 0);

    // Vuelve a sumarla y, revisado que la cortada se grabó, declara que es otra venta.
    await page.getByRole("button", { name: "Entraña" }).click();
    await page.keyboard.type("0,950");
    await page.getByRole("button", { name: "Quitar línea" }).first().click(); // saca el Vacío ya grabado
    await page.getByRole("button", { name: "Es otra venta" }).click();
    await page.getByRole("button", { name: "Cobrar $16.625,00" }).click();
    await page.getByText("Venta #42 cobrada").waitFor();
    const envios = await page.evaluate(() => (window as unknown as Ventana).__envios);
    assert.equal(envios.length, 2, "mientras estaba cambiada no viajó nada");
    assert.notEqual(envios[1].idempotencyKey[0], envios[0].idempotencyKey[0], "otra venta, otra clave");
    assert.deepEqual(envios[1].productId, ["p_entrana"]);
    assert.deepEqual(errores, []);
    await page.close();
  });

  test("se corta, se reintenta sin señal y se suma un corte: sigue frenado, y al volver la señal no dice 'no se cobró'", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const { page, errores } = await montar("vender");
    const alerta = (texto: string) => page.locator("form").getByRole("alert").filter({ hasText: texto });
    // (1)-(2) Cobra el Vacío y la respuesta se pierde: el "servidor" la grabó.
    await page.getByRole("button", { name: "Vacío" }).click();
    await page.keyboard.type("1,240");
    await page.getByRole("radio", { name: "Efectivo" }).click();
    await page.evaluate(() => {
      (window as unknown as Ventana).__respuestaPerdida = true;
    });
    await page.getByRole("button", { name: "Cobrar $15.500,00" }).click();
    await alerta("no sabemos si la venta se grabó").waitFor();

    // (3) Todavía sin señal, reintenta: no sale nada y la duda NO se borra.
    await page.context().setOffline(true);
    await page.getByRole("button", { name: "Reintentar cobro $15.500,00" }).click();
    await alerta("no sabemos si la venta se grabó").waitFor();
    assert.equal(await alerta("La venta no se cobró").count(), 0, "no se afirma que no se cobró");

    // (4) Suma la Entraña: frenado, sin «Reintentar» con el total nuevo.
    await page.getByRole("button", { name: "Entraña" }).click();
    await page.keyboard.type("0,950");
    await alerta("Cambiaste la venta después del corte.").waitFor();
    assert.equal(await page.getByRole("button", { name: "Revisá la venta cortada" }).isDisabled(), true);
    assert.equal(await page.getByRole("button", { name: /^Reintentar cobro/ }).count(), 0);

    // (5) Vuelve la señal: sigue frenado; nada dice "todavía no se cobró".
    await page.context().setOffline(false);
    await page.waitForFunction(() => navigator.onLine);
    await alerta("Cambiaste la venta después del corte.").waitFor();
    assert.equal(await alerta("todavía no se cobró").count(), 0);
    assert.equal(await page.getByRole("button", { name: "Revisá la venta cortada" }).isDisabled(), true);
    assert.equal(await page.evaluate(() => (window as unknown as Ventana).__envios.length), 1, "mientras estaba cambiada no viajó nada");

    // La deja como estaba: se reintenta la MISMA, diciendo que no se sabe, y el servidor no cobra dos veces.
    await page.getByRole("button", { name: "Quitar línea" }).nth(1).click();
    await alerta("no sabemos si la venta se grabó").waitFor();
    assert.equal(await alerta("todavía no se cobró").count(), 0);
    await page.getByRole("button", { name: "Reintentar cobro $15.500,00" }).click();
    await page.getByRole("status").filter({ hasText: "Esa venta ya estaba registrada (#42): no se cobró dos veces." }).waitFor();
    const envios = await page.evaluate(() => (window as unknown as Ventana).__envios);
    assert.equal(envios.length, 2);
    assert.equal(envios[1].idempotencyKey[0], envios[0].idempotencyKey[0]);
    assert.deepEqual(envios[1].productId, ["p_vacio"], "viajó sólo lo que se había mandado");
    assert.deepEqual(errores, []);
    await page.close();
  });

  test("sin señal antes de cobrar: no se manda nada, se dice, y al volver la señal se cobra", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const { page, errores } = await montar("vender");
    await page.getByRole("button", { name: "Entraña" }).click();
    await page.keyboard.type("0,950");
    await page.getByRole("radio", { name: "Transferencia" }).click();
    await page.context().setOffline(true);
    await page.getByRole("button", { name: "Cobrar $16.625,00" }).click();
    await page.locator("form").getByRole("alert").filter({ hasText: "No hay conexión. La venta no se cobró." }).waitFor();
    assert.equal(await page.evaluate(() => (window as unknown as Ventana).__envios.length), 0, "no viajó nada");
    await page.context().setOffline(false);
    // Volvió la señal: el aviso lo dice (no se mandó nada, no hay duda que aclarar).
    await page.locator("form").getByRole("alert").filter({ hasText: "Volvió la conexión. La venta todavía no se cobró." }).waitFor();
    await page.getByRole("button", { name: "Reintentar cobro $16.625,00" }).click();
    await page.getByText("Venta #42 cobrada").waitFor();
    assert.equal(await page.evaluate(() => (window as unknown as Ventana).__envios.length), 1);
    assert.deepEqual(errores, []);
    await page.close();
  });

  test("el rechazo del servidor queda escrito al lado del botón (no en un aviso que se va) y se puede cerrar", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const { page, errores } = await montar("vender");
    await page.getByRole("button", { name: "Vacío" }).click();
    await page.keyboard.type("1");
    await page.getByRole("radio", { name: "Efectivo" }).click();
    await page.evaluate(() => {
      (window as unknown as Ventana).__rechazo = "El día 23/09 ya está cerrado: dejá la venta sin cobrar y cobrala mañana.";
    });
    await page.getByRole("button", { name: "Cobrar $12.500,00" }).click();
    const aviso = page.locator("form").getByRole("alert").filter({ hasText: "ya está cerrado" });
    await aviso.waitFor();
    assert.match((await aviso.textContent()) ?? "", /La venta no se cobró/);
    // Un rechazo no se "reintenta" igual: el botón sigue siendo Cobrar.
    assert.ok(await page.getByRole("button", { name: "Cobrar $12.500,00" }).isEnabled());
    await page.getByRole("button", { name: "Entendido" }).click();
    assert.equal(await aviso.count(), 0);
    assert.deepEqual(errores, []);
    await page.close();
  });

  // ── La corrección de raíz del reintento (refutador R1–R5) ───────────────────────────────────
  // El "servidor" falso compara con las MISMAS funciones que createOrder
  // (reintento-de-venta.ts): lo que se prueba acá es qué hace la pantalla con cada respuesta.

  const ALMACEN = claveDelAlmacen("MAGRA Canning");
  const alertaEn = (page: Page, texto: string | RegExp) => page.locator("form").getByRole("alert").filter({ hasText: texto });
  const claves = (page: Page) => page.evaluate(() => (window as unknown as Ventana).__envios.map((e) => e.idempotencyKey[0]));

  test("R1 a cuenta: se corta y se cambia el CLIENTE → no se reintenta con la clave de la cortada", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const { page, errores } = await montar("vender", 10, { aCuentaDisponible: true });
    await page.getByRole("button", { name: "Vacío" }).click();
    await page.keyboard.type("1,240");
    await page.getByRole("radio", { name: "A cuenta" }).click();
    await page.locator("#vender-telefono").fill("11 4000 0000");
    await page.getByRole("button", { name: "Buscar" }).click();
    await page.getByText("Cliente: María Pérez").waitFor();
    await page.evaluate(() => {
      (window as unknown as Ventana).__respuestaPerdida = true;
    });
    await page.getByRole("button", { name: "Dejar a cuenta $15.500,00" }).click();
    await alertaEn(page, "no sabemos si la venta se grabó").waitFor();
    // Era a Juan, no a María.
    await page.locator("#vender-telefono").fill("11 5000 0000");
    await page.getByRole("button", { name: "Buscar" }).click();
    await page.getByText("Cliente: Juan Gómez").waitFor();
    await alertaEn(page, "Cambiaste la venta después del corte.").waitFor();
    assert.equal(await page.getByRole("button", { name: "Revisá la venta cortada" }).isDisabled(), true);
    assert.equal(await page.getByRole("button", { name: /^Reintentar cobro/ }).count(), 0);
    assert.equal((await claves(page)).length, 1, "con otro cliente no viajó nada con la clave de la cortada");
    // Vuelve a María: es la misma venta y se reintenta; el servidor la encuentra.
    await page.locator("#vender-telefono").fill("11 4000 0000");
    await page.getByRole("button", { name: "Buscar" }).click();
    await page.getByRole("button", { name: "Reintentar cobro $15.500,00" }).click();
    await page.getByRole("status").filter({ hasText: "Esa venta ya estaba registrada (#42): no se registró dos veces." }).waitFor();
    const [k1, k2] = await claves(page);
    assert.equal(k1, k2);
    assert.deepEqual(errores, []);
    await page.close();
  });

  test("«ya grabada» con OTRA cosa (el medio): no se ofrece cobrar nada aparte; se deja así o se anula y se vuelve a consultar", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const { page, errores } = await montar("vender");
    await page.getByRole("button", { name: "Vacío" }).click();
    await page.keyboard.type("1,240");
    await page.getByRole("radio", { name: "Efectivo" }).click();
    await page.evaluate(() => {
      (window as unknown as Ventana).__respuestaPerdida = true;
    });
    await page.getByRole("button", { name: "Cobrar $15.500,00" }).click();
    await alertaEn(page, "no sabemos si la venta se grabó").waitFor();
    assert.notEqual(await page.evaluate((k) => sessionStorage.getItem(k), ALMACEN), null, "la duda quedó en la pestaña");
    // Lo que el servidor tiene con esa clave NO es lo que la pantalla cree (la grabó en MP otra pestaña).
    await page.evaluate(() => {
      for (const g of (window as unknown as Ventana).__grabadas.values()) g.o.paymentMethod = "MERCADOPAGO";
    });
    await page.getByRole("button", { name: "Reintentar cobro $15.500,00" }).click();
    const aviso = alertaEn(page, "La venta #42 ya se había grabado con $15.500,00 (cobrada en Mercado Pago).");
    await aviso.waitFor();
    const texto = (await aviso.textContent()) ?? "";
    assert.match(texto, /Lo que cambiaste \(Cómo pagó: se grabó en Mercado Pago; ahora en Efectivo\) no se registró\. Esto no se completa con otra venta\./);
    // R-A: NO hay botón que cobre lo cargado otra vez.
    assert.equal(await page.getByRole("button", { name: /Cobrar (sólo )?lo que falta|como otra venta/ }).count(), 0);
    assert.equal(await page.getByRole("button", { name: "Revisá la venta #42" }).isDisabled(), true);
    assert.equal(await page.getByText("Venta #42 cobrada").count(), 0, "no se muestra como cobrada lo que no se registró");
    assert.equal(await page.evaluate((k) => sessionStorage.getItem(k), ALMACEN), null, "resuelta la duda, se borra de la pestaña");
    assert.equal(await page.getByRole("link", { name: "Abrir Ventas del día" }).getAttribute("target"), "_blank");
    // Ver la #42: el ticket de lo que quedó grabado.
    await page.getByRole("button", { name: "Ver la venta #42" }).click();
    const grabada = page.getByRole("region", { name: "Venta #42 ya grabada" });
    await grabada.waitFor();
    assert.match((await grabada.textContent()) ?? "", /Pagó con mercado pago/);
    // Consultar de nuevo SIN anularla: la misma clave, la misma respuesta. No se graba nada.
    await page.getByRole("button", { name: "Ya la anulé: volver a consultar" }).click();
    await aviso.waitFor();
    // La anulan en Ventas del día y se vuelve a consultar: ahora se ofrece cobrarla como otra.
    await page.evaluate(() => {
      for (const g of (window as unknown as Ventana).__grabadas.values()) g.anulada = true;
    });
    await page.getByRole("button", { name: "Ya la anulé: volver a consultar" }).click();
    await alertaEn(page, "y después se anuló.").waitFor();
    await page.getByRole("button", { name: "Cobrarla como otra venta" }).click();
    await page.getByRole("button", { name: "Cobrar $15.500,00" }).click();
    await page.getByText("Venta #42 cobrada").waitFor();
    const ks = await claves(page);
    assert.deepEqual(ks.slice(0, 4), [ks[0], ks[0], ks[0], ks[0]], "reintento y consultas: la clave de la cortada");
    assert.notEqual(ks[4], ks[0], "anulada la #42, la venta de nuevo va con otra clave");
    assert.equal(ks.length, 5);
    assert.deepEqual(errores, []);
    await page.close();
  });

  test("«ya grabada» y lo único distinto es DE MÁS: «Cobrar sólo lo que falta» carga SÓLO eso, con su total", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const { page, errores } = await montar("vender");
    await page.getByRole("button", { name: "Vacío" }).click();
    await page.keyboard.type("1,240");
    await page.getByRole("button", { name: "Entraña" }).click();
    await page.keyboard.type("0,950");
    await page.getByRole("radio", { name: "Efectivo" }).click();
    await page.evaluate(() => {
      (window as unknown as Ventana).__respuestaPerdida = true;
    });
    await page.getByRole("button", { name: "Cobrar $32.125,00" }).click();
    await alertaEn(page, "no sabemos si la venta se grabó").waitFor();
    // Lo que quedó grabado con esa clave tiene sólo el Vacío (la Entraña no llegó a entrar).
    await page.evaluate(() => {
      for (const g of (window as unknown as Ventana).__grabadas.values()) {
        g.o.items = g.o.items.filter((it) => it.productId === "p_vacio");
        g.o.total = 15500;
      }
    });
    await page.getByRole("button", { name: "Reintentar cobro $32.125,00" }).click();
    const aviso = alertaEn(page, "La venta #42 ya se había grabado con $15.500,00 (cobrada en Efectivo).");
    await aviso.waitFor();
    assert.match((await aviso.textContent()) ?? "", /Lo que agregaste \(Entraña 0,95 kg\) no se registró\./);
    await page.getByRole("button", { name: "Cobrar sólo lo que falta" }).click();
    // En el ticket queda SÓLO la Entraña, el mismo medio, y el total de lo que falta a la vista.
    assert.equal(await page.locator('input[aria-label="Peso en kg"]').count(), 1);
    assert.equal(await page.locator('input[aria-label="Peso en kg"]').first().inputValue(), "0,95");
    assert.equal(await page.getByRole("radio", { name: "Efectivo" }).getAttribute("aria-checked"), "true");
    await page.getByRole("status").filter({ hasText: "Cargado sólo lo que faltaba de la venta #42: Entraña 0,95 kg. Total a cobrar aparte: $16.625,00." }).waitFor();
    await page.getByRole("button", { name: "Cobrar $16.625,00" }).click();
    await page.getByText("Venta #42 cobrada").waitFor();
    const envios = await page.evaluate(() => (window as unknown as Ventana).__envios);
    assert.equal(envios.length, 3);
    assert.deepEqual(envios[2].productId, ["p_entrana"], "viajó sólo lo que faltaba");
    assert.notEqual(envios[2].idempotencyKey[0], envios[0].idempotencyKey[0], "con otra clave");
    assert.deepEqual(errores, []);
    await page.close();
  });

  test("la venta con esa clave está ANULADA: se dice, no se muestra como cobrada, y se ofrece cobrarla como otra", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const { page, errores } = await montar("vender");
    await page.getByRole("button", { name: "Vacío" }).click();
    await page.keyboard.type("1");
    await page.getByRole("radio", { name: "Efectivo" }).click();
    await page.evaluate(() => {
      (window as unknown as Ventana).__respuestaPerdida = true;
    });
    await page.getByRole("button", { name: "Cobrar $12.500,00" }).click();
    await alertaEn(page, "no sabemos si la venta se grabó").waitFor();
    await page.evaluate(() => {
      for (const g of (window as unknown as Ventana).__grabadas.values()) g.anulada = true;
    });
    await page.getByRole("button", { name: "Reintentar cobro $12.500,00" }).click();
    const aviso = alertaEn(page, "La venta #42 ya se había grabado con $12.500,00 (cobrada en Efectivo) y después se anuló.");
    await aviso.waitFor();
    assert.match((await aviso.textContent()) ?? "", /No se volvió a cobrar\. Si hay que cobrarla, tocá «Cobrarla como otra venta»\./);
    assert.equal(await page.getByText("Venta #42 cobrada").count(), 0);
    await page.getByRole("button", { name: "Ver la venta #42" }).click();
    assert.match((await page.getByRole("region", { name: "Venta #42 ya grabada" }).textContent()) ?? "", /ANULADA/);
    await page.getByRole("button", { name: "Cobrarla como otra venta" }).click();
    await page.getByRole("button", { name: "Cobrar $12.500,00" }).click();
    await page.getByText("Venta #42 cobrada").waitFor();
    const [k1, , k3] = await claves(page);
    assert.notEqual(k3, k1);
    assert.deepEqual(errores, []);
    await page.close();
  });

  test("R2 pedido: se corta y se cambia la dirección → frenado; y la respuesta «ya registrado» habla de pedido, no de cobro", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const { page, errores } = await montar("pedido");
    await page.getByRole("button", { name: "Vacío" }).click();
    await page.keyboard.type("2");
    await page.getByLabel(/Nombre/).fill("María Pérez");
    await page.getByLabel("Entrega").selectOption("DELIVERY");
    await page.getByLabel(/Dirección/).fill("Av. Mitre 1234");
    await page.evaluate(() => {
      (window as unknown as Ventana).__respuestaPerdida = true;
    });
    await page.getByRole("button", { name: "Registrar pedido" }).click();
    await alertaEn(page, "no sabemos si el pedido se grabó").waitFor();
    await page.getByLabel(/Dirección/).fill("Belgrano 55");
    await alertaEn(page, "Cambiaste el pedido después del corte.").waitFor();
    assert.equal(await page.getByRole("button", { name: "Revisá el pedido cortado" }).isDisabled(), true);
    await page.getByLabel(/Dirección/).fill("Av. Mitre 1234");
    await page.getByLabel("Entrega").selectOption("PICKUP");
    await alertaEn(page, "Cambiaste el pedido después del corte.").waitFor();
    await page.getByLabel("Entrega").selectOption("DELIVERY");
    await page.getByLabel(/Dirección/).fill("Av. Mitre 1234");
    assert.equal((await claves(page)).length, 1, "mientras estaba cambiado no viajó nada");
    // El servidor tiene con esa clave otra dirección (la cargó otra pestaña): lo dice, en palabras de pedido.
    await page.evaluate(() => {
      for (const g of (window as unknown as Ventana).__grabadas.values()) g.o.address = "Belgrano 55";
    });
    await page.getByRole("button", { name: "Reintentar el pedido" }).click();
    const aviso = alertaEn(page, "El pedido #42 ya se había registrado con $25.000,00 (sin cobrar, María Pérez).");
    await aviso.waitFor();
    const texto = (await aviso.textContent()) ?? "";
    assert.match(texto, /Lo que cambiaste \(Dirección: se grabó «Belgrano 55»; ahora «Av\. Mitre 1234»\) no se registró\./);
    assert.match(texto, /«Dejarla así»/);
    assert.match(texto, /Pedidos para preparar/);
    assert.doesNotMatch(texto, /no se (volvió a )?cobr|cobrar lo que falta/i);
    assert.equal(await page.getByRole("button", { name: "Revisá el pedido #42" }).isDisabled(), true);
    assert.deepEqual(errores, []);
    await page.close();
  });

  test("R3 el servidor no contesta: a los 25 s deja «Cobrando…» y dice que no sabemos; el reintento lleva la misma clave", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const { page, errores } = await montar("vender", 10, undefined, undefined, { antes: (p) => p.clock.install() });
    await page.getByRole("button", { name: "Vacío" }).click();
    await page.keyboard.type("1,240");
    await page.getByRole("radio", { name: "Efectivo" }).click();
    await page.evaluate(() => {
      (window as unknown as Ventana).__colgado = true;
    });
    await page.getByRole("button", { name: "Cobrar $15.500,00" }).click();
    const cobrando = page.getByRole("button", { name: "Cobrando…" });
    await cobrando.waitFor();
    await page.clock.runFor(TIEMPO_MAXIMO_DEL_COBRO_MS - 1000);
    assert.equal(await cobrando.count(), 1, "antes del tope sigue esperando");
    await page.clock.runFor(1000);
    await alertaEn(page, "no sabemos si la venta se grabó").waitFor();
    assert.equal(await cobrando.count(), 0, "ya no queda gris y sin salida");
    const reintentar = page.getByRole("button", { name: "Reintentar cobro $15.500,00" });
    assert.equal(await reintentar.isEnabled(), true);
    await page.evaluate(() => {
      (window as unknown as Ventana).__colgado = false;
    });
    await reintentar.click();
    await page.getByText("Venta #42 cobrada").waitFor();
    const [k1, k2] = await claves(page);
    assert.equal(k1, k2, "el reintento es la misma venta");
    assert.deepEqual(errores, []);
    await page.close();
  });

  test("R4 se corta con cupón y se lo cambia por un 10 % a mano del mismo monto → no es la misma venta", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const { page, errores } = await montar("vender", null);
    await page.getByRole("button", { name: "Vacío" }).click();
    await page.keyboard.type("1");
    await page.getByRole("radio", { name: "Efectivo" }).click();
    await page.getByRole("button", { name: "Descuento" }).click();
    await page.getByRole("radio", { name: "Cupón" }).click();
    await page.locator("#descuento-valor").fill("VERANO10");
    await page.getByRole("button", { name: "Aplicar" }).click();
    await page.getByText(/Cupón VERANO10/).waitFor();
    await page.evaluate(() => {
      (window as unknown as Ventana).__respuestaPerdida = true;
    });
    await page.getByRole("button", { name: "Cobrar $11.250,00" }).click();
    await alertaEn(page, "no sabemos si la venta se grabó").waitFor();
    await page.getByRole("radio", { name: "%" }).click();
    await page.locator("#descuento-valor").fill("10");
    await alertaEn(page, "Cambiaste la venta después del corte.").waitFor();
    assert.equal(await page.getByRole("button", { name: "Revisá la venta cortada" }).isDisabled(), true);
    assert.equal((await claves(page)).length, 1);
    assert.deepEqual(errores, []);
    await page.close();
  });

  test("R5 se corta y se vuelve a Vender (remonta) o se recarga: la duda vuelve con lo cargado y la MISMA clave", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const { page, errores } = await montar("vender");
    await page.getByRole("button", { name: "Vacío" }).click();
    await page.keyboard.type("1,240");
    await page.getByRole("radio", { name: "Efectivo" }).click();
    await page.evaluate(() => {
      (window as unknown as Ventana).__respuestaPerdida = true;
    });
    await page.getByRole("button", { name: "Cobrar $15.500,00" }).click();
    await alertaEn(page, "no sabemos si la venta se grabó").waitFor();
    const quedo = /^Quedó un cobro sin confirmar: \$\s?15\.500,00, del \d{2}\/\d{2}\/\d{4} \d{2}:\d{2}\. No sabemos si la venta se grabó\./;
    // (a) Volver a entrar a Vender: la pantalla se desmonta y se monta de nuevo.
    await page.evaluate(() => {
      document.getElementById("root")!.remove();
      const d = document.createElement("div");
      d.id = "root";
      document.body.appendChild(d);
      (window as unknown as Ventana).__montar("vender", 10, {});
    });
    await alertaEn(page, "Quedó un cobro sin confirmar").waitFor();
    assert.match((await alertaEn(page, "Quedó un cobro sin confirmar").locator("p").first().textContent()) ?? "", quedo);
    assert.equal(await page.inputValue("#qty-1"), "1,240");
    assert.equal(await page.getByRole("radio", { name: "Efectivo" }).getAttribute("aria-checked"), "true");
    // (b) Recargar la pestaña (o que el celular la descarte y la vuelva a abrir). El "servidor"
    // falso vive en la página: se lleva lo que tenía grabado.
    const servidor = await page.evaluate(() => ({
      grabadas: [...(window as unknown as Ventana).__grabadas.entries()],
      envios: (window as unknown as Ventana).__envios,
    }));
    await page.reload();
    await page.addScriptTag({ content: bundle });
    await page.evaluate((srv) => {
      const w = window as unknown as Ventana;
      for (const [k, v] of srv.grabadas) w.__grabadas.set(k, v);
      w.__envios.push(...srv.envios);
      w.__montar("vender", 10, {});
    }, servidor);
    const aviso = alertaEn(page, "Quedó un cobro sin confirmar");
    await aviso.waitFor();
    assert.equal(await page.inputValue("#qty-1"), "1,240");
    await page.getByRole("button", { name: "Reintentar cobro $15.500,00" }).click();
    await page.getByRole("status").filter({ hasText: "Esa venta ya estaba registrada (#42): no se cobró dos veces." }).waitFor();
    const [k1, k2] = await claves(page);
    assert.equal(k1, k2, "un cobro, una venta: el reintento después de recargar lleva la clave de la cortada");
    assert.equal(await page.evaluate((k) => sessionStorage.getItem(k), ALMACEN), null, "confirmado, se borra de la pestaña");
    assert.deepEqual(errores, []);
    await page.close();
  });

  test("un error del servidor que no es un rechazo de negocio: 'no sabemos', y el reintento con la misma clave lo encuentra", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const { page, errores } = await montar("vender");
    await page.getByRole("button", { name: "Vacío" }).click();
    await page.keyboard.type("1");
    await page.getByRole("radio", { name: "Efectivo" }).click();
    await page.evaluate(() => {
      (window as unknown as Ventana).__sinConfirmar = true;
    });
    await page.getByRole("button", { name: "Cobrar $12.500,00" }).click();
    await alertaEn(page, "no sabemos si la venta se grabó").waitFor();
    assert.equal(await alertaEn(page, "La venta no se cobró").count(), 0);
    await page.getByRole("button", { name: "Reintentar cobro $12.500,00" }).click();
    await page.getByRole("status").filter({ hasText: "Esa venta ya estaba registrada (#42): no se cobró dos veces." }).waitFor();
    const [k1, k2] = await claves(page);
    assert.equal(k1, k2);
    assert.deepEqual(errores, []);
    await page.close();
  });

  test("tras un rechazo de negocio sin corte, lo corregido viaja con otra clave (con esa no se grabó nada)", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const { page, errores } = await montar("vender");
    await page.getByRole("button", { name: "Vacío" }).click();
    await page.keyboard.type("2");
    await page.getByRole("radio", { name: "Efectivo" }).click();
    await page.evaluate(() => {
      (window as unknown as Ventana).__rechazo = 'Sin stock suficiente de "Vacío" para descontar 2.';
    });
    await page.getByRole("button", { name: "Cobrar $25.000,00" }).click();
    await alertaEn(page, "La venta no se cobró.").waitFor();
    await page.evaluate(() => {
      (window as unknown as Ventana).__rechazo = undefined;
    });
    await page.getByRole("button", { name: "Entendido" }).click();
    await page.locator("#qty-1").fill("1");
    await page.getByRole("button", { name: "Cobrar $12.500,00" }).click();
    await page.getByText("Venta #42 cobrada").waitFor();
    const [k1, k2] = await claves(page);
    assert.notEqual(k1, k2);
    assert.deepEqual(errores, []);
    await page.close();
  });
  test("la duda que dejó OTRA persona en la pestaña no se restaura: se avisa sin cliente ni lo cargado", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const { page, errores } = await montar("vender", 10, { aCuentaDisponible: true, usuarioId: "u-maria" });
    await page.getByRole("button", { name: "Vacío" }).click();
    await page.keyboard.type("1,240");
    await page.getByRole("radio", { name: "A cuenta" }).click();
    await page.locator("#vender-telefono").fill("11 4000 0000");
    await page.getByRole("button", { name: "Buscar" }).click();
    await page.getByText("Cliente: María Pérez").waitFor();
    await page.evaluate(() => {
      (window as unknown as Ventana).__respuestaPerdida = true;
    });
    await page.getByRole("button", { name: "Dejar a cuenta $15.500,00" }).click();
    await alertaEn(page, "no sabemos si la venta se grabó").waitFor();
    // Entra otra persona en la misma pestaña (sin haber cerrado sesión).
    await page.evaluate(() => {
      document.getElementById("root")!.remove();
      const d = document.createElement("div");
      d.id = "root";
      document.body.appendChild(d);
      (window as unknown as Ventana).__montar("vender", 10, { aCuentaDisponible: true, usuarioId: "u-juan" });
    });
    const ajena = page.getByRole("status").filter({ hasText: "En esta pestaña quedó un cobro sin confirmar de otra persona" });
    await ajena.waitFor();
    assert.doesNotMatch((await page.locator("body").textContent()) ?? "", /María|4000|15\.500/, "nada del cliente ni de lo cargado");
    assert.equal(await page.locator("#qty-1").inputValue(), "", "el ticket arranca vacío");
    await ajena.getByRole("button", { name: "Entendido" }).click();
    assert.equal(await page.evaluate((k) => sessionStorage.getItem(k), ALMACEN), null);
    assert.deepEqual(errores, []);
    await page.close();
  });

  test("con un envío en duda siempre se puede «Empezar de nuevo», después del aviso de revisar Ventas del día", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const { page, errores } = await montar("vender");
    await page.getByRole("button", { name: "Vacío" }).click();
    await page.keyboard.type("1");
    await page.getByRole("radio", { name: "Efectivo" }).click();
    // Dos veces 'sin confirmar' seguidas: la duda sigue, y la salida también.
    for (let i = 0; i < 2; i++) {
      await page.evaluate(() => {
        (window as unknown as Ventana).__sinConfirmar = true;
      });
      await page.getByRole("button", { name: /^(Cobrar|Reintentar cobro) \$12\.500,00$/ }).click();
      await alertaEn(page, "no sabemos si la venta se grabó").waitFor();
    }
    await page.getByRole("button", { name: "Empezar de nuevo" }).click();
    await alertaEn(page, "Antes de empezar de nuevo, fijate en Ventas del día si la venta se grabó").waitFor();
    await page.getByRole("button", { name: "Cancelar" }).click();
    assert.equal(await page.inputValue("#qty-1"), "1", "cancelar no borra nada");
    await page.getByRole("button", { name: "Empezar de nuevo" }).click();
    await page.getByRole("button", { name: "Sí, empezar de nuevo" }).click();
    assert.equal(await alertaEn(page, "no sabemos").count(), 0);
    assert.equal(await page.evaluate((k) => sessionStorage.getItem(k), ALMACEN), null);
    assert.deepEqual(errores, []);
    await page.close();
  });

  test("POS de la bandeja: «ya grabada con otra cosa» se muestra y se sale con «Empezar de nuevo» (antes quedaba trabado)", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const { page, errores } = await montar("pos");
    await page.locator("#prod-1").fill("Vac");
    await page.getByRole("option", { name: /Vacío/ }).first().click();
    await page.locator("#qty-1").fill("1");
    await page.getByRole("radio", { name: "Efectivo" }).click();
    await page.evaluate(() => {
      (window as unknown as Ventana).__respuestaPerdida = true;
    });
    await page.getByRole("button", { name: "Cobrar" }).click();
    await page.waitForFunction(() => (window as unknown as Ventana).__envios.length === 1);
    await page.evaluate(() => {
      for (const g of (window as unknown as Ventana).__grabadas.values()) g.o.paymentMethod = "MERCADOPAGO";
    });
    await page.getByRole("button", { name: "Cobrar" }).click();
    const aviso = page.getByRole("alert").filter({ hasText: "La venta #42 ya se había grabado con $12.500,00 (cobrada en Mercado Pago)." });
    await aviso.waitFor();
    assert.match((await aviso.textContent()) ?? "", /Lo que cambiaste \(Cómo pagó: .*\) no se registró\./);
    assert.equal(await page.getByRole("button", { name: "Revisá la venta #42" }).isDisabled(), true);
    await aviso.getByRole("button", { name: "Empezar de nuevo" }).click();
    assert.equal(await aviso.count(), 0);
    await page.locator("#prod-2").fill("Entr");
    await page.getByRole("option", { name: /Entraña/ }).first().click();
    await page.locator("#qty-2").fill("0,5");
    await page.getByRole("radio", { name: "Efectivo" }).click();
    await page.getByRole("button", { name: "Cobrar" }).click();
    await page.waitForFunction(() => (window as unknown as Ventana).__envios.length === 3);
    const ks = await claves(page);
    assert.equal(ks[1], ks[0]);
    assert.notEqual(ks[2], ks[0], "el ticket nuevo, con clave nueva");
    assert.deepEqual(errores, []);
    await page.close();
  });
  /** Recarga la pestaña con el "servidor" falso como estaba y monta Vender con `extra`. */
  async function recargar(page: Page, extra: Record<string, unknown>) {
    const servidor = await page.evaluate(() => ({
      grabadas: [...(window as unknown as Ventana).__grabadas.entries()],
      envios: (window as unknown as Ventana).__envios,
    }));
    await page.reload();
    await page.addScriptTag({ content: bundle });
    await page.evaluate(
      ([srv, x]) => {
        const w = window as unknown as Ventana;
        for (const [k, v] of srv.grabadas) w.__grabadas.set(k, v);
        w.__envios.push(...srv.envios);
        w.__montar("vender", 10, x);
      },
      [servidor, extra] as const,
    );
  }

  test("RF precio: se recarga con el precio de catálogo NUEVO y la duda sigue siendo la misma venta (se reintenta)", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const { page, errores } = await montar("vender");
    await page.getByRole("button", { name: "Vacío" }).click();
    await page.keyboard.type("1,240");
    await page.getByRole("radio", { name: "Efectivo" }).click();
    await page.evaluate(() => {
      (window as unknown as Ventana).__respuestaPerdida = true;
    });
    await page.getByRole("button", { name: "Cobrar $15.500,00" }).click();
    await alertaEn(page, "no sabemos si la venta se grabó").waitFor();
    // La dueña subió el Vacío a $13.000/kg: la página recargada trae el catálogo nuevo.
    await recargar(page, {
      products: [
        { id: "p_vacio", name: "Vacío", saleUnit: "WEIGHT", price: null, pricePerKg: 13000, unit: "kg" },
        { id: "p_entrana", name: "Entraña", saleUnit: "WEIGHT", price: null, pricePerKg: 17500, unit: "kg" },
      ],
    });
    await alertaEn(page, "Quedó un cobro sin confirmar").waitFor();
    assert.equal(await alertaEn(page, "Cambiaste la venta").count(), 0, "el precio no lo cambió la cajera");
    await page.getByRole("button", { name: "Reintentar cobro $16.120,00" }).click();
    await page.getByRole("status").filter({ hasText: "Esa venta ya estaba registrada (#42): no se cobró dos veces." }).waitFor();
    const ks = await claves(page);
    assert.equal(ks[1], ks[0]);
    assert.deepEqual(errores, []);
    await page.close();
  });

  test("RF2 stock: el envío en duda se llevó la última unidad; al recargar el reintento NO lo frena el stock de la pantalla", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const crema = [{ id: "p_crema", name: "Crema", saleUnit: "UNIT", price: 9000, pricePerKg: null, unit: "u" }];
    const { page, errores } = await montar("vender", 10, { products: crema, stockById: { p_crema: { stock: 1, trackStock: true } }, rapidos: ["p_crema"] });
    await page.getByRole("button", { name: "Crema" }).click();
    await page.keyboard.type("1");
    await page.getByRole("radio", { name: "Efectivo" }).click();
    await page.evaluate(() => {
      (window as unknown as Ventana).__respuestaPerdida = true;
    });
    await page.getByRole("button", { name: "Cobrar $9.000,00" }).click();
    await alertaEn(page, "no sabemos si la venta se grabó").waitFor();
    await recargar(page, { products: crema, stockById: { p_crema: { stock: 0, trackStock: true } }, rapidos: ["p_crema"] });
    await alertaEn(page, "Quedó un cobro sin confirmar").waitFor();
    assert.equal(await page.getByText("No alcanza el stock").count(), 0);
    await page.getByRole("status").filter({ hasText: "puede ser porque esta misma venta ya se grabó" }).waitFor();
    const reintentar = page.getByRole("button", { name: "Reintentar cobro $9.000,00" });
    assert.equal(await reintentar.isEnabled(), true);
    await reintentar.click();
    await page.getByRole("status").filter({ hasText: "Esa venta ya estaba registrada (#42): no se cobró dos veces." }).waitFor();
    // Sin duda de por medio, el stock sí frena: la venta nueva de otra Crema no se puede cobrar.
    await page.getByRole("button", { name: "Crema" }).click();
    await page.keyboard.type("1");
    await page.getByRole("radio", { name: "Efectivo" }).click();
    await page.getByText("No alcanza el stock").waitFor();
    assert.equal(await page.getByRole("button", { name: "Cobrar $9.000,00" }).isDisabled(), true);
    assert.deepEqual(errores, []);
    await page.close();
  });

  test("RF3 «Cobrar sólo lo que falta» borra «Pagó con»: el vuelto no sale de la venta entera", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const { page, errores } = await montar("vender");
    await page.getByRole("button", { name: "Vacío" }).click();
    await page.keyboard.type("1,240");
    await page.getByRole("button", { name: "Entraña" }).click();
    await page.keyboard.type("0,950");
    await page.getByRole("radio", { name: "Efectivo" }).click();
    await page.getByLabel("Pagó con").fill("50.000");
    await page.evaluate(() => {
      (window as unknown as Ventana).__respuestaPerdida = true;
    });
    await page.getByRole("button", { name: "Cobrar $32.125,00" }).click();
    await alertaEn(page, "no sabemos si la venta se grabó").waitFor();
    await page.evaluate(() => {
      for (const g of (window as unknown as Ventana).__grabadas.values()) g.o.items = g.o.items.filter((it) => it.productId === "p_vacio");
    });
    await page.getByRole("button", { name: "Reintentar cobro $32.125,00" }).click();
    await alertaEn(page, "La venta #42 ya se había grabado").waitFor();
    await page.getByRole("button", { name: "Cobrar sólo lo que falta" }).click();
    assert.equal(await page.getByLabel("Pagó con").inputValue(), "");
    assert.equal(await page.getByText(/^Vuelto/).count(), 0);
    assert.deepEqual(errores, []);
    await page.close();
  });

  test("el teléfono se compara como la ficha: «+54 9 11 4000-0000» es el mismo cliente que «11 4000 0000»", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const { page, errores } = await montar("vender", 10, { aCuentaDisponible: true });
    await page.getByRole("button", { name: "Vacío" }).click();
    await page.keyboard.type("1,240");
    await page.getByRole("radio", { name: "A cuenta" }).click();
    await page.locator("#vender-telefono").fill("11 4000 0000");
    await page.getByRole("button", { name: "Buscar" }).click();
    await page.getByText("Cliente: María Pérez").waitFor();
    await page.evaluate(() => {
      (window as unknown as Ventana).__respuestaPerdida = true;
    });
    await page.getByRole("button", { name: "Dejar a cuenta $15.500,00" }).click();
    await alertaEn(page, "no sabemos si la venta se grabó").waitFor();
    await page.locator("#vender-telefono").fill("+54 9 11 4000-0000");
    await page.getByRole("button", { name: "Buscar" }).click();
    await page.getByText("Cliente: María Pérez").waitFor();
    assert.equal(await alertaEn(page, "Cambiaste la venta").count(), 0);
    await page.getByRole("button", { name: "Reintentar cobro $15.500,00" }).click();
    await page.getByRole("status").filter({ hasText: "Esa venta ya estaba registrada (#42)" }).waitFor();
    assert.deepEqual(errores, []);
    await page.close();
  });

  test("POS de la bandeja: si lo distinto es DE MÁS, «Cargar sólo lo que falta» lo deja para cobrarlo aparte", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const { page, errores } = await montar("pos");
    await page.locator("#prod-1").fill("Vac");
    await page.getByRole("option", { name: /Vacío/ }).first().click();
    await page.locator("#qty-1").fill("1");
    await page.getByRole("button", { name: "+ Agregar producto" }).click();
    await page.locator("#prod-2").fill("Entr");
    await page.getByRole("option", { name: /Entraña/ }).first().click();
    await page.locator("#qty-2").fill("0,5");
    await page.getByRole("radio", { name: "Efectivo" }).click();
    await page.evaluate(() => {
      (window as unknown as Ventana).__respuestaPerdida = true;
    });
    await page.getByRole("button", { name: "Cobrar" }).click();
    await page.waitForFunction(() => (window as unknown as Ventana).__envios.length === 1);
    await page.evaluate(() => {
      for (const g of (window as unknown as Ventana).__grabadas.values()) g.o.items = g.o.items.filter((it) => it.productId === "p_vacio");
    });
    await page.getByRole("button", { name: "Cobrar" }).click();
    const aviso = page.getByRole("alert").filter({ hasText: "Eso hay que cobrarlo APARTE" });
    await aviso.waitFor();
    assert.match((await aviso.textContent()) ?? "", /Lo que agregaste \(Entraña 0,5 kg\) no se registró\./);
    assert.match((await aviso.textContent()) ?? "", /«Empezar de nuevo» limpia el ticket y lo que falta NO queda cobrado/);
    await aviso.getByRole("button", { name: "Cargar sólo lo que falta" }).click();
    await page.getByRole("radio", { name: "Efectivo" }).click();
    await page.getByRole("button", { name: "Cobrar" }).click();
    await page.waitForFunction(() => (window as unknown as Ventana).__envios.length === 3);
    const envios = await page.evaluate(() => (window as unknown as Ventana).__envios);
    assert.deepEqual(envios[2].productId, ["p_entrana"]);
    assert.notEqual(envios[2].idempotencyKey[0], envios[0].idempotencyKey[0]);
    assert.deepEqual(errores, []);
    await page.close();
  });
});
