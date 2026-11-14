// Tope de la nota del pedido de la tienda, del lado del servidor (D5 de MAGRA-5C).
// El `maxLength` de la pantalla se saltea con un POST armado a mano: el servidor corta igual.
import { test } from "node:test";
import assert from "node:assert/strict";
import { notaDeLaClientaDelFormulario, topeDeNotaDelPedido, TOPE_NOTA_DEL_PEDIDO } from "./venta-reglas";

test("nota del pedido: Magra corta en 300 aunque el POST mande 1000; el resto (CH incluido) sigue en 500", () => {
  const larga = "a".repeat(1000);
  assert.equal(topeDeNotaDelPedido("magra"), 300);
  assert.equal(notaDeLaClientaDelFormulario(larga, "magra")?.length, 300);
  // CH (beauty-spa) y cualquier otro negocio: sin cambio, 500 como antes.
  assert.equal(TOPE_NOTA_DEL_PEDIDO, 500);
  for (const slug of ["beauty-spa", "quebienoles", null, undefined, ""]) {
    assert.equal(topeDeNotaDelPedido(slug), 500);
    assert.equal(notaDeLaClientaDelFormulario(larga, slug)?.length, 500);
  }
  // Vacía o sólo espacios → null; los espacios de los bordes no cuentan.
  assert.equal(notaDeLaClientaDelFormulario("   ", "magra"), null);
  assert.equal(notaDeLaClientaDelFormulario(null, "magra"), null);
  assert.equal(notaDeLaClientaDelFormulario("  tocar timbre  ", "magra"), "tocar timbre");
  assert.equal(notaDeLaClientaDelFormulario(" " + "b".repeat(300), "magra")?.length, 300);
});
