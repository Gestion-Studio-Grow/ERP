// En el celular, la consola tiene UN solo buscador de negocios: el de la lista (TablaNegocios,
// filtra mientras se escribe). El formulario viejo de page.tsx (había que tocar «Buscar») quedaba
// duplicado arriba de la lista. La lupa de la cabecera (CabeceraConsola: /operador#buscar-negocio)
// tiene que caer en ese único formulario.
//
// La página es un componente de servidor con base: se verifica sobre la fuente, que es lo que se
// publica. El comportamiento del buscador de la lista lo cubre tabla-negocios-celular.test.ts.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const DIR = join(process.cwd(), "src/app/operador/(console)");
const pagina = readFileSync(join(DIR, "page.tsx"), "utf8");

test("la página de la consola no arma su propio formulario de búsqueda para el celular", () => {
  assert.doesNotMatch(pagina, /id="buscar-negocio"/);
  assert.doesNotMatch(pagina, /id="q-movil"/);
});

test("la lista de negocios recibe la búsqueda, el filtro y el orden actuales", () => {
  const m = pagina.match(/<TablaNegocios[\s\S]*?\/>/);
  assert.ok(m, "no se encontró <TablaNegocios> en page.tsx");
  assert.match(m[0], /buscador=\{\{\s*q,\s*vista,\s*orden\s*\}\}/);
});

test("el único #buscar-negocio es el de la lista", () => {
  const tabla = readFileSync(join(DIR, "TablaNegocios.tsx"), "utf8");
  assert.equal((tabla.match(/id="buscar-negocio"/g) ?? []).length, 1);
});
