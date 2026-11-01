// El 404 de la vidriera, con el «Diseño nuevo» prendido y apagado: en castellano, con el nombre de CADA negocio y un camino de vuelta.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { brandForSlug } from "@/lib/branding";
import { nombreEnLaNoEncontrada, noEncontradaDeLaVidriera } from "../no-encontrada-core";
import HojaNoEncontrada from "./HojaNoEncontrada";

const leer = (f: string) => readFileSync(join(process.cwd(), "src/app/(site)", f), "utf8");

test("las dos páginas del sitio ya no caen en el 404 de Next, en inglés y sin marca", () => {
  for (const f of ["not-found.tsx", "servicios/[id]/not-found.tsx"]) {
    assert.doesNotMatch(leer(f), /builtin\/not-found/, f);
    assert.match(leer(f), /<NoEncontradaDelNegocio/, f);
  }
});

test("cada negocio con su nombre; sin nombre legible, neutro", () => {
  assert.equal(nombreEnLaNoEncontrada(brandForSlug("beauty-spa"), null), "CH Estética");
  assert.equal(nombreEnLaNoEncontrada(brandForSlug("magra"), null), "Magra");
  assert.equal(nombreEnLaNoEncontrada(brandForSlug("taller-agr"), "Taller Mecánico AGR"), "Taller Mecánico AGR");
  for (const nombre of [null, "", "  ", "Mi negocio"]) assert.equal(nombreEnLaNoEncontrada(brandForSlug(null), nombre), null);
});

test("la hoja: en castellano, con «Volver» y sin nada de CH en otro negocio", () => {
  const html = renderToStaticMarkup(
    createElement(HojaNoEncontrada, { nombre: "Magra", titulo: "No encontramos esta página", detalle: "Puede que el enlace esté mal copiado.", enlaces: [{ href: "/", etiqueta: "Volver al inicio" }] }),
  );
  assert.match(html, /Magra/);
  assert.match(html, /No encontramos esta página/);
  assert.match(html, /<a [^>]*href="\/"[^>]*>Volver al inicio<\/a>/);
  for (const fuga of ["CH Estética", "carta", "tratamiento", "could not be found"]) assert.ok(!html.includes(fuga), fuga);
  const neutra = renderToStaticMarkup(createElement(HojaNoEncontrada, { nombre: null, titulo: "No encontramos esta página", detalle: "x", enlaces: [{ href: "/", etiqueta: "Volver" }] }));
  assert.ok(!neutra.includes("Mi negocio"));
});

test("una dirección que no existe: CH prendido o apagado va con su marca; otro negocio, sin el layout de CH", () => {
  assert.equal(noEncontradaDeLaVidriera("beauty-spa", true), "ch-nuevo");
  assert.equal(noEncontradaDeLaVidriera("beauty-spa", false), "ch-de-siempre");
  for (const slug of ["magra", "taller-agr", null]) assert.equal(noEncontradaDeLaVidriera(slug, false), "de-next");
});
