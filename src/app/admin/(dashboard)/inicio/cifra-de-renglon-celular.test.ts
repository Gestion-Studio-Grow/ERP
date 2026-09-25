// ============================================================================
// La página de un espacio («Números del negocio») en el celular, en un navegador de verdad.
// ============================================================================
//
// Defecto del recorrido del 25/09 a 390 px: los nombres de las apps salían cortados («Rep…»,
// «Ingres…»). Causa medida: en el celular la columna de la cifra es `auto` y se estiraba hasta el
// largo de la frase de la caja («Cerrada · el efectivo va al libro, sin turno»), y el nombre se
// quedaba con lo que sobraba. CifraDeRenglon le pone tope a la cifra en el celular.
//
// Se monta el mismo renglón que dibuja la página del espacio (InicioRenglon.tsx, PaginaDelEspacio):
// Renglon con ícono, nombre, descripción, la cifra real de CifraDeRenglon y la tecla «Abrir».

import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { Browser, Page } from "playwright";
import type { ResultadoKpi } from "@/apps/kpis/nucleo.server";
import { paginaRenglon, prepararNavegador } from "@/test/navegador-componentes";

const ENTRADA = `
import { createElement as h } from "react";
import { createRoot } from "react-dom/client";
import { Renglon } from "@/components/ui/Renglon";
import { CifraDeRenglon } from "@/app/admin/(dashboard)/inicio/CifraDeRenglon";
window.__espacio = (renglones) => {
  createRoot(document.getElementById("root")).render(
    h("main", { "data-ui": "pagina", className: "mx-auto w-full px-4 py-6" },
      h("ol", { style: { "--col-plata": "17rem" } },
        renglones.map((x) => h(Renglon, {
          key: x.nombre, as: "li",
          folio: h("span", { style: { display: "inline-block", width: 24, height: 24 } }),
          titulo: x.nombre, detalle: x.descripcion,
          plata: h(CifraDeRenglon, { r: x.r }),
          tecla: h("a", { href: "/admin/x", "data-ui": "button", "data-variant": "outline", "data-size": "sm", className: "inline-flex items-center" }, "Abrir"),
        })),
      ),
    ),
  );
};
`;

type Caso = { nombre: string; descripcion: string; r: ResultadoKpi };
type Ventana = { __espacio: (renglones: Caso[]) => void };
type Medida = { fila: number; asunto: number; plata: number; tituloCortado: boolean; detalleCortado: boolean; lineasTitulo: number; columnas: number };

const MEDIR = `[...document.querySelectorAll('[data-ui="renglon"]')].map((fila) => {
  const parte = (p) => fila.querySelector('[data-parte="' + p + '"]');
  const cortado = (el) => el.scrollWidth > el.clientWidth + 1;
  const lineas = (el) => Math.round(el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight));
  return {
    fila: fila.getBoundingClientRect().width,
    asunto: parte("asunto").getBoundingClientRect().width,
    plata: parte("plata").getBoundingClientRect().width,
    tituloCortado: cortado(parte("titulo")),
    detalleCortado: cortado(parte("detalle")),
    lineasTitulo: lineas(parte("titulo")),
    columnas: getComputedStyle(fila).gridTemplateColumns.split(" ").length,
  };
})`;

// Los de «Números del negocio» (src/apps/espacios.ts), con los textos que dan los números de verdad.
const CASOS: Caso[] = [
  // finanzas.server.ts: la caja cerrada. Es la frase que se comía el renglón.
  { nombre: "Reportes", descripcion: "Ingresos, ventas y rendimiento del negocio.", r: { estado: "ok", valor: "Cerrada", detalle: "el efectivo va al libro, sin turno" } },
  { nombre: "Resultado del mes", descripcion: "Lo que entró, lo que salió y lo que quedó.", r: { estado: "ok", valor: "$ 1.250.000", monto: "1250000", detalle: "a mitad de mes" } },
  // Un motivo real de los números (kpis/*.server.ts): «Todavía no subiste el extracto del banco de…».
  { nombre: "Flujo de fondos", descripcion: "La plata que entra y sale, semana por semana.", r: { estado: "sin-dato", motivo: "Todavía no subiste el extracto del banco de septiembre" } },
];

