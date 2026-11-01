// U13: las palabras de estética sólo en CH; los demás rubros, sin ningún cambio.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { palabrasDelNegocio } from "./palabras-del-negocio";

test("CH no lee góndolas ni mostrador; los demás, como siempre", () => {
  assert.equal(palabrasDelNegocio("beauty-spa").cobrarLaVenta, "Cobrar una venta");
  assert.doesNotMatch(palabrasDelNegocio("beauty-spa").contarTodo, /góndola/);
  for (const otro of ["magra", "adosmanos", null]) {
    assert.equal(palabrasDelNegocio(otro).cobrarLaVenta, "Cobrar en el mostrador");
    assert.equal(palabrasDelNegocio(otro).contarTodo, "Contar una góndola entera");
  }
});

test("las pantallas usan estas palabras, no el texto fijo", () => {
  const raiz = join(process.cwd(), "src/app/admin/(dashboard)");
  const ajustes = readFileSync(join(raiz, "ajustes/page.tsx"), "utf8");
  assert.match(ajustes, /\{palabras\.contarTodo\}/);
  assert.doesNotMatch(ajustes, /Contar una góndola entera/);
  assert.match(readFileSync(join(raiz, "pedidos/page.tsx"), "utf8"), /palabras\.cobrarLaVenta/);
});
