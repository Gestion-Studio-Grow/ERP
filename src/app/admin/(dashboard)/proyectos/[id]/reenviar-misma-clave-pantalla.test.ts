// ============================================================================
// MIA-205 · 2: el sí al aviso del cobro igual reenvía la MISMA clave, en un Chromium de verdad.
// ============================================================================
//
// La ficha es de servidor: al avisar «cobro igual», `marcarCuota` refresca y el `envio` oculto vuelve con otra clave
// (un `randomUUID()` por render). `FormAccion` real; el refresco se simula re-renderizando con otro `envio`. El botón del
// sí tiene que mandar la clave del pedido que pidió el sí (`acciones-ficha.ts`, comentario de MIA-203), con `confirmaRepetido=1`.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { paginaRenglon, prepararNavegador, type Navegador } from "@/test/navegador-componentes";

const ENTRADA = `
import { createRoot } from "react-dom/client";
import { createElement, useState } from "react";
import { FormAccion } from "@/app/admin/(dashboard)/proyectos/[id]/_cliente";
window.__envios = [];
function Ficha() {
  const [n, setN] = useState(0);
  const accion = async (fd) => {
    window.__envios.push({ envio: fd.get("envio"), confirma: fd.get("confirmaRepetido") });
    setN((x) => x + 1); // el refresco de la ficha: el servidor vuelve a pintar el formulario con otro envio
    return window.__envios.length === 1 ? { ok: false, error: "Ya entró un cobro igual hace instantes. ¿Es otro?", reenviar: "Sí, es otro cobro" } : { ok: true };
  };
  return createElement(FormAccion, { accion },
    createElement("input", { type: "hidden", name: "envio", value: "clave-" + n }),
    createElement("button", { type: "submit" }, "Marcar cobrado"));
}
window.montar = () => createRoot(document.getElementById("root")).render(createElement(Ficha));
// MIA-208 · 2: la misma ficha con el monto, el medio y la casilla del sí (\`confirmar\`) a la vista.
window.__envios2 = [];
function FichaConMonto({ conCasilla }) {
  const accion = async (fd) => {
    window.__envios2.push({ envio: fd.get("envio"), confirma: fd.get("confirmaRepetido"), monto: fd.get("monto"), medio: fd.get("medio") });
    if (window.__envios2.length > 1) return { ok: true };
    return conCasilla
      ? { ok: false, error: "Ya entró un cobro igual hace instantes.", confirmar: "Sí, es otro cobro" }
      : { ok: false, error: "Ya entró un cobro igual hace instantes. ¿Es otro?", reenviar: "Sí, es otro cobro" };
  };
  return createElement(FormAccion, { accion },
    createElement("input", { type: "hidden", name: "envio", value: "clave-0" }),
    createElement("select", { name: "medio", "aria-label": "Medio", defaultValue: "TRANSFERENCIA" },
      createElement("option", { value: "TRANSFERENCIA" }, "Transferencia"),
      createElement("option", { value: "EFECTIVO" }, "Efectivo")),
    createElement("input", { name: "monto", "aria-label": "Monto" }),
    createElement("button", { type: "submit" }, "Marcar cobrado"));
}
window.montar2 = (conCasilla) => createRoot(document.getElementById("root")).render(createElement(FichaConMonto, { conCasilla }));
`;

const ACCIONES_FALSAS = "export const guardarCarpeta = async () => ({ ok: true }); export const moverProyecto = async () => ({ ok: true });";

let nav: Navegador | string;
before(async () => {
  nav = await prepararNavegador(ENTRADA, { ruta: "/admin/proyectos/p1", modulos: { "@/lib/proyectos/acciones-ficha": ACCIONES_FALSAS } });
});
after(async () => {
  if (typeof nav !== "string") await nav?.browser.close();
});