describe("Números del negocio en el celular, en el navegador", { timeout: 180_000 }, () => {
  let browser: Browser | null = null;
  let bundle = "";
  let css = "";
  let sinNavegador = "";

  before(async () => {
    const n = await prepararNavegador(ENTRADA, { ruta: "/admin" });
    if (typeof n === "string") {
      sinNavegador = n;
      return;
    }
    ({ browser, bundle, css } = n);
  });

  after(async () => {
    await browser?.close();
  });

  async function abrir(ancho: number): Promise<{ page: Page; errores: string[] }> {
    const movil = ancho < 600;
    const page = await browser!.newPage({ viewport: { width: ancho, height: 900 }, deviceScaleFactor: movil ? 2 : 1, locale: "es-AR" });
    const errores: string[] = [];
    page.on("pageerror", (e) => errores.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") errores.push(m.text());
    });
    await page.setContent(paginaRenglon({ bundle, css }));
    await page.evaluate((c) => (window as unknown as Ventana).__espacio(c), CASOS);
    await page.getByText("Reportes").waitFor();
    return { page, errores };
  }

  /** Por renglón: ancho de la fila, del nombre y de la cifra; si el nombre o la descripción quedan cortados. */
  async function medir(page: Page): Promise<Medida[]> {
    // Como texto: tsx le agrega `__name(...)` a las funciones con nombre y en la página no existe.
    return page.evaluate(MEDIR) as Promise<Medida[]>;
  }

  test("a 390 px el nombre de la app entra entero y ocupa al menos la mitad del renglón", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const { page, errores } = await abrir(390);
    const filas = await medir(page);
    for (const [i, m] of filas.entries()) {
      const nombre = CASOS[i].nombre;
      // Que sea la vista de celular (dos columnas), si no la prueba no prueba nada.
      assert.equal(m.columnas, 2, `${nombre}: no se aplicó el CSS del celular`);
      assert.ok(m.asunto >= m.fila * 0.45, `${nombre}: el nombre tiene ${m.asunto} px de ${m.fila}`);
      assert.equal(m.tituloCortado, false, `${nombre}: el nombre sale cortado`);
      assert.equal(m.detalleCortado, false, `${nombre}: la descripción sale cortada`);
      assert.equal(m.lineasTitulo, 1, `${nombre}: el nombre se parte en ${m.lineasTitulo} líneas`);
    }
    // La causa, a la vista: sin el tope, la frase de la caja vuelve a comerse el renglón.
    await page.addStyleTag({ content: '[data-parte="plata"] > * { max-width: none !important; }' });
    const sin = await medir(page);
    // El peor es el motivo largo («Todavía no subiste el extracto…»): medido, el nombre bajaba a menos de 100 px
    // y una palabra más larga que eso sale con puntos suspensivos («Rep…»).
    const peor = Math.min(...sin.map((m) => m.asunto / m.fila));
    assert.ok(peor < 0.45, `sin el tope el nombre tendría el ${Math.round(peor * 100)} % del renglón: la prueba no ve el defecto`);
    assert.deepEqual(errores, []);
    await page.close();
  });

  test("en la PC la cifra usa su columna de siempre y el nombre va en una línea", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const { page, errores } = await abrir(1440);
    const filas = await medir(page);
    for (const [i, m] of filas.entries()) {
      const nombre = CASOS[i].nombre;
      assert.equal(m.columnas, 4, `${nombre}: no es la grilla de la PC`);
      // 17rem = 272 px: la columna de la página, sin el tope del celular.
      assert.ok(Math.abs(m.plata - 272) <= 1, `${nombre}: la cifra mide ${m.plata} px`);
      assert.equal(m.tituloCortado, false, `${nombre}: el nombre sale cortado`);
    }
    assert.deepEqual(errores, []);
    await page.close();
  });
});
