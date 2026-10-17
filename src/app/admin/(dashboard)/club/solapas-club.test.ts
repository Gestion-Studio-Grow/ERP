import { test } from "node:test";
import assert from "node:assert/strict";
import { PIEZAS_GLOBALES_DEL_CLUB, SOLAPAS_DEL_CLUB } from "./solapas-club";

// Las solapas de fábrica de ClubDemo.tsx: una solapa nueva no puede pisar su id.
const DE_FABRICA = ["agenda", "fijos", "canchas", "buffet", "tienda", "caja"];

test("las solapas que suma el club tienen id único, apto para el DOM y sin pisar las de fábrica", () => {
  const ids = SOLAPAS_DEL_CLUB.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length, "ids repetidos");
  for (const s of SOLAPAS_DEL_CLUB) {
    assert.match(s.id, /^[a-z][a-z0-9-]*$/, `id «${s.id}»: minúsculas, dígitos y guiones`);
    assert.ok(!DE_FABRICA.includes(s.id), `«${s.id}» ya es una solapa de fábrica`);
    assert.ok(s.etiqueta.trim().length > 0, `«${s.id}» sin etiqueta`);
    assert.equal(typeof s.cargar, "function");
  }
});

test("las piezas globales tienen id único y apto para el DOM, y cada una baja en su chunk (`cargar`)", () => {
  const ids = PIEZAS_GLOBALES_DEL_CLUB.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length, "ids repetidos");
  for (const p of PIEZAS_GLOBALES_DEL_CLUB) {
    assert.match(p.id, /^[a-z][a-z0-9-]*$/, `id «${p.id}»: minúsculas, dígitos y guiones`);
    assert.equal(typeof p.cargar, "function");
  }
});
