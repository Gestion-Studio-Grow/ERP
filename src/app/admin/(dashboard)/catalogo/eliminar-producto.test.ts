import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { consecuenciasDeEliminar, preguntaDeEliminar } from "./eliminar-producto";

test("eliminar dice lo que pasa: deja de verse, el historial queda y no se deshace", () => {
  const c = consecuenciasDeEliminar({ name: "Vacío", codigo: null });
  assert.equal(preguntaDeEliminar({ name: "Vacío" }), "¿Eliminar «Vacío»?");
  assert.match(c.join(" "), /Vender y en la tienda/);
  assert.match(c.join(" "), /quedan como estaban/);
  assert.match(c.join(" "), /No se puede deshacer/);
  assert.doesNotMatch(c.join(" "), /código/);
});

test("con código/PLU, avisa que sigue ocupado", () => {
  const c = consecuenciasDeEliminar({ name: "Vacío", codigo: "00201" });
  assert.match(c.join(" "), /Su código 00201 sigue ocupado/);
});

test("lo que dice es lo que hace deleteProduct: borrado lógico, no borra ventas ni movimientos", () => {
  const src = readFileSync(fileURLToPath(new URL("../../../../lib/catalog-actions.ts", import.meta.url)), "utf8");
  const cuerpo = src.slice(src.indexOf("export async function deleteProduct("));
  const fin = cuerpo.indexOf("\n}\n");
  const fn = cuerpo.slice(0, fin);
  assert.match(fn, /data: \{ deletedAt: new Date\(\) \}/);
  assert.doesNotMatch(fn, /orderItem|stockMovement|product\.delete\(/);
});

test("los dos catálogos de mostrador ya no usan confirm() para eliminar", () => {
  for (const f of ["CortesSection.tsx", "CatalogoRenglon.tsx"]) {
    const src = readFileSync(fileURLToPath(new URL(`./${f}`, import.meta.url)), "utf8");
    assert.doesNotMatch(src, /[^.\w]confirm\(`/, f);
    assert.match(src, /Sí, eliminar/, f);
  }
});
