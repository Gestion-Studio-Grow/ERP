// ============================================================================
// LA PANTALLA DEL CUADERNO Y LA TARJETA SIN SEÑAL — en un Chromium de verdad (Magra, tanda 2 · 2E)
// ============================================================================
//
// Sin servidor: los componentes reales armados con esbuild, el CSS real de la app y una acción falsa
// que anota lo que le mandan (la plata y las reglas se prueban contra Postgres en
// cuaderno-postgres.test.ts). En el celular (390 × 844):
//   · la tarjeta del protocolo aparece SOLA al cortarse la conexión, avisa del cobro sin confirmar
//     de la pestaña, y al volver la señal queda chica con «Cargar ventas del cuaderno»;
//   · «Cargar ventas del cuaderno»: dos ventas con hora, corte, peso y medio → la acción recibe las
//     dos con su clave; cada una muestra su resultado y queda trabada; al recargar la página el
//     borrador vuelve con las MISMAS claves y no hay nada para mandar otra vez;
//   · lo incompleto no se manda y dice qué falta; el día cerrado no deja cargar;
//   · nada desborda a lo ancho y lo que se toca mide ≥ 44 px.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { paginaRenglon, prepararNavegador, type Navegador } from "@/test/navegador-componentes";

const ENTRADA = `
import { createRoot } from "react-dom/client";
import { createElement } from "react";
import ProtocoloSinSenal from "@/app/admin/(dashboard)/vender/ProtocoloSinSenal";
import CargarCuaderno from "@/app/admin/(dashboard)/vender/cuaderno/CargarCuaderno";
const PRODUCTOS = [
  { id: "p_vacio", nombre: "Vacio", porPeso: true, precio: 28600 },
  { id: "p_chorizo", nombre: "Chorizo", porPeso: false, precio: 1900 },
];
window.__llamadas = [];
let code = 40;
async function cargar(ventas) {
  window.__llamadas.push(ventas);
  return { ok: true, resultados: ventas.map((v) => ({ clave: v.clave, estado: "grabada", mensaje: "Venta #" + (++code), venta: { code, total: 1 } })) };
}
window.montarProtocolo = (siempre) => createRoot(document.getElementById("root")).render(createElement(ProtocoloSinSenal, { negocioId: "tnt_a", siempre }));
window.montarCuaderno = (cerradoHasta) => createRoot(document.getElementById("root")).render(
  createElement("main", { className: "mx-auto w-full max-w-3xl px-4 py-6" },
    createElement(CargarCuaderno, { productos: PRODUCTOS, hoy: "2026-10-24", primerDia: "2026-10-22", cerradoHasta, negocioId: "tnt_a", usuarioId: "usr_1", cargar })));
`;

let nav: Navegador | string;
before(async () => {
  nav = await prepararNavegador(ENTRADA);
});
after(async () => {
  if (typeof nav !== "string") await nav?.browser.close();
});

const CELULAR = { width: 390, height: 844 };

async function abrir(t: import("node:test").TestContext) {
  if (typeof nav === "string") {
    t.skip(nav);
    return null;
  }
  const contexto = await nav.browser.newContext({ viewport: CELULAR, locale: "es-AR" });
  const page = await contexto.newPage();
  const errores: string[] = [];
  page.on("pageerror", (e) => errores.push(e.message));
  // Una URL de verdad (con origen) para que localStorage/sessionStorage existan y sobrevivan a recargar.
  const html = paginaRenglon(nav);
  await page.route("http://cuaderno.test/", (r) => r.fulfill({ contentType: "text/html; charset=utf-8", body: html }));
  await page.goto("http://cuaderno.test/");
  return { contexto, page, errores };
}

async function sinDesborde(page: import("playwright").Page) {
  const ancho = await page.evaluate(() => document.documentElement.scrollWidth);
  assert.ok(ancho <= CELULAR.width, `la página mide ${ancho}px a lo ancho`);
}

async function toquesChicos(page: import("playwright").Page): Promise<string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll("button, a, input, [role=combobox]")]
      .filter((el) => !(el as HTMLElement).closest("[aria-hidden=true]") && (el as HTMLElement).offsetParent !== null)
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter(({ r }) => r.height < 44)
      .map(({ el, r }) => `${el.tagName} «${(el.textContent || (el as HTMLInputElement).placeholder || "").trim()}» ${Math.round(r.height)}px`),
  );
}

test("la tarjeta del protocolo: aparece sin señal, avisa del cobro en duda y al volver ofrece cargar el cuaderno", async (t) => {
  const a = await abrir(t);
  if (!a) return;
  const { contexto, page, errores } = a;
  await page.evaluate(() => (window as unknown as { montarProtocolo: (s: boolean) => void }).montarProtocolo(false));
  await page.waitForTimeout(50);
  assert.equal(await page.locator("[data-ui=protocolo-sin-senal]").count(), 0, "con señal, en Vender no ocupa lugar");

  await contexto.setOffline(true);
  const tarjeta = page.locator("[data-ui=protocolo-sin-senal][data-estado=sin-senal]");
  await tarjeta.waitFor();
  assert.match(await tarjeta.innerText(), /Se cortó internet/);
  assert.match(await page.getByRole("alert").first().innerText(), /no se manda al sistema/);
  for (const paso of [/Anotá cada venta en el cuaderno/, /efectivo o con el posnet/, /No prometas Mercado Pago ni transferencia/, /cargá el cuaderno el mismo día/]) {
    assert.match(await tarjeta.innerText(), paso);
  }
  // Vender deja un cobro sin confirmar en la pestaña: la tarjeta lo dice sin recargar.
  await page.evaluate(() => {
    sessionStorage.setItem("gsg:vender:cobro-sin-confirmar:tnt_a", JSON.stringify({ v: 3, usuario: "usr_1", desde: new Date().toISOString() }));
    window.dispatchEvent(new Event("gsg:vender:cobro-sin-confirmar"));
  });
  await page.getByText(/ése no lo anotes en el cuaderno/).waitFor();
  await sinDesborde(page);
  assert.deepEqual(await toquesChicos(page), []);

  await contexto.setOffline(false);
  const volvio = page.locator("[data-ui=protocolo-sin-senal][data-estado=volvio]");
  await volvio.waitFor();
  assert.equal(await volvio.getByRole("link", { name: "Cargar ventas del cuaderno" }).getAttribute("href"), "/admin/vender/cuaderno");
  await volvio.getByRole("button", { name: "No anoté nada" }).click();
  assert.equal(await page.locator("[data-ui=protocolo-sin-senal]").count(), 0);
  assert.deepEqual(errores, []);
  await contexto.close();
});

