import { test } from "node:test";
import assert from "node:assert/strict";
import { modoEnPantalla, NO_SE_PUDO_LEER_EL_MODO } from "./modo-en-pantalla";

test("con modo: lo muestra tal cual y factura", () => {
  assert.deepEqual(modoEnPantalla({ modo: "real" }), { modo: "real", noFactura: null });
  assert.deepEqual(modoEnPantalla({ modo: "homologacion" }), { modo: "homologacion", noFactura: null });
  assert.deepEqual(modoEnPantalla({ modo: "stub" }), { modo: "stub", noFactura: null });
});

test("con error: NUNCA «real»; dice que no factura y el motivo", () => {
  const motivo = "El negocio está marcado para facturar en real pero falta el certificado de producción de ARCA cargado.";
  const r = modoEnPantalla({ error: motivo });
  assert.notEqual(r.modo, "real");
  assert.equal(r.modo, "stub");
  assert.equal(r.noFactura, motivo);
});

test("si no se pudo leer: falla cerrada con un motivo en criollo", () => {
  const r = modoEnPantalla(null);
  assert.equal(r.modo, "stub");
  assert.equal(r.noFactura, NO_SE_PUDO_LEER_EL_MODO);
});
