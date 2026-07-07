// Guarda transversal (fix m-1, reporte QA 2026-07-06): el wording de un rubro no
// debe filtrarse a otro — el caso detectado fue "cómo lo querés preparado"
// (carnicería) apareciendo hardcodeado en la nota de pedido de CUALQUIER tienda.
// Cada rubro declara ahora su propio `notesPlaceholder`; este test blinda que solo
// carnicería/fiambrería (rubros donde "preparado" tiene sentido) lo usen.

import { test } from "node:test";
import assert from "node:assert/strict";
import { RETAIL_RUBROS, GENERIC_RETAIL_WORDING } from "./rubros";

const RUBROS_DE_PREPARACION = new Set(["carniceria", "fiambreria"]);

test("notesPlaceholder: todo rubro define uno propio, no vacío", () => {
  for (const [id, rubro] of Object.entries(RETAIL_RUBROS)) {
    assert.ok(rubro.wording.notesPlaceholder?.length > 0, `rubro "${id}" sin notesPlaceholder`);
  }
  assert.ok(GENERIC_RETAIL_WORDING.notesPlaceholder.length > 0);
});

test("notesPlaceholder: 'preparado' solo aparece en rubros de mostrador con corte/preparación", () => {
  for (const [id, rubro] of Object.entries(RETAIL_RUBROS)) {
    const mentionsPreparado = /preparad/i.test(rubro.wording.notesPlaceholder);
    if (mentionsPreparado) {
      assert.ok(
        RUBROS_DE_PREPARACION.has(id),
        `rubro "${id}" no debería mencionar "preparado" en su notesPlaceholder`,
      );
    }
  }
});
