// ============================================================================
// La lista en el celular, en un navegador de verdad: el renglón vacío de la Tabla y el buscador
// de la lista de negocios de la consola.
// ============================================================================
//
// Dos defectos del recorrido del 25/09 a 390 px:
//  1. El renglón vacío de cualquier Tabla («No hay nada con estos filtros») salía una palabra por
//     renglón: en el celular la fila es una grilla de tres columnas y el td caía en la primera,
//     de ancho 0 (Tabla.tsx, renglón `data-parte="vacio"`).
//  2. En la consola del operador a 390 no había cómo buscar un negocio desde la lista: el campo
//     de la cabecera es de la PC. TablaNegocios con `buscador` trae su campo arriba de la lista.
//
// Mismo molde que caja-renglon.test.ts: el componente real armado con esbuild, el CSS real de la
// app (Tailwind + public/diseno/renglon.css) y el Chromium de Playwright. Sin servidor: la página
// se sirve con page.route desde un origen inventado, así el GET del formulario se puede leer.

import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { Browser, Page } from "playwright";
import { paginaRenglon, prepararNavegador } from "@/test/navegador-componentes";
import type { FilaNegocio } from "./TablaNegocios";

const ORIGEN = "http://consola.prueba";

const ENTRADA = `
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { Tabla } from "@/components/ui/Tabla";
import TablaNegocios from "@/app/operador/(console)/TablaNegocios";
window.__tablaVacia = (seleccion) => {
  const columnas = [
    { clave: "nombre", titulo: "Cliente", movil: "asunto", celda: (f) => f.nombre },
    { clave: "saldo", titulo: "Saldo", movil: "plata", celda: (f) => f.saldo },
    { clave: "tel", titulo: "Teléfono", movil: "detalle", celda: (f) => f.tel },
  ];
  createRoot(document.getElementById("root")).render(
    createElement(Tabla, { titulo: "Clientes", filas: [], clave: (f) => f.id, columnas, seleccion, teclado: false,
      vacio: "Nadie coincide con lo que buscaste. Probá con otro nombre o borrá el filtro." }),
  );
};
window.__negocios = (filas, buscador) => {
  createRoot(document.getElementById("root")).render(
    createElement(TablaNegocios, { filas, total: filas.length, vacio: "Todavía no hay negocios.", buscador: buscador ?? undefined }),
  );
};
`;

type Ventana = { __tablaVacia: (seleccion: boolean) => void; __negocios: (filas: FilaNegocio[], buscador: unknown) => void };

const fila = (id: string, nombre: string, subdominio: string | null, rubro: string): FilaNegocio => ({
  id,
  nombre,
  slug: id,
  subdominio,
  papel: null,
  estado: { texto: "En prueba", marca: "info" },
  plan: { texto: "Comerciante", nota: null },
  rubro,
  personas: 2,
  listo: { hechos: 3, total: 5, pasos: ["Datos", "Marca", "Fiscal", "Apps", "Personas"], pendientes: 2 },
  actividad: 12,
  conCandado: false,
});
// Los cuatro negocios de la base, con sus nombres de siempre.
const NEGOCIOS: FilaNegocio[] = [
  fila("beauty-spa", "CH Estética", "chestetica", "Estética"),
  fila("magra", "MAGRA", "magra", "Carnicería"),
  fila("shinevelas", "Shine Velas", null, "Velas y aromas"),
  fila("adosmanos", "A Dos Manos Pádel", null, "Pádel"),
];

