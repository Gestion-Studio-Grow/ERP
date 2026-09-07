import test from "node:test";
import assert from "node:assert/strict";
import { roleHasCapability, ROLE_CAPABILITIES, ALL_CAPABILITIES } from "./capabilities";

// ── Quién cobra (decisión del dueño, 2026-09-07) ─────────────────────────────
//
// "El profesional también cobra, y rinde la comisión luego". Cobrar quedó como capacidad
// PROPIA y no dentro de `agenda:manage`: si estuviera ahí, habilitársela al profesional le
// daría también crear, cancelar y reprogramar turnos ajenos. Esto lo fija.

test("el profesional cobra sus turnos, pero no gestiona la agenda", () => {
  assert.equal(roleHasCapability("PROFESSIONAL", "agenda:collect"), true);
  assert.equal(roleHasCapability("PROFESSIONAL", "agenda:complete"), true);
  assert.equal(roleHasCapability("PROFESSIONAL", "agenda:manage"), false, "cobrar no puede implicar crear ni cancelar turnos ajenos");
  assert.equal(roleHasCapability("PROFESSIONAL", "clients:manage"), false);
  assert.equal(roleHasCapability("PROFESSIONAL", "orders:manage"), false);
  assert.equal(roleHasCapability("PROFESSIONAL", "reports:read"), false);
});

test("recepción y dueño también cobran, y recepción lleva la caja entera", () => {
  for (const rol of ["RECEPTION", "OWNER"] as const) {
    assert.equal(roleHasCapability(rol, "agenda:collect"), true, rol);
    assert.equal(roleHasCapability(rol, "agenda:manage"), true, rol);
    assert.equal(roleHasCapability(rol, "orders:read"), true, `${rol} necesita ver el libro y el cierre`);
    assert.equal(roleHasCapability(rol, "orders:manage"), true, `${rol} necesita cerrar la caja`);
  }
});

test("el dueño tiene todo lo que la lista declara", () => {
  for (const cap of ALL_CAPABILITIES) {
    assert.equal(roleHasCapability("OWNER", cap), true, `falta ${cap} en OWNER`);
  }
});

test("recepción no ve reportes financieros ni edita el catálogo (ADR-017)", () => {
  assert.equal(roleHasCapability("RECEPTION", "reports:read"), false);
  assert.equal(roleHasCapability("RECEPTION", "catalog:manage"), false);
  assert.equal(roleHasCapability("RECEPTION", "users:manage"), false);
  assert.equal(roleHasCapability("RECEPTION", "commissions:manage"), false);
});

test("ningún rol tiene una capacidad que no esté declarada", () => {
  const declaradas = new Set<string>(ALL_CAPABILITIES);
  for (const [rol, caps] of Object.entries(ROLE_CAPABILITIES)) {
    for (const c of caps) {
      assert.ok(declaradas.has(c), `${rol} tiene "${c}", que no está en ALL_CAPABILITIES`);
    }
  }
});
