// MIA-141 (hueco 3): `fueraPorProducto` es la condición del layout (layout.tsx:146-151) que `motivoDeLaPantalla` ahora
// también mira. Rebota igual que el layout: sólo con la capacidad de la casa del producto (sin ella, el layout no saca a
// nadie para no hacer un loop), y nunca en el ERP vertical (CH, beauty-spa).
import { test } from "node:test";
import assert from "node:assert/strict";
import { fueraPorProducto } from "@/lib/fuera-por-producto";

const duenia = { role: "OWNER" as const, overrides: [] };
// `billing:manage` es del rol (no se overridea por usuario): una profesional no la tiene.
const sinFacturar = { role: "PROFESSIONAL" as const, overrides: [] };

test("fueraPorProducto: Factoque y Contador rebotan con la capacidad de su casa; CH y la productora, nunca", () => {
  assert.equal(fueraPorProducto({ blueprintId: "facturita", modulosAsignados: [] }, duenia), true);
  assert.equal(fueraPorProducto({ blueprintId: null, modulosAsignados: ["cartera"] }, duenia), true);
  assert.equal(fueraPorProducto({ blueprintId: "beauty-spa", modulosAsignados: [] }, duenia), false);
  assert.equal(fueraPorProducto({ blueprintId: "productora", modulosAsignados: ["proyectos"] }, duenia), false);
  assert.equal(fueraPorProducto({ blueprintId: "generico", modulosAsignados: [] }, duenia), false);
});

test("fueraPorProducto: sin la capacidad de la casa del producto no cuenta (el layout tampoco la saca)", () => {
  assert.equal(fueraPorProducto({ blueprintId: "facturita", modulosAsignados: [] }, sinFacturar), false);
});
