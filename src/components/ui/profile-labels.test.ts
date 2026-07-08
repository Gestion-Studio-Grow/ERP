// ============================================================================
// TEST del naming al cliente (ADR-059 D7) — "Comercio"/"Empresa", nunca
// lite/enterprise de cara al cliente.
// ============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";
import { profileEditionLabel, PROFILE_EDITION_LABEL } from "./profile-labels";

test("D7: lite -> Comercio, enterprise -> Empresa", () => {
  assert.equal(profileEditionLabel("lite"), "Comercio");
  assert.equal(profileEditionLabel("enterprise"), "Empresa");
});

test("D7: ninguna etiqueta de cliente filtra jerga de ingeniería (lite/enterprise)", () => {
  for (const label of Object.values(PROFILE_EDITION_LABEL)) {
    assert.ok(!/lite|enterprise/i.test(label), `"${label}" filtra jerga de ingeniería`);
  }
});
