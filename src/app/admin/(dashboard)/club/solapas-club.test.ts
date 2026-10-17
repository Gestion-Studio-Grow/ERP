import { test } from "node:test";
import assert from "node:assert/strict";
import { SOLAPAS_DEL_CLUB } from "./solapas-club";

// Las solapas de fábrica de ClubDemo.tsx: una solapa nueva no puede pisar su id.
const DE_FABRICA = ["agenda", "fijos", "canchas", "buffet", "caja"];

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
