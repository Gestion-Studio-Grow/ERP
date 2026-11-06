// ============================================================================
// «Propuestos» · una propuesta en TRES toques, en un Chromium de verdad a 390 px (diseño «Renglón»)
// ============================================================================
//
// `PropuestaTresToques` real con acciones dobles (el motor y su idempotencia se prueban del lado
// del servidor). Bancos y Mercado Pago comparten la bandeja.
//  · Toque 1 abre y dice a quién y por cuánto; toque 2 «Emitir esta factura»; el 3.º gesto desliza.
//  · Sin deslizar hasta el final, no se emite nada.
//  · El que ya estaba facturado por otro camino se informa como atado, no como error.
//  · «No es una venta» manda la de ESE renglón.
//  · Nada desborda y lo que se toca mide ≥ 44 px.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { paginaRenglon, prepararNavegador, type Navegador } from "@/test/navegador-componentes";

const ENTRADA = `
import { createRoot } from "react-dom/client";
import { createElement } from "react";
import PropuestaTresToques from "@/app/admin/(dashboard)/facturacion/bancos/PropuestaTresToques";
const base = { importacionId: "imp", fecha: "20261105", contraparte: null, referencia: null, clasificacion: "venta",
  estadoPropuesta: "auto", requiereIdentificacion: false, motivoRevision: null, docTipo: null, docNro: null,
  nombreReceptor: null, descripcionServicio: null, invoiceId: null, createdAt: "2026-11-05T12:00:00Z" };
const PROPUESTAS = [
  { ...base, id: "mp1", monto: 25000, descripcion: "Torta de chocolate", contraparte: "Ana Pérez", origen: "mercadopago" },
  { ...base, id: "bc1", monto: 8000, descripcion: "TRANSF RECIBIDA 0041", origen: "banco" },
];
window.__emitidas = [];
window.__noVenta = [];
window.__respuesta = "emitida";
const acciones = {
  async emitir(ids) {
    window.__emitidas.push(ids);
    await new Promise((r) => setTimeout(r, 100));
    if (window.__respuesta === "ya") return { emitidas: 0, bloqueadasPorCap: 0, capAlcanzado: false, errores: [], yaFacturadas: 1 };
    return { emitidas: 1, bloqueadasPorCap: 0, capAlcanzado: false, errores: [] };
  },
  async noEsVenta(id) { window.__noVenta.push(id); return { ok: true }; },
};
window.montar = () => createRoot(document.getElementById("root")).render(
  createElement("main", { className: "mx-auto w-full max-w-3xl px-4 py-6" },
    ...PROPUESTAS.map((p) => createElement(PropuestaTresToques, { key: p.id, p, modoPrueba: true, acciones }))));
`;

let nav: Navegador | string;
before(async () => {
  nav = await prepararNavegador(ENTRADA, { ruta: "/admin/facturacion/bancos" });
});
after(async () => {
  if (typeof nav !== "string") await nav?.browser.close();
});

async function abrir(t: import("node:test").TestContext) {
  if (typeof nav === "string") {
    t.skip(nav);
    return null;
  }
  const contexto = await nav.browser.newContext({ viewport: { width: 390, height: 844 }, locale: "es-AR" });
  const page = await contexto.newPage();
  const errores: string[] = [];
  page.on("pageerror", (e) => errores.push(e.message));
  await page.setContent(paginaRenglon(nav));
  await page.evaluate(() => (window as unknown as { montar: () => void }).montar());
  t.after(() => contexto.close());
  return { page, errores };
}

type Pagina = NonNullable<Awaited<ReturnType<typeof abrir>>>["page"];

/** Lleva la perilla `hasta` (0 a 1) de su recorrido y suelta. */
async function deslizar(page: Pagina, hasta: number) {
  const perilla = page.getByRole("slider");
  const pista = perilla.locator("..");
  const p = (await perilla.boundingBox())!;
  const q = (await pista.boundingBox())!;
  const x0 = p.x + p.width / 2;
  const y = p.y + p.height / 2;
  await page.mouse.move(x0, y);
  await page.mouse.down();
  const destino = x0 + (q.x + q.width - p.width / 2 - x0) * hasta;
  for (let i = 1; i <= 8; i++) await page.mouse.move(x0 + ((destino - x0) * i) / 8, y);
  await page.mouse.up();
}

