import { test } from "node:test";
import assert from "node:assert/strict";
import { validatePasswordStrength, MIN_PASSWORD_LENGTH } from "./password-policy";

test("acepta una contraseña con letras y números y largo suficiente", () => {
  const r = validatePasswordStrength("caballo-azul-2026");
  assert.equal(r.ok, true);
  assert.deepEqual(r.problems, []);
});

test("rechaza si es demasiado corta", () => {
  const r = validatePasswordStrength("ab1");
  assert.equal(r.ok, false);
  assert.ok(r.problems.some((p) => p.includes(String(MIN_PASSWORD_LENGTH))));
});

test("rechaza si es solo números", () => {
  const r = validatePasswordStrength("1234567890123");
  assert.equal(r.ok, false);
  assert.ok(r.problems.some((p) => p.toLowerCase().includes("letras")));
});

test("rechaza si es solo letras", () => {
  const r = validatePasswordStrength("abcdefghijklm");
  assert.equal(r.ok, false);
});

test("rechaza un patrón repetitivo aunque sea largo", () => {
  const r = validatePasswordStrength("1a1a1a1a1a1a");
  // tiene letras y números y largo, pero < 4 caracteres distintos
  assert.equal(r.ok, false);
  assert.ok(r.problems.some((p) => p.toLowerCase().includes("repetitiv")));
});

test("cadena vacía no rompe y no es válida", () => {
  const r = validatePasswordStrength("");
  assert.equal(r.ok, false);
});
