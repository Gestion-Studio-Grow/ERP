// ============================================================================
// MIA-208 · 2, en Administración › Cuentas: el mismo «sí viejo» que en la ficha (`_cliente.tsx`). El cobro de la cuota
// (`MarcarCuota`, `_controles.tsx`) avisa «¿Es otro?» con un botón que reenvía el form con `confirmaRepetido=1`. Si después
// se cambia el monto, el medio o la retención, el sí ya no responde a lo que hay en pantalla: se tiene que ir con el aviso.
// Chromium de verdad, con las acciones de servidor falsas.
// ============================================================================

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { paginaRenglon, prepararNavegador, type Navegador } from "@/test/navegador-componentes";

const ENTRADA = `
import { createRoot } from "react-dom/client";
import { createElement } from "react";
import { MarcarCuota } from "@/app/admin/(dashboard)/proyectos/administracion/_controles";
// La página de prueba no es un contexto seguro (en HTTPS sí): sin esto, \`crypto.randomUUID\` no existe al abrir el form.
if (!crypto.randomUUID) crypto.randomUUID = () => "envio-" + Math.random().toString(16).slice(2);
window.montar = () => createRoot(document.getElementById("root")).render(
  createElement(MarcarCuota, { id: "c1", deEmpresa: false, etiqueta: "Cobrado", falta: 1000, concepto: "el anticipo" }));
`;

const FICHA_FALSA = `
window.__envios = [];
export const marcarCuota = async (fd) => {
  window.__envios.push({ envio: fd.get("envio"), confirma: fd.get("confirmaRepetido"), monto: fd.get("monto"), medio: fd.get("medio") });
  return window.__envios.length === 1 ? { ok: false, error: "Ya entró un cobro igual hace instantes. ¿Es otro?", reenviar: "Sí, es otro cobro" } : { ok: true };
};
export const tiposDeRetencion = async () => ["Ganancias"];
export const guardarCarpeta = async () => ({ ok: true });
export const moverProyecto = async () => ({ ok: true });
`;
const EMPRESA_FALSA = ["marcarCuotaEmpresa", "editarExtrasLiquidacion", "generarLiquidaciones", "guardarDatoCuota", "importarExtracto", "marcarLiquidacionVista", "pagarLiquidacion"]
  .map((n) => `export const ${n} = async () => ({ ok: true });`)
  .concat("export const cuentasParaMarcar = async () => [];")
  .join("\n");

let nav: Navegador | string;
before(async () => {
  nav = await prepararNavegador(ENTRADA, { ruta: "/admin/proyectos/administracion", modulos: { "@/lib/proyectos/acciones-ficha": FICHA_FALSA, "@/lib/proyectos/acciones-empresa": EMPRESA_FALSA } });
});
after(async () => {
  if (typeof nav !== "string") await nav?.browser.close();
});

type P = import("playwright").Page;
for (const [cambio, hacer] of [
  ["el monto", (page: P) => page.getByRole("textbox", { name: /Monto a cobrar/ }).fill("500")],
  ["el medio", (page: P) => page.getByRole("combobox", { name: "Medio de pago" }).selectOption("EFECTIVO")],
] as const) {
  test(`MIA-208 · 2 (Administración): cambiar ${cambio} después del aviso «¿Es otro?» borra el sí viejo`, async (t) => {
    if (typeof nav === "string") return t.skip(nav);
    const contexto = await nav.browser.newContext({ viewport: { width: 390, height: 844 }, locale: "es-AR" });
    t.after(() => contexto.close());
    const page = await contexto.newPage();
    const errores: string[] = [];
    page.on("pageerror", (e) => errores.push(e.message));
    await page.setContent(paginaRenglon(nav));
    await page.evaluate(() => (window as unknown as { montar: () => void }).montar());
    await page.getByRole("button", { name: "Cobrado" }).click();
    await page.getByRole("textbox", { name: /Monto a cobrar/ }).fill("1000");
    await page.getByRole("button", { name: "Confirmar" }).click();
    const si = page.getByRole("button", { name: "Sí, es otro cobro" });
    await si.waitFor();
    await hacer(page);
    await si.waitFor({ state: "detached", timeout: 2_000 });
    assert.equal(await page.getByRole("alert").count(), 0, "el aviso viejo se va con el sí");
    await page.getByRole("button", { name: "Confirmar" }).click();
    await page.waitForFunction(() => (window as unknown as { __envios: unknown[] }).__envios.length === 2);
    const envios = await page.evaluate(() => (window as unknown as { __envios: Array<{ envio: unknown; confirma: unknown }> }).__envios);
    assert.equal(envios[1].confirma, null, "el envío con el form cambiado no lleva el sí viejo");
    assert.equal(envios[1].envio, envios[0].envio, "la clave del envío es la misma (el servidor vuelve a preguntar si hace falta)");
    assert.deepEqual(errores, []);
    await page.evaluate(() => { (window as unknown as { __envios: unknown[] }).__envios = []; });
  });
}

test("MIA-208 · 2 (Administración): sin cambios, el sí reenvía con confirmaRepetido=1", async (t) => {
  if (typeof nav === "string") return t.skip(nav);
  const contexto = await nav.browser.newContext({ viewport: { width: 390, height: 844 }, locale: "es-AR" });
  t.after(() => contexto.close());
  const page = await contexto.newPage();
  await page.setContent(paginaRenglon(nav));
  await page.evaluate(() => { (window as unknown as { __envios: unknown[] }).__envios = []; (window as unknown as { montar: () => void }).montar(); });
  await page.getByRole("button", { name: "Cobrado" }).click();
  await page.getByRole("button", { name: "Confirmar" }).click();
  await page.getByRole("button", { name: "Sí, es otro cobro" }).click();
  await page.waitForFunction(() => (window as unknown as { __envios: unknown[] }).__envios.length === 2);
  const envios = await page.evaluate(() => (window as unknown as { __envios: Array<{ confirma: unknown }> }).__envios);
  assert.deepEqual(envios.map((e) => e.confirma), [null, "1"]);
});
