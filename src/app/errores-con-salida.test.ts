// PLAT-005 · «Errores con salida»: ninguna pantalla de error deja a la persona sin un camino.
// - global-error: además de reintentar, un <a href="/"> común (reemplaza el layout: nada de <Link>).
// - error del panel: con el diseño de siempre (CH) ya no relanza al global; muestra su tarjeta con
//   «Probar de nuevo» y «Volver al inicio».
// - /facturita/app: error, loading y not-found propios, y el comodín que manda lo inexistente al 404.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import GlobalError from "./global-error";
import ErrorDelPanel from "./admin/(dashboard)/error";
import ErrorDeFactoque from "./facturita/app/error";
import CargandoFactoque from "./facturita/app/loading";
import NoEncontradaFactoque from "./facturita/app/not-found";

const APP = join(process.cwd(), "src/app");
const nada = () => {};
const error = Object.assign(new Error("interno"), { digest: "abc123" });

test("global-error: reintentar, salida a «/» con <a> común, role=alert y botones de 44 px", () => {
  const html = renderToStaticMarkup(createElement(GlobalError, { error, reset: nada }));
  assert.match(html, /<a [^>]*href="\/"[^>]*>Volver al inicio<\/a>/);
  assert.match(html, />Reintentar<\/button>/);
  assert.match(html, /role="alert"/);
  assert.match(html, /<h1 [^>]*tabindex="-1"/);
  assert.equal((html.match(/min-height:44px/g) ?? []).length, 2);
  assert.doesNotMatch(html, /interno/, "el mensaje interno no se muestra");
  assert.match(html, /abc123/);
});

test("error del panel, diseño de siempre: tarjeta propia (no relanza) con salida al inicio", () => {
  const html = renderToStaticMarkup(createElement(ErrorDelPanel, { error, reset: nada }));
  assert.match(html, /role="alert"/);
  assert.match(html, /<h1 [^>]*tabindex="-1"/);
  assert.match(html, />Probar de nuevo<\/button>/);
  assert.match(html, /<a [^>]*href="\/admin"[^>]*>Volver al inicio<\/a>/);
  assert.match(html, /min-h-11/);
  const fuente = readFileSync(join(APP, "admin/(dashboard)/error.tsx"), "utf8");
  assert.doesNotMatch(fuente, /throw error/);
});

test("/facturita/app tiene error, loading y not-found con export default, y el comodín al 404", () => {
  for (const f of ["error.tsx", "loading.tsx", "not-found.tsx", "[...resto]/page.tsx"]) {
    const ruta = join(APP, "facturita/app", f);
    assert.ok(existsSync(ruta), `falta ${f}`);
    assert.match(readFileSync(ruta, "utf8"), /export default function/, `${f} sin export default`);
  }
  assert.match(readFileSync(join(APP, "facturita/app/error.tsx"), "utf8"), /^"use client";/);
  assert.match(readFileSync(join(APP, "facturita/app/[...resto]/page.tsx"), "utf8"), /notFound\(\)/);
});

test("error de Factoque: role=alert, foco al título, «Probar de nuevo» y «Volver al panel»", () => {
  const html = renderToStaticMarkup(createElement(ErrorDeFactoque, { error, reset: nada }));
  assert.match(html, /role="alert"/);
  assert.match(html, /<h1 [^>]*tabindex="-1"/);
  assert.match(html, /<button [^>]*class="fx-btn"[^>]*>Probar de nuevo<\/button>/);
  assert.match(html, /<a [^>]*href="\/facturita\/app"[^>]*>Volver al panel<\/a>/);
  assert.match(html, /class="fx"/);
  assert.doesNotMatch(html, /interno/);
});

test("loading y not-found de Factoque: esqueleto anunciado y 404 con salida al panel", () => {
  const cargando = renderToStaticMarkup(createElement(CargandoFactoque));
  assert.match(cargando, /role="status"/);
  assert.match(cargando, /aria-busy="true"/);
  assert.match(cargando, /Cargando/);
  const noEsta = renderToStaticMarkup(createElement(NoEncontradaFactoque));
  assert.match(noEsta, /No encontramos esa pantalla/);
  assert.match(noEsta, /href="\/facturita\/app"[^>]*>Volver al panel/);
  assert.doesNotMatch(cargando + noEsta, /\bFacturita\b/);
});
