import { test } from "node:test";
import assert from "node:assert/strict";
import { densityForProfile, DENSITY_BY_PROFILE } from "./profile-density";

test("densityForProfile: Comercio (lite) → 'lite' (espacioso)", () => {
  assert.equal(densityForProfile("lite"), "lite");
});

test("densityForProfile: Empresa (enterprise) → undefined (denso, default :root)", () => {
  assert.equal(densityForProfile("enterprise"), undefined);
});

test("densityForProfile: motor OFF (null) → undefined → byte-idéntico a hoy (sin atributo)", () => {
  assert.equal(densityForProfile(null), undefined);
});

test("invariante del diferenciador: Comercio es MÁS espacioso que Empresa (--density mayor)", () => {
  assert.ok(DENSITY_BY_PROFILE.lite > DENSITY_BY_PROFILE.enterprise);
  // Empresa se ve como hoy (motor OFF) = denso.
  assert.equal(DENSITY_BY_PROFILE.enterprise, DENSITY_BY_PROFILE.off);
});