async function medir(page: Pagina) {
  return page.evaluate(() => ({
    ancho: document.documentElement.scrollWidth,
    chicos: [...document.querySelectorAll("button, [role=slider]")]
      .map((b) => ({ t: (b.getAttribute("aria-label") ?? b.textContent ?? "").trim().slice(0, 30), h: Math.round(b.getBoundingClientRect().height) }))
      .filter((b) => b.h > 0 && b.h < 44),
  }));
}

test("tres toques: abrir (a quién y cuánto), «Emitir esta factura», deslizar → UNA emisión de ESA", async (t) => {
  const a = await abrir(t);
  if (!a) return;
  const { page, errores } = a;
  const fila = page.getByRole("button", { name: /Torta de chocolate/ });
  assert.equal(await fila.getAttribute("aria-expanded"), "false");
  assert.match(await fila.innerText(), /Mercado Pago · Ana Pérez/);

  await fila.click(); // 1
  assert.equal(await fila.getAttribute("aria-expanded"), "true");
  await page.getByText(/Factura a Consumidor final por \$\s?25\.000/).waitFor();
  await page.getByText(/sale de prueba/).waitFor();
  await page.getByRole("button", { name: "Emitir esta factura" }).click(); // 2

  // Sin llegar al final no pasa nada.
  await deslizar(page, 0.5);
  await page.waitForTimeout(150);
  assert.deepEqual(await page.evaluate(() => (window as unknown as { __emitidas: unknown[] }).__emitidas), []);

  const m = await medir(page);
  assert.ok(m.ancho <= 390, `desborda: ${m.ancho}px`);
  assert.deepEqual(m.chicos, []);

  await deslizar(page, 1); // 3
  await page.getByText("Factura emitida.").waitFor();
  assert.deepEqual(await page.evaluate(() => (window as unknown as { __emitidas: string[][] }).__emitidas), [["mp1"]]);
  assert.equal(await page.getByRole("slider").count(), 0, "emitida: la perilla no queda armada");
  assert.deepEqual(errores, []);
});

test("ya facturada por otro camino: se informa como atada, no como error", async (t) => {
  const a = await abrir(t);
  if (!a) return;
  const { page } = a;
  await page.evaluate(() => ((window as unknown as { __respuesta: string }).__respuesta = "ya"));
  await page.getByRole("button", { name: /Torta de chocolate/ }).click();
  await page.getByRole("button", { name: "Emitir esta factura" }).click();
  await deslizar(page, 1);
  await page.getByText(/ya estaba facturado: quedó atado/).waitFor();
  assert.equal(await page.getByRole("alert").count(), 0);
});

test("«No es una venta» y «Mejor no»: cada renglón manda lo suyo", async (t) => {
  const a = await abrir(t);
  if (!a) return;
  const { page } = a;
  await page.getByRole("button", { name: /TRANSF RECIBIDA/ }).click();
  assert.match(await page.getByRole("button", { name: /TRANSF RECIBIDA/ }).innerText(), /Banco/);
  await page.getByRole("button", { name: "Emitir esta factura" }).click();
  await page.getByRole("button", { name: "Mejor no" }).click();
  assert.equal(await page.getByRole("slider").count(), 0);
  await page.getByRole("button", { name: "No es una venta" }).click();
  await page.getByText("Marcada como no facturable.").waitFor();
  const v = await page.evaluate(() => ({
    no: (window as unknown as { __noVenta: string[] }).__noVenta,
    em: (window as unknown as { __emitidas: unknown[] }).__emitidas.length,
  }));
  assert.deepEqual(v, { no: ["bc1"], em: 0 });
  if (process.env.CAPTURAS_MP) await page.screenshot({ path: `${process.env.CAPTURAS_MP}/tres-toques.png`, fullPage: true });
});
