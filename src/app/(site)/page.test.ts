// Guarda de regresión (fix C-1, reporte QA 2026-07-06): la landing pública de CH
// (`/`, sin sesión) llamaba a getCatalog() — un loader GATEADO por sesión
// (requireCapability → redirect a /admin/login) pensado para /admin/catalogo.
// Cualquier visitante anónimo disparaba ese redirect: la causa real de que la raíz
// de CH cayera en el login en vez de mostrar la vidriera. El fix movió "profesionales"
// a getPublicBookingData() (loader público). Este test no tiene forma de levantar el
// Server Component completo sin DB, así que blinda la regresión más barata y
// determinística: que la página pública nunca vuelva a importar el módulo de acciones
// del backoffice.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const pageSource = readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "page.tsx"),
  "utf8",
);

test("(site)/page.tsx (landing pública) no importa @/lib/catalog-actions (admin-gated)", () => {
  assert.doesNotMatch(
    pageSource,
    /from ["']@\/lib\/catalog-actions["']/,
    "la landing pública no debe depender de un loader gateado por sesión (requireCapability)",
  );
});

test("(site)/page.tsx usa el loader público getPublicBookingData para profesionales", () => {
  assert.match(pageSource, /getPublicBookingData/);
});
