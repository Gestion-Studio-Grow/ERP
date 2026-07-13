import { test } from "node:test";
import assert from "node:assert/strict";
import { hashPassword, verifyPassword, generateStrongPassword } from "./auth-password";

// --- Hash / verify (base del login y del reset) ------------------------------

test("hashPassword produce el formato scrypt$salt$hash y verifyPassword valida", async () => {
  const stored = await hashPassword("una-clave-fuerte-123");
  const parts = stored.split("$");
  assert.equal(parts.length, 3);
  assert.equal(parts[0], "scrypt");
  assert.ok(parts[1].length > 0 && parts[2].length > 0);
  assert.equal(await verifyPassword("una-clave-fuerte-123", stored), true);
});

test("verifyPassword rechaza la contraseña incorrecta", async () => {
  const stored = await hashPassword("correcta-123");
  assert.equal(await verifyPassword("incorrecta-123", stored), false);
});

test("dos hashes de la misma contraseña difieren (salt aleatorio)", async () => {
  const a = await hashPassword("misma-clave-123");
  const b = await hashPassword("misma-clave-123");
  assert.notEqual(a, b);
  // pero ambos verifican
  assert.equal(await verifyPassword("misma-clave-123", a), true);
  assert.equal(await verifyPassword("misma-clave-123", b), true);
});

// --- Generación de contraseña temporal ---------------------------------------

test("generateStrongPassword: alta entropía, url-safe y suficientemente larga", () => {
  const pw = generateStrongPassword();
  // 18 bytes en base64url → ~24 caracteres.
  assert.ok(pw.length >= 20, `esperaba >=20 chars, dio ${pw.length}`);
  // base64url: solo [A-Za-z0-9_-], sin padding.
  assert.match(pw, /^[A-Za-z0-9_-]+$/);
});

test("generateStrongPassword: no repite (100 muestras únicas)", () => {
  const seen = new Set<string>();
  for (let i = 0; i < 100; i++) seen.add(generateStrongPassword());
  assert.equal(seen.size, 100);
});

// La temporal se valida por ENTROPÍA (no por la política de fuerza del usuario, que exige
// letras+números y sólo aplica a la contraseña que ELIGE la persona en el cambio forzado).
// base64url de 18 bytes aleatorios → siempre muchos caracteres distintos.
test("generateStrongPassword: alta variedad de caracteres (>=10 distintos)", () => {
  for (let i = 0; i < 50; i++) {
    const pw = generateStrongPassword();
    assert.ok(new Set(pw).size >= 10, `pocos caracteres distintos: ${pw}`);
  }
});
