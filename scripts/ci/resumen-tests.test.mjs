import { test } from "node:test";
import assert from "node:assert/strict";
import { resumirTap } from "./resumen-tests.mjs";

const TAP = `TAP version 13
# Subtest: Suite del navegador
    # Subtest: anda
    ok 1 - anda
      ---
      duration_ms: 1
      type: 'test'
      ...
    # Subtest: se rompe
    not ok 2 - se rompe
      ---
      duration_ms: 2
      type: 'test'
      location: '/repo/src/app/(dashboard)/x/a.test.ts:8:9464'
      failureType: 'testCodeFailure'
      error: |-
        locator.click: strict mode violation
        más texto
      code: 'ERR_TEST_FAILURE'
      stack: |-
        TestContext.<anonymous> (/repo/src/app/(dashboard)/x/a.test.ts:222:72)
      ...
    1..2
not ok 1 - Suite del navegador
  ---
  type: 'suite'
  location: '/repo/src/app/(dashboard)/x/a.test.ts:8:1'
  failureType: 'subtestsFailed'
  error: '1 subtest failed'
  ...
# Subtest: salteado
ok 2 - salteado # SKIP sin GATE2_PG_URL
  ---
  type: 'test'
  ...
# Subtest: igualdad
not ok 3 - igualdad
  ---
  type: 'test'
  location: '/repo/src/lib/b.test.ts:40:3'
  error: 'Expected values to be strictly equal:'
  expected: ''
  actual: 'clave-mala'
  ...
1..3
# tests 4
# pass 1
# fail 2
# skipped 1
`;

test("lista los fallidos con archivo:línea del stack y el motivo; la suite que falla por sus hijos no se repite", () => {
  const r = resumirTap(TAP);
  assert.deepEqual(r.fallidos.map((f) => [f.nombre, f.donde]), [
    ["se rompe", "src/app/(dashboard)/x/a.test.ts:222"],
    ["igualdad", "src/lib/b.test.ts:40"],
  ]);
  assert.equal(r.fallidos[0].motivo, "locator.click: strict mode violation");
  assert.match(r.fallidos[1].motivo, /strictly equal.*expected: ''.*actual: 'clave-mala'/);
});

test("lista los salteados con su motivo y lee los totales", () => {
  const r = resumirTap(TAP);
  assert.deepEqual(r.salteados.map((s) => [s.nombre, s.motivo]), [["salteado", "sin GATE2_PG_URL"]]);
  assert.deepEqual(r.totales, { tests: "4", pass: "1", fail: "2", skipped: "1" });
});
