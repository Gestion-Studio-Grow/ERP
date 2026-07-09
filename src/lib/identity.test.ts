import { test } from "node:test";
import assert from "node:assert/strict";
import { gsgIdentityEnabled, identityAttr, tenantFidelityEnabled } from "./identity";

test("gsgIdentityEnabled: default OFF (sin env / vacío / off)", () => {
  assert.equal(gsgIdentityEnabled({}), false);
  assert.equal(gsgIdentityEnabled({ GSG_IDENTITY_ENABLED: "" }), false);
  assert.equal(gsgIdentityEnabled({ GSG_IDENTITY_ENABLED: "off" }), false);
  assert.equal(gsgIdentityEnabled({ GSG_IDENTITY_ENABLED: "false" }), false);
});

test("gsgIdentityEnabled: ON con 1/true/on/yes (case-insensitive)", () => {
  for (const v of ["1", "true", "on", "yes", "TRUE", "On"]) {
    assert.equal(gsgIdentityEnabled({ GSG_IDENTITY_ENABLED: v }), true, `"${v}" debería encender`);
  }
});

test("identityAttr: ON → 'gsg'; OFF → undefined (sin atributo → byte-idéntico)", () => {
  assert.equal(identityAttr(true), "gsg");
  assert.equal(identityAttr(false), undefined);
});

test("tenantFidelityEnabled: default OFF (sin env / vacío / off)", () => {
  assert.equal(tenantFidelityEnabled({}), false);
  assert.equal(tenantFidelityEnabled({ TENANT_FIDELITY_ENABLED: "" }), false);
  assert.equal(tenantFidelityEnabled({ TENANT_FIDELITY_ENABLED: "off" }), false);
  assert.equal(tenantFidelityEnabled({ TENANT_FIDELITY_ENABLED: "false" }), false);
});

test("tenantFidelityEnabled: ON con 1/true/on/yes (case-insensitive)", () => {
  for (const v of ["1", "true", "on", "yes", "YES", "On"]) {
    assert.equal(tenantFidelityEnabled({ TENANT_FIDELITY_ENABLED: v }), true, `"${v}" debería encender`);
  }
});

test("flags de identidad son ORTOGONALES (uno no enciende el otro)", () => {
  assert.equal(gsgIdentityEnabled({ TENANT_FIDELITY_ENABLED: "on" }), false);
  assert.equal(tenantFidelityEnabled({ GSG_IDENTITY_ENABLED: "on" }), false);
});
