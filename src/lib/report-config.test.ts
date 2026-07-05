// Tests de invariantes del rango de reportes (ADR-026 · ADR-023 F3). Lógica pura.

import { test } from "node:test";
import assert from "node:assert/strict";
import { REPORT_RANGE_DAYS, DEFAULT_REPORT_RANGE_DAYS } from "./report-config";

test("el rango default está dentro de los permitidos", () => {
  assert.ok((REPORT_RANGE_DAYS as readonly number[]).includes(DEFAULT_REPORT_RANGE_DAYS));
});

test("los rangos permitidos son positivos, únicos y crecientes", () => {
  const arr = [...REPORT_RANGE_DAYS];
  assert.ok(arr.length > 0);
  assert.ok(arr.every((d) => Number.isInteger(d) && d > 0));
  assert.equal(new Set(arr).size, arr.length); // sin duplicados
  assert.deepEqual(arr, [...arr].sort((a, b) => a - b)); // crecientes
});