test("MIA-205 · 2: el sí del cobro igual reenvía la misma clave aunque la ficha se refresque con otra", async (t) => {
  if (typeof nav === "string") return t.skip(nav);
  const contexto = await nav.browser.newContext({ viewport: { width: 390, height: 844 }, locale: "es-AR" });
  t.after(() => contexto.close());
  const page = await contexto.newPage();
  const errores: string[] = [];
  page.on("pageerror", (e) => errores.push(e.message));
  await page.setContent(paginaRenglon(nav));
  await page.evaluate(() => (window as unknown as { montar: () => void }).montar());
  await page.getByRole("button", { name: "Marcar cobrado" }).click();
  await page.getByRole("alert").filter({ hasText: "cobro igual" }).waitFor();
  assert.equal(await page.locator('input[name="envio"]').inputValue(), "clave-1", "la ficha se refrescó con otra clave");
  await page.getByRole("button", { name: "Sí, es otro cobro" }).click();
  await page.getByRole("button", { name: "Sí, es otro cobro" }).waitFor({ state: "detached" });
  const envios = await page.evaluate(() => (window as unknown as { __envios: unknown[] }).__envios);
  assert.deepEqual(envios, [{ envio: "clave-0", confirma: null }, { envio: "clave-0", confirma: "1" }], "el sí va con la clave del pedido que lo pidió");
  assert.deepEqual(errores, []);
});

for (const [cambio, hacer] of [
  ["el monto", (page: import("playwright").Page) => page.getByRole("textbox", { name: "Monto" }).fill("500")],
  ["el medio", (page: import("playwright").Page) => page.getByRole("combobox", { name: "Medio" }).selectOption("EFECTIVO")],
] as const) {
  test(`MIA-208 · 2: cambiar ${cambio} después del aviso «¿Es otro?» borra el sí viejo; el próximo envío vuelve a preguntar`, async (t) => {
    if (typeof nav === "string") return t.skip(nav);
    const contexto = await nav.browser.newContext({ viewport: { width: 390, height: 844 }, locale: "es-AR" });
    t.after(() => contexto.close());
    const page = await contexto.newPage();
    const errores: string[] = [];
    page.on("pageerror", (e) => errores.push(e.message));
    await page.setContent(paginaRenglon(nav));
    await page.evaluate(() => (window as unknown as { montar2: (c: boolean) => void }).montar2(false));
    await page.getByRole("textbox", { name: "Monto" }).fill("1000");
    await page.getByRole("button", { name: "Marcar cobrado" }).click();
    const si = page.getByRole("button", { name: "Sí, es otro cobro" });
    await si.waitFor();
    await hacer(page);
    await si.waitFor({ state: "detached", timeout: 2_000 });
    assert.equal(await page.getByRole("alert").count(), 0, "el aviso viejo se va con el sí");
    await page.getByRole("button", { name: "Marcar cobrado" }).click();
    await page.waitForFunction(() => (window as unknown as { __envios2: unknown[] }).__envios2.length === 2);
    const envios = await page.evaluate(() => (window as unknown as { __envios2: Array<{ confirma: unknown }> }).__envios2);
    assert.equal(envios[1].confirma, null, "el envío con el form cambiado no lleva el sí viejo");
    assert.deepEqual(errores, []);
    await page.evaluate(() => { (window as unknown as { __envios2: unknown[] }).__envios2 = []; });
  });
}

test("MIA-208 · 2: con la casilla del sí, cambiar el monto la saca; tildarla no borra nada", async (t) => {
  if (typeof nav === "string") return t.skip(nav);
  const contexto = await nav.browser.newContext({ viewport: { width: 390, height: 844 }, locale: "es-AR" });
  t.after(() => contexto.close());
  const page = await contexto.newPage();
  await page.setContent(paginaRenglon(nav));
  await page.evaluate(() => { (window as unknown as { __envios2: unknown[] }).__envios2 = []; (window as unknown as { montar2: (c: boolean) => void }).montar2(true); });
  await page.getByRole("textbox", { name: "Monto" }).fill("1000");
  await page.getByRole("button", { name: "Marcar cobrado" }).click();
  const casilla = page.getByRole("checkbox", { name: "Sí, es otro cobro" });
  await casilla.check();
  assert.equal(await casilla.isChecked(), true, "tildar el sí no lo borra");
  await page.getByRole("textbox", { name: "Monto" }).fill("500");
  await casilla.waitFor({ state: "detached", timeout: 2_000 });
  await page.getByRole("button", { name: "Marcar cobrado" }).click();
  await page.waitForFunction(() => (window as unknown as { __envios2: unknown[] }).__envios2.length === 2);
  const envios = await page.evaluate(() => (window as unknown as { __envios2: Array<{ confirma: unknown; monto: unknown }> }).__envios2);
  assert.deepEqual([envios[1].confirma, envios[1].monto], [null, "500"]);
});
