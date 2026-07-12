// Tests de la interpretación del CUIT que carga el operador. node:test.

import { test } from "node:test";
import assert from "node:assert/strict";
import { interpretarCuitInput } from "./cuit-input";

test("vacío → limpiar", () => {
  assert.deepEqual(interpretarCuitInput(""), { accion: "limpiar" });
  assert.deepEqual(interpretarCuitInput("   "), { accion: "limpiar" });
});

test("CUIT válido → set, normalizado a solo dígitos", () => {
  // Fixtures con verificador correcto (mismos que cuit.test.ts).
  assert.deepEqual(interpretarCuitInput("20111111112"), { accion: "set", cuit: "20111111112" });
  assert.deepEqual(interpretarCuitInput("27111111117"), { accion: "set", cuit: "27111111117" });
});

test("tolera guiones/puntos/espacios y normaliza", () => {
  assert.deepEqual(interpretarCuitInput("20-11111111-2"), { accion: "set", cuit: "20111111112" });
  assert.deepEqual(interpretarCuitInput(" 20 11111111 2 "), { accion: "set", cuit: "20111111112" });
});

test("longitud incorrecta → error con motivo de longitud", () => {
  const r = interpretarCuitInput("2011111111"); // 10 dígitos
  assert.equal(r.accion, "error");
  assert.match((r as { motivo: string }).motivo, /11 números/);
});

test("dígito verificador incorrecto → error (no pasa, aunque tenga 11 dígitos)", () => {
  const r = interpretarCuitInput("20111111113");
  assert.equal(r.accion, "error");
  assert.match((r as { motivo: string }).motivo, /dígito verificador/);
});

test("prefijo inexistente (no lo emite ARCA) → error", () => {
  // 99 no es un prefijo de tipo válido.
  const r = interpretarCuitInput("99111111110");
  assert.equal(r.accion, "error");
});
