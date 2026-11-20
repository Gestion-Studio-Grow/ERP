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
