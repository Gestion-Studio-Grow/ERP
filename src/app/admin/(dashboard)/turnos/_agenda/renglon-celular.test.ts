// El renglón de la agenda a 390 px, con el CSS real (U11, U12): el estado se lee entero y toda la fila abre el turno.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { Browser, Page } from "playwright";
import { paginaRenglon, prepararNavegador } from "@/test/navegador-componentes";

const ENTRADA = `
import { createElement as h } from "react";
import { createRoot } from "react-dom/client";
import { Renglon } from "@/components/ui/Renglon";
import { Marca } from "@/components/ui/Marca";
window.__abiertos = 0;
window.__tecla = 0;
createRoot(document.getElementById("root")).render(
  h("ol", null, h(Renglon, {
    as: "li",
    folio: "09:30",
    titulo: h("button", { type: "button", "data-abrir": true, onClick: () => { window.__abiertos += 1; }, className: "min-h-11 text-left" }, "Gina Nueva"),
    detalle: h("span", null, "Masaje descontracturante · 60′ · Laura Gómez · Box 1 ", h(Marca, { tipo: "pendiente", className: "ml-1 align-baseline" }, "Reservado, sin confirmar")),
    plata: "$15.000",
    tecla: h("button", { type: "button", onClick: () => { window.__tecla += 1; }, style: { minHeight: 44, minWidth: 230 } }, "Confirmar"),
  })),
);
`;

type Ventana = { __abiertos: number; __tecla: number };

describe("El renglón de la agenda a 390 px", { timeout: 120_000 }, () => {
  let browser: Browser | null = null;
  let page: Page | null = null;
  let sinNavegador = "";

  before(async () => {
    const r = await prepararNavegador(ENTRADA);
    if (typeof r === "string") {
      sinNavegador = r;
      return;
    }
    browser = r.browser;
    page = await r.browser.newPage({ viewport: { width: 390, height: 844 }, locale: "es-AR" });
    await page.setContent(paginaRenglon({ bundle: r.bundle, css: r.css }));
    await page.locator('[data-ui="renglon"]').waitFor();
  });

  after(async () => {
    await browser?.close();
  });

  test("el estado se lee entero, sin cortarse contra la tecla (U11)", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const medida = await page!.evaluate(() => {
      const marca = document.querySelector('[data-ui="marca"]')!.getBoundingClientRect();
      const detalle = document.querySelector('[data-parte="detalle"]')!.getBoundingClientRect();
      return { marca: marca.right, detalle: detalle.right };
    });
    assert.ok(medida.marca <= medida.detalle + 0.5, `la marca termina en ${medida.marca}, el detalle en ${medida.detalle}`);
  });

  test("tocar el servicio abre el turno; la tecla sigue siendo la tecla (U12)", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    // Con el mouse de la prueba y no con locator.click: el botón estirado queda encima, que es justo lo que se prueba.
    for (const parte of ["detalle", "folio"]) {
      const caja = (await page!.locator(`[data-parte="${parte}"]`).boundingBox())!;
      await page!.mouse.click(caja.x + 10, caja.y + 6);
    }
    assert.equal(await page!.evaluate(() => (window as unknown as Ventana).__abiertos), 2);
    await page!.getByRole("button", { name: "Confirmar" }).click();
    const v = await page!.evaluate(() => ({ a: (window as unknown as Ventana).__abiertos, t: (window as unknown as Ventana).__tecla }));
    assert.deepEqual(v, { a: 2, t: 1 });
  });
});
