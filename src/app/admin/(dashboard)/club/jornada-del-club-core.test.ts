import { test } from "node:test";
import assert from "node:assert/strict";
import { NEGOCIOS_CON_JORNADA_REAL, relojDelClub } from "./jornada-del-club-core";

test("Break Point abre la jornada real", () => {
  assert.deepEqual(NEGOCIOS_CON_JORNADA_REAL, ["breakpoint"]);
  assert.equal(relojDelClub({ slug: "breakpoint", sandbox: false, demo: undefined }), "real");
  // Otro valor de `demo` no pide la demo (como el vanilla: sólo `?demo=1`).
  assert.equal(relojDelClub({ slug: "breakpoint", sandbox: false, demo: "0" }), "real");
});

test("Break Point con ?demo=1 abre la demo", () => {
  assert.equal(relojDelClub({ slug: "breakpoint", sandbox: false, demo: "1" }), "demo");
});

test("Break Point en el sandbox de preventa abre la demo (nunca la jornada real)", () => {
  assert.equal(relojDelClub({ slug: "breakpoint", sandbox: true, demo: undefined }), "demo");
});

test("otro negocio (o sin negocio) abre la demo", () => {
  assert.equal(relojDelClub({ slug: "adosmanos", sandbox: false, demo: undefined }), "demo");
  assert.equal(relojDelClub({ slug: "beauty-spa", sandbox: false, demo: "0" }), "demo");
  assert.equal(relojDelClub({ slug: null, sandbox: false, demo: undefined }), "demo");
});
