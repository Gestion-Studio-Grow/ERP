// "Perecederos" es un dato del blueprint: lo que decide, en un mostrador, si hay motivos de merma
// de comida fresca, Lotes y vencimientos y Despiece. Estos tests fijan qué rubros lo tienen y
// que la pregunta se contesta desde el rubro RESUELTO del negocio (blueprint, slug o familia).

import { test } from "node:test";
import assert from "node:assert/strict";
import { RETAIL_RUBROS, resolveRubroId, rubroConPerecederos } from "./rubros";

test("venden comida que vence: carnicería, fiambrería, verdulería y dietética; el resto no", () => {
  const conPerecederos = Object.values(RETAIL_RUBROS)
    .filter((r) => r.perecederos)
    .map((r) => r.id)
    .sort();
  assert.deepEqual(conPerecederos, ["carniceria", "dietetica", "fiambreria", "verduleria"]);
});

test("los negocios reales: MAGRA y sus locales sí; Shine (velas), A Dos Manos (pádel) y CH no", () => {
  assert.equal(rubroConPerecederos(resolveRubroId({ slug: "magra", blueprintId: null })), true);
  assert.equal(rubroConPerecederos(resolveRubroId({ slug: "magra-canning", blueprintId: "carniceria" })), true);
  assert.equal(rubroConPerecederos(resolveRubroId({ slug: "shinevelas", blueprintId: null })), false);
  assert.equal(rubroConPerecederos(resolveRubroId({ slug: "adosmanos", blueprintId: "padel" })), false);
  // CH: sin blueprint retail, no es mostrador; no hay rubro que pregunte.
  assert.equal(rubroConPerecederos(resolveRubroId({ slug: "beauty-spa", blueprintId: null })), false);
});

test("rubro desconocido, vacío o de servicios → sin perecederos (no se prende nada por error)", () => {
  assert.equal(rubroConPerecederos(null), false);
  assert.equal(rubroConPerecederos(undefined), false);
  assert.equal(rubroConPerecederos(""), false);
  assert.equal(rubroConPerecederos("servicios"), false);
  assert.equal(rubroConPerecederos("generico"), false);
});
