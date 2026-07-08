// ============================================================================
// TEST del candado/teaser (ADR-059 D3, fix Challenger #4) — PR-2.
// ============================================================================
//
// Cubre la garantía de ROLLBACK: con el teaser OFF (default), `resolveNavLockState`
// tiene que ser indistinguible del gate binario de hoy (`perfilGateAllows`). Es la
// valla de que apagar `UPGRADE_TEASER_ENABLED` no deja ningún residuo de "locked".

import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveNavLockState } from "./candado";
import { perfilGateAllows, type Perfil } from "./perfil";

const PERFILES_MIN: (Perfil | undefined)[] = [undefined, "lite", "enterprise"];
const ACTIVE_PROFILES: (Perfil | null)[] = [null, "lite", "enterprise"];

test("flag OFF (activeProfile null): siempre visible, nunca locked (legado intacto)", () => {
  for (const min of PERFILES_MIN) {
    for (const teaserEnabled of [false, true]) {
      assert.equal(
        resolveNavLockState(min, { activeProfile: null, teaserEnabled }),
        "visible",
      );
    }
  }
});

test("ROLLBACK: teaserEnabled=false colapsa exactamente al binario de perfilGateAllows (nunca locked)", () => {
  for (const min of PERFILES_MIN) {
    for (const activeProfile of ACTIVE_PROFILES) {
      const state = resolveNavLockState(min, { activeProfile, teaserEnabled: false });
      const allowed = perfilGateAllows(min, activeProfile);
      assert.equal(state, allowed ? "visible" : "hidden");
      assert.notEqual(state, "locked", `teaser OFF nunca debe producir "locked" (min=${min}, perfil=${activeProfile})`);
    }
  }
});

test("teaserEnabled=true: lo que ya era visible SIGUE visible (el candado nunca esconde ni bloquea lo permitido)", () => {
  for (const min of PERFILES_MIN) {
    for (const activeProfile of ACTIVE_PROFILES) {
      if (perfilGateAllows(min, activeProfile)) {
        assert.equal(
          resolveNavLockState(min, { activeProfile, teaserEnabled: true }),
          "visible",
        );
      }
    }
  }
});

test("teaserEnabled=true: enterprise-only en tenant lite pasa a locked (candado + UpgradeSheet)", () => {
  assert.equal(
    resolveNavLockState("enterprise", { activeProfile: "lite", teaserEnabled: true }),
    "locked",
  );
});

test("teaserEnabled=false (default): enterprise-only en tenant lite se oculta (comportamiento de hoy)", () => {
  assert.equal(
    resolveNavLockState("enterprise", { activeProfile: "lite", teaserEnabled: false }),
    "hidden",
  );
});

test("tenant enterprise: nunca ve locked, ni con el teaser prendido (ya tiene todo lo que el lite tiene + más)", () => {
  for (const min of PERFILES_MIN) {
    for (const teaserEnabled of [false, true]) {
      assert.equal(
        resolveNavLockState(min, { activeProfile: "enterprise", teaserEnabled }),
        "visible",
      );
    }
  }
});
