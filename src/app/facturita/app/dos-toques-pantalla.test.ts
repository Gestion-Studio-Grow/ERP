// ============================================================================
// FACTUROQUE · «tu facturación en dos toques» — contado en un Chromium de verdad, a 390 px
// ============================================================================
//
// Sin servidor: `MisProductos` real armado con esbuild, el CSS real y acciones dobles que anotan lo
// que reciben (la plata, el CAE y el doble toque contra Postgres: facturita-atajos-postgres.test.ts).
//  · Monotributista con un producto guardado: la factura sale con DOS toques reales (el producto y
//    «Emitir factura por $X»), y antes del segundo la pantalla dice qué se emite y a quién.
//  · El dedo que rebota (dos toques seguidos a «Emitir») manda UN pedido.
//  · Un servicio no emite directo: baja al formulario (ARCA pide las fechas).
//  · Nada desborda a lo ancho y lo que se toca mide ≥ 44 px.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { paginaRenglon, prepararNavegador, type Navegador } from "@/test/navegador-componentes";

const ENTRADA = `
import { createRoot } from "react-dom/client";
import { createElement } from "react";
import MisProductos from "@/app/facturita/app/MisProductos";
const PRODUCTOS = [
  { id: "p1", detalle: "Torta de chocolate", precio: 25000, concepto: "productos" },
  { id: "p2", detalle: "Clase de yoga", precio: 8000, concepto: "servicios" },
];
window.__emisiones = [];
window.__fallar = 0; // cuántas emisiones contestan «no se pudo» (sin factura conocida)
window.__editados = [];
const acciones = {
  async emitir(datos) {
    window.__emisiones.push(datos);
    await new Promise((r) => setTimeout(r, 300)); // ARCA tarda: da tiempo al segundo toque
    if (window.__fallar > 0) { window.__fallar--; return { ok: false, error: "No se pudo emitir la factura. Probá de nuevo en unos minutos." }; }
    return { ok: true, invoiceId: "inv_1", limite: { usadas: 1, limite: 5, puedeEmitir: true, mensaje: null },
      estado: { estado: "autorizada", dePrueba: true, numero: "00002-00000001", cae: "1" }, mensaje: "Factura autorizada de prueba." };
  },
  async guardar() { return { ok: false, error: "no" }; },
  async quitar() { return { ok: true }; },
};
window.montar = (condicionEmisor) => createRoot(document.getElementById("root")).render(
  createElement("main", { className: "mx-auto w-full max-w-3xl px-4 py-6" },
    createElement(MisProductos, { productos: PRODUCTOS, ultima: null, condicionEmisor, bloqueado: false, acciones,
      onEditar: (a) => window.__editados.push(a.detalle) })));
`;

let nav: Navegador | string;
before(async () => {
  nav = await prepararNavegador(ENTRADA, { ruta: "/facturita/app" });
});
after(async () => {
  if (typeof nav !== "string") await nav?.browser.close();
});

const CELULAR = { width: 390, height: 844 };

async function abrir(t: import("node:test").TestContext, condicion: string) {
  if (typeof nav === "string") {
    t.skip(nav);
    return null;
  }
  const contexto = await nav.browser.newContext({ viewport: CELULAR, locale: "es-AR", hasTouch: true });
  const page = await contexto.newPage();
  const errores: string[] = [];
  page.on("pageerror", (e) => errores.push(e.message));
  await page.setContent(paginaRenglon(nav));
  await page.evaluate((c) => (window as unknown as { montar: (c: string) => void }).montar(c), condicion);
  t.after(() => contexto.close());
  return { page, errores };
}

