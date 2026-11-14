// GUARDA (orden del dueño, C12 opción a, 10/11/2026): el logo de un negocio cliente es SÓLO suyo. Ningún tenant muestra
// el isotipo de GSG dentro de su logo, y la marca de agua de GSG nunca va en el panel de un negocio cliente
// (src/components/marca/MarcaDeAgua.tsx: «nunca en las de un negocio cliente»).
// Lo que sí queda, aparte y abajo, es la firma «powered by GSG» (FirmaGSG): el crédito de co-marca del Gate de
// Excelencia (ítem 2). Este test no la toca; frena que el isotipo se cuele en el logo o que la marca de agua se cuele
// en el panel.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import LogoDelNegocio from "./LogoDelNegocio";
import { IsotipoGSG } from "./MarcaGSG";
import { ISOTIPO_GSG, ISOTIPO_GSG_16, ISOTIPO_GSG_32 } from "@/lib/gsg/marca-svg";
import type { EsteticaBackoffice } from "@/lib/estetica-backoffice";

// Todas las estéticas: si se suma una, tsc obliga a sumarla acá (y la guarda la cubre sola).
const ESTETICAS = Object.keys({
  breakpoint: true,
  "beauty-spa": true,
  magra: true,
  matiasconsoli: true,
  "mia-producciones": true,
} satisfies Record<EsteticaBackoffice, true>) as EsteticaBackoffice[];

// Slugs que pasan por el logo real, por el tipográfico provisional y por un local nuevo.
const SLUGS = [null, "shinevelas", "taller-agr", "agr", "quebienoles", "chestetica", "magra", "negocio-nuevo"];

const FORMAS_ISOTIPO = [ISOTIPO_GSG, ISOTIPO_GSG_32, ISOTIPO_GSG_16].map((g) => g.forma);

/** Las huellas de GSG en un HTML: el dibujo del isotipo, la marca de agua o el nombre. */
function huellasDeGsg(html: string): string[] {
  const huellas: string[] = [];
  if (FORMAS_ISOTIPO.some((d) => html.includes(d))) huellas.push("isotipo de GSG");
  if (/data-marca-de-agua|gsg-marca-de-agua/.test(html)) huellas.push("marca de agua de GSG");
  if (/Gesti[oó]n Studio Grow|powered by GSG/i.test(html)) huellas.push("nombre de GSG");
  return huellas;
}

test("el detector reconoce el isotipo de GSG en cualquier tamaño (control positivo)", () => {
  for (const tamano of [14, 16, 24, 32, 36, 64]) {
    assert.deepEqual(huellasDeGsg(renderToStaticMarkup(h(IsotipoGSG, { tamano }))), ["isotipo de GSG"], `isotipo ${tamano}px`);
  }
});

test("ningún logo de negocio lleva el isotipo, la marca de agua ni el nombre de GSG", () => {
  for (const estetica of [...ESTETICAS, null]) {
    for (const slug of SLUGS) {
      const html = renderToStaticMarkup(h(LogoDelNegocio, { estetica, nombre: "Negocio de prueba", slug, monograma: "NP" }));
      assert.deepEqual(huellasDeGsg(html), [], `logo de «${estetica ?? "provisional"}» con slug «${slug}»`);
    }
  }
});

const RAIZ = join(process.cwd(), "src");
const leer = (ruta: string) => readFileSync(join(RAIZ, ruta), "utf8");
const IMPORTA_MARCA_GSG = /from\s+["'](?:@\/components\/marca|\.)\/(?:MarcaGSG|MarcaDeAgua|SelloGSG|FirmaGSG)["']/;

test("el logo del negocio no importa ninguna pieza de la marca de GSG", () => {
  assert.doesNotMatch(leer("components/marca/LogoDelNegocio.tsx"), IMPORTA_MARCA_GSG);
});

function archivosDe(carpeta: string): string[] {
  return readdirSync(carpeta).flatMap((nombre) => {
    const ruta = join(carpeta, nombre);
    if (statSync(ruta).isDirectory()) return archivosDe(ruta);
    return /\.tsx?$/.test(nombre) && !/\.test\.tsx?$/.test(nombre) ? [ruta] : [];
  });
}

test("el panel del negocio no trae la marca de agua ni el isotipo suelto: GSG sólo firma abajo (FirmaGSG)", () => {
  const panel = join(RAIZ, "app", "admin", "(dashboard)");
  const MARCA_SUELTA = /from\s+["']@\/components\/marca\/(?:MarcaGSG|MarcaDeAgua)["']/;
  const conMarcaSuelta = archivosDe(panel).filter((ruta) => MARCA_SUELTA.test(readFileSync(ruta, "utf8")));
  assert.deepEqual(conMarcaSuelta.map((ruta) => ruta.slice(RAIZ.length + 1)), []);
});

test("en el ingreso del panel, la marca de agua sale sólo en un producto de GSG (identidad != null), nunca en un negocio cliente", () => {
  for (const ruta of ["app/admin/login/page.tsx", "app/admin/cambiar-password/page.tsx"]) {
    const fuente = leer(ruta);
    assert.match(fuente, /const marcaDeAgua = identidad != null;/, `${ruta}: la condición del producto`);
    const usos = fuente.match(/[^\n]*<MarcaDeAgua\b/g) ?? [];
    assert.ok(usos.length > 0, `${ruta}: se esperaba la marca de agua detrás de la condición`);
    for (const uso of usos) assert.match(uso, /marcaDeAgua && <MarcaDeAgua\b/, `${ruta}: «${uso.trim()}» sin condición`);
  }
});