test("cargar ventas del cuaderno en el celular: dos ventas, su resultado, trabadas, y recargar no las vuelve a mandar", async (t) => {
  const a = await abrir(t);
  if (!a) return;
  const { contexto, page, errores } = a;
  const montar = () => page.evaluate(() => (window as unknown as { montarCuaderno: (c: string | null) => void }).montarCuaderno(null));
  await montar();

  const boton = page.getByRole("button", { name: /^Cargar 1 venta|^No hay ventas/ });
  await boton.waitFor();
  assert.equal(await boton.isDisabled(), true, "sin nada tipeado no hay qué cargar");
  await page.getByRole("button", { name: "Ayer" }).click();

  // Venta 1: 11:20 · Vacío 1,1 kg · Efectivo.
  await page.getByLabel("Hora").first().fill("1120");
  await page.getByRole("combobox", { name: "Corte 1 de la venta 1" }).fill("vac");
  await page.keyboard.press("Enter");
  await page.getByLabel("Peso (kg)").first().fill("1,1");
  await page.getByRole("group", { name: "Cómo pagó la venta 1" }).getByRole("button", { name: "Efectivo" }).click();
  assert.match(await page.locator("ol > li").first().innerText(), /Da\s*\$\s?31\.460/);

  // Venta 2 incompleta → no se manda nada y dice qué falta.
  await page.getByRole("button", { name: "+ Otra venta" }).click();
  await page.getByRole("combobox", { name: "Corte 1 de la venta 2" }).fill("chor");
  await page.keyboard.press("Enter");
  await page.getByLabel("Cantidad").fill("6");
  await page.getByRole("button", { name: "Cargar 2 ventas del 23/10/2026" }).click();
  await page.getByText("Falta la hora (como está en el cuaderno, por ejemplo 11:20).").waitFor();
  assert.equal(await page.evaluate(() => (window as unknown as { __llamadas: unknown[] }).__llamadas.length), 0);

  await page.getByLabel("Hora").nth(1).fill("11:35");
  await page.getByRole("group", { name: "Cómo pagó la venta 2" }).getByRole("button", { name: "Mercado Pago" }).click();
  await sinDesborde(page);
  assert.deepEqual(await toquesChicos(page), []);
  await page.getByRole("button", { name: "Cargar 2 ventas del 23/10/2026" }).click();
  await page.getByText("Las 2 ventas quedaron cargadas con su hora.").waitFor();
  const llamadas = await page.evaluate(() => (window as unknown as { __llamadas: { clave: string; dia: string; hora: string; medio: string; renglones: unknown[] }[][] }).__llamadas);
  assert.equal(llamadas.length, 1);
  assert.deepEqual(
    llamadas[0].map((v) => [v.dia, v.hora, v.medio, v.renglones]),
    [
      ["2026-10-23", "11:20", "EFECTIVO", [{ productId: "p_vacio", cantidad: "1,1" }]],
      ["2026-10-23", "11:35", "MERCADOPAGO", [{ productId: "p_chorizo", cantidad: "6" }]],
    ],
  );
  const claves = llamadas[0].map((v) => v.clave);
  await page.getByText("✓ Venta #41").waitFor();
  assert.equal(await page.getByLabel("Hora").first().isDisabled(), true, "la cargada queda trabada");

  // Recargar: el borrador vuelve con las MISMAS claves y no hay nada pendiente de mandar.
  await page.reload();
  await montar();
  await page.getByText("✓ Venta #42").waitFor();
  const borrador = await page.evaluate(() => JSON.parse(localStorage.getItem("gsg:vender:cuaderno:tnt_a:usr_1") ?? "null"));
  assert.deepEqual(borrador.filas.map((f: { clave: string }) => f.clave), claves);
  assert.equal(await page.getByRole("button", { name: "No hay ventas para cargar" }).isDisabled(), true);
  assert.deepEqual(errores, []);
  await contexto.close();
});

test("con el día cerrado no se puede cargar y se dice por qué", async (t) => {
  const a = await abrir(t);
  if (!a) return;
  const { contexto, page } = a;
  await page.evaluate(() => (window as unknown as { montarCuaderno: (c: string | null) => void }).montarCuaderno("2026-10-23"));
  await page.getByRole("button", { name: "Ayer" }).click();
  await page.getByText(/El 23\/10\/2026 ya está cerrado/).waitFor();
  await page.getByLabel("Hora").first().fill("11:20");
  assert.equal(await page.getByRole("button", { name: /^Cargar|^No hay/ }).isDisabled(), true);
  await page.getByRole("button", { name: "Hoy" }).click();
  assert.equal(await page.getByText(/ya está cerrado/).count(), 0);
  await contexto.close();
});
