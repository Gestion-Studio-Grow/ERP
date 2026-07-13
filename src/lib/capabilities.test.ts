// ============================================================================
// TEST-GATE RBAC (ADR-017) — el mapa rol→capacidad es la ÚNICA barrera de permisos.
// ============================================================================
//
// `ROLE_CAPABILITIES` es el archivo de más apalancamiento de seguridad del repo: un
// typo al agregar una capability (p.ej. copiar la lista de OWNER a RECEPTION) daría a
// la recepción acceso a plata/config sin que nada lo note. Este test fija, por rol, qué
// PUEDE y qué NO PUEDE — falla ruidoso ante cualquier fuga de privilegio.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ROLE_CAPABILITIES,
  ALL_CAPABILITIES,
  roleHasCapability,
  homeRoute,
  type Capability,
} from "./capabilities";

// Capacidades PRIVILEGIADAS: plata, fiscal, gestión de usuarios/módulos/config y el
// panel del contador. NINGUN rol operativo (RECEPTION/PROFESSIONAL) puede tenerlas.
const PRIVILEGED: Capability[] = [
  "billing:manage",
  "payments:manage",
  "commissions:manage",
  "users:manage",
  "modules:manage",
  "appearance:manage",
  "cartera:manage",
  "catalog:manage",
  "coupons:manage",
  "reports:read",
  "audit:read",
  "location:manage",
];

test("OWNER tiene TODAS las capacidades (y son exactamente ALL_CAPABILITIES)", () => {
  assert.deepEqual([...ROLE_CAPABILITIES.OWNER].sort(), [...ALL_CAPABILITIES].sort());
  for (const cap of ALL_CAPABILITIES) assert.ok(roleHasCapability("OWNER", cap));
});

test("RECEPTION NUNCA tiene capacidades privilegiadas (plata/config/usuarios)", () => {
  for (const cap of PRIVILEGED) {
    assert.equal(roleHasCapability("RECEPTION", cap), false, `RECEPTION no debe tener ${cap}`);
  }
});

test("PROFESSIONAL NUNCA tiene capacidades privilegiadas", () => {
  for (const cap of PRIVILEGED) {
    assert.equal(roleHasCapability("PROFESSIONAL", cap), false, `PROFESSIONAL no debe tener ${cap}`);
  }
});

test("RECEPTION = exactamente el set operativo de mostrador (agenda+clientes+POS+waitlist)", () => {
  assert.deepEqual([...ROLE_CAPABILITIES.RECEPTION].sort(), [
    "agenda:complete",
    "agenda:manage",
    "agenda:read",
    "clients:manage",
    "clients:read",
    "dashboard:read",
    "orders:manage",
    "orders:read",
    "waitlist:manage",
  ].sort());
});

test("PROFESSIONAL = exactamente su propia agenda (leer + cerrar)", () => {
  assert.deepEqual([...ROLE_CAPABILITIES.PROFESSIONAL].sort(), ["agenda:complete", "agenda:read"].sort());
});

test("todas las capacidades de cada rol son válidas (⊆ ALL_CAPABILITIES) y sin duplicados", () => {
  for (const [role, caps] of Object.entries(ROLE_CAPABILITIES)) {
    assert.equal(new Set(caps).size, caps.length, `${role} tiene capacidades duplicadas`);
    for (const cap of caps) {
      assert.ok(ALL_CAPABILITIES.includes(cap), `${role}: ${cap} no está en ALL_CAPABILITIES`);
    }
  }
});

test("invariante anti-loop: la home de cada rol cae dentro de sus capacidades", () => {
  // /admin (OWNER/RECEPTION) requiere dashboard:read; /admin/turnos (PROFESSIONAL) requiere agenda:read.
  assert.equal(homeRoute("OWNER"), "/admin");
  assert.equal(homeRoute("RECEPTION"), "/admin");
  assert.ok(roleHasCapability("OWNER", "dashboard:read"));
  assert.ok(roleHasCapability("RECEPTION", "dashboard:read"));
  assert.equal(homeRoute("PROFESSIONAL"), "/admin/turnos");
  assert.ok(roleHasCapability("PROFESSIONAL", "agenda:read"));
});
