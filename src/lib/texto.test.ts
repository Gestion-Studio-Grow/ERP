// La regla de la mayúscula inicial es una sola para todo el sistema (antes había cuatro copias).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mayuscula } from "./texto";

test("mayúscula inicial: sólo la primera letra, el resto como viene, y el vacío queda vacío", () => {
  assert.equal(mayuscula("septiembre 2026"), "Septiembre 2026");
  assert.equal(mayuscula("jueves 24 de septiembre"), "Jueves 24 de septiembre");
  assert.equal(mayuscula("ñandú"), "Ñandú");
  assert.equal(mayuscula("área de corte"), "Área de corte");
  assert.equal(mayuscula("producto"), "Producto");
  assert.equal(mayuscula("Ya empieza así"), "Ya empieza así");
  assert.equal(mayuscula(""), "");
});