describe("La lista en el celular, en el navegador", { timeout: 180_000 }, () => {
  let browser: Browser | null = null;
  let bundle = "";
  let css = "";
  let sinNavegador = "";

  before(async () => {
    const n = await prepararNavegador(ENTRADA, { ruta: "/operador" });
    if (typeof n === "string") {
      sinNavegador = n;
      return;
    }
    ({ browser, bundle, css } = n);
  });

  after(async () => {
    await browser?.close();
  });

  /** Abre la página en ORIGEN; cada GET que no sea la página misma queda anotado en `pedidos`. */
  async function abrir(ancho: number): Promise<{ page: Page; errores: string[]; pedidos: string[] }> {
    const movil = ancho < 600;
    const page = await browser!.newPage({ viewport: { width: ancho, height: movil ? 915 : 900 }, deviceScaleFactor: movil ? 2 : 1, locale: "es-AR" });
    const errores: string[] = [];
    const pedidos: string[] = [];
    page.on("pageerror", (e) => errores.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") errores.push(m.text());
    });
    const html = paginaRenglon({ bundle, css });
    await page.route(`${ORIGEN}/**`, (r) => {
      const url = r.request().url();
      if (url !== `${ORIGEN}/inicio`) pedidos.push(url.slice(ORIGEN.length));
      return r.fulfill({ contentType: "text/html", body: html });
    });
    await page.goto(`${ORIGEN}/inicio`);
    return { page, errores, pedidos };
  }

  /** Ancho de la celda vacía, de la tabla y cuántas líneas ocupa el texto. */
  async function medirVacio(page: Page) {
    return page.evaluate(() => {
      const td = document.querySelector('tr[data-parte="vacio"] > td') as HTMLElement;
      const tabla = document.querySelector("table") as HTMLElement;
      const tr = td.parentElement as HTMLElement;
      // Las líneas del texto: una caja por renglón en el rango que cubre la celda.
      const rango = document.createRange();
      rango.selectNodeContents(td);
      const lineas = new Set([...rango.getClientRects()].filter((r) => r.width > 0).map((r) => Math.round(r.top))).size;
      return {
        td: td.getBoundingClientRect().width,
        tabla: tabla.getBoundingClientRect().width,
        lineas,
        displayFila: getComputedStyle(tr).display,
      };
    });
  }

  test("en el celular, el renglón vacío ocupa todo el ancho (con y sin casillas)", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    for (const seleccion of [false, true]) {
      const { page, errores } = await abrir(390);
      await page.evaluate((s) => (window as unknown as Ventana).__tablaVacia(s), seleccion);
      await page.getByText(/Nadie coincide/).waitFor();
      const m = await medirVacio(page);
      // Que sea de verdad la vista de celular (la fila es grilla), si no la prueba no prueba nada.
      assert.equal(m.displayFila, "grid", "no se aplicó el CSS del celular");
      assert.ok(m.td >= m.tabla * 0.9, `con casillas=${seleccion}: la celda mide ${m.td} px de ${m.tabla}`);
      assert.ok(m.lineas <= 3, `con casillas=${seleccion}: el texto ocupa ${m.lineas} líneas`);
      // La causa, a la vista: sin la regla, la celda cae en la primera columna.
      await page.evaluate(() => document.querySelector('tr[data-parte="vacio"] > td')!.removeAttribute("style"));
      const sin = await medirVacio(page);
      assert.ok(sin.td < m.tabla * 0.5, `sin gridColumn la celda mediría ${sin.td} px: la prueba no ve el defecto`);
      assert.deepEqual(errores, []);
      await page.close();
    }
  });

  test("en la PC el renglón vacío sigue siendo una celda de tabla a lo ancho", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const { page, errores } = await abrir(1440);
    await page.evaluate(() => (window as unknown as Ventana).__tablaVacia(false));
    await page.getByText(/Nadie coincide/).waitFor();
    const m = await medirVacio(page);
    assert.notEqual(m.displayFila, "grid");
    assert.ok(m.td >= m.tabla * 0.95, `la celda mide ${m.td} px de ${m.tabla}`);
    assert.equal(m.lineas, 1);
    assert.deepEqual(errores, []);
    await page.close();
  });

  test("consola a 390: se busca un negocio desde la lista, mientras se escribe y con Enter", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const { page, errores, pedidos } = await abrir(390);
    await page.evaluate((f) => (window as unknown as Ventana).__negocios(f, { q: "", vista: "prueba", orden: "-actividad" }), NEGOCIOS);
    const campo = page.getByPlaceholder("Buscar un negocio");
    await campo.waitFor();
    assert.equal(await campo.count(), 1);
    assert.ok(await campo.isVisible(), "el campo no se ve en el celular");
    const caja = (await campo.boundingBox())!;
    assert.ok(caja.height >= 44, `el campo mide ${caja.height} px de alto`);
    assert.ok(caja.width >= 250, `el campo mide ${caja.width} px de ancho`);
    // La lupa de la barra del celular lleva a #buscar-negocio: tiene que ser este formulario.
    assert.equal(await page.locator("#buscar-negocio").count(), 1);
    assert.ok(await page.getByText("4 de 4 negocios").isVisible());

    // Mientras se escribe: sin mayúsculas ni acentos, por nombre o link.
    await campo.click();
    await page.keyboard.type("estetica");
    await page.getByText("1 de 4 negocios").waitFor();
    const nombres = await page.locator('td[data-movil="asunto"] a').allInnerTexts();
    assert.deepEqual(nombres, ["CH Estética"]);

    // Nada coincide: dice qué hacer, a lo ancho.
    await campo.fill("zzz");
    await page.getByText(/Ningún negocio de esta lista coincide con «zzz»/).waitFor();
    const m = await medirVacio(page);
    assert.ok(m.td >= m.tabla * 0.9, `el aviso mide ${m.td} px de ${m.tabla}`);

    // Enter: el GET de siempre, conservando la vista y el orden.
    await campo.fill("magra");
    await Promise.all([page.waitForURL(/\/operador\?/), campo.press("Enter")]);
    const pedido = new URL(pedidos.at(-1)!, ORIGEN);
    assert.equal(pedido.pathname, "/operador");
    assert.equal(pedido.searchParams.get("q"), "magra");
    assert.equal(pedido.searchParams.get("estado"), "prueba");
    assert.equal(pedido.searchParams.get("orden"), "-actividad");
    assert.deepEqual(errores, []);
    await page.close();
  });

  test("consola en la PC: el buscador de la lista no aparece (está en la cabecera) y sin `buscador` no cambia nada", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const { page, errores } = await abrir(1440);
    await page.evaluate((f) => (window as unknown as Ventana).__negocios(f, { q: "", vista: null, orden: null }), NEGOCIOS);
    await page.getByText("4 de 4 negocios").waitFor();
    assert.equal(await page.getByPlaceholder("Buscar un negocio").isVisible(), false);
    await page.close();

    const otra = await abrir(390);
    await otra.page.evaluate((f) => (window as unknown as Ventana).__negocios(f, null), NEGOCIOS);
    await otra.page.getByText("4 de 4 negocios").waitFor();
    assert.equal(await otra.page.getByPlaceholder("Buscar un negocio").count(), 0);
    assert.equal(await otra.page.locator("#buscar-negocio").count(), 0);
    assert.deepEqual([...errores, ...otra.errores], []);
    await otra.page.close();
  });
});