test("monotributista: la factura sale en DOS toques y el segundo dice el monto", async (t) => {
  const a = await abrir(t, "MONOTRIBUTO");
  if (!a) return;
  const { page, errores } = a;
  let toques = 0;

  // Toque 1: el producto.
  await page.getByRole("button", { name: /Torta de chocolate/ }).tap();
  toques++;
  // Antes del 2.º toque: qué, a quién y cuánto, a la vista.
  await page.getByText(/consumidor final/).waitFor();
  const emitir = page.getByRole("button", { name: /^Emitir factura por \$\s?25\.000/ });
  assert.equal(await emitir.count(), 1, "el botón dice el monto");

  // Toque 2: emitir. El dedo rebota: un segundo toque enseguida no manda otro pedido.
  // Los dos clics van en la MISMA tarea, antes de que React vuelva a pintar y deshabilite el botón.
  await emitir.evaluate((b: HTMLButtonElement) => {
    b.click();
    b.click();
  });
  toques++;
  await page.getByText(/Autorizada de prueba/).waitFor();

  const emisiones = await page.evaluate(() => (window as unknown as { __emisiones: { descripcion: string; total: number; claveEmision: string; docTipo?: number }[] }).__emisiones);
  assert.equal(toques, 2, "dos toques");
  assert.equal(emisiones.length, 1, "un solo pedido aunque el dedo rebote");
  assert.equal(emisiones[0].descripcion, "Torta de chocolate");
  assert.equal(emisiones[0].total, 25000);
  assert.equal(emisiones[0].docTipo, undefined, "consumidor final");
  assert.match(emisiones[0].claveEmision, /^[A-Za-z0-9-]{16,64}$/);

  // A 390 px: sin desborde y todo lo que se toca ≥ 44 px.
  const medida = await page.evaluate(() => ({
    ancho: document.documentElement.scrollWidth,
    chicos: [...document.querySelectorAll("button")]
      .map((b) => ({ t: b.textContent?.trim(), h: b.getBoundingClientRect().height, w: b.getBoundingClientRect().width }))
      .filter((b) => b.h < 44 || b.w < 44),
  }));
  assert.ok(medida.ancho <= 390, `desborda: ${medida.ancho}px`);
  assert.deepEqual(medida.chicos, []);
  assert.deepEqual(errores, []);
});

test("un servicio no emite directo: baja al formulario con lo guardado", async (t) => {
  const a = await abrir(t, "MONOTRIBUTO");
  if (!a) return;
  await a.page.getByRole("button", { name: /Clase de yoga/ }).tap();
  const v = await a.page.evaluate(() => ({
    editados: (window as unknown as { __editados: string[] }).__editados,
    emisiones: (window as unknown as { __emisiones: unknown[] }).__emisiones.length,
  }));
  assert.deepEqual(v, { editados: ["Clase de yoga"], emisiones: 0 });
  assert.equal(await a.page.getByRole("button", { name: /^Emitir factura por/ }).count(), 0);
});

test("inscripto: el producto tampoco emite directo (elige la alícuota en el formulario)", async (t) => {
  const a = await abrir(t, "RESPONSABLE_INSCRIPTO");
  if (!a) return;
  await a.page.getByRole("button", { name: /Torta de chocolate/ }).tap();
  assert.equal(await a.page.getByRole("button", { name: /^Emitir factura por/ }).count(), 0);
});

test("un error sin factura conocida: reintentar (o volver a tocar el producto) viaja con la MISMA clave", async (t) => {
  const a = await abrir(t, "MONOTRIBUTO");
  if (!a) return;
  const { page } = a;
  await page.evaluate(() => ((window as unknown as { __fallar: number }).__fallar = 1));
  await page.getByRole("button", { name: /Torta de chocolate/ }).tap();
  await page.getByRole("button", { name: /^Emitir factura por/ }).tap();
  await page.getByText(/No se pudo emitir/).waitFor();
  // Vuelve a tocar el producto y emite: es el mismo intento.
  await page.getByRole("button", { name: /Torta de chocolate/ }).tap();
  await page.getByRole("button", { name: /^Emitir factura por/ }).tap();
  await page.getByText(/Autorizada de prueba/).waitFor();
  const claves = await page.evaluate(() =>
    (window as unknown as { __emisiones: { claveEmision: string }[] }).__emisiones.map((e) => e.claveEmision),
  );
  assert.equal(claves.length, 2);
  assert.equal(claves[0], claves[1], "la misma clave: si la primera llegó a grabarse, el servidor la devuelve");
  // Después de una factura, la próxima venta es otro intento (clave nueva).
  await page.getByRole("button", { name: /Torta de chocolate/ }).tap();
  await page.getByRole("button", { name: /^Emitir factura por/ }).tap();
  await page.waitForFunction(() => (window as unknown as { __emisiones: unknown[] }).__emisiones.length === 3);
  const tercera = await page.evaluate(() => (window as unknown as { __emisiones: { claveEmision: string }[] }).__emisiones[2].claveEmision);
  assert.notEqual(tercera, claves[0]);
});
