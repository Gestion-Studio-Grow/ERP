import { test } from "node:test";
import assert from "node:assert/strict";
import { authorizeCron } from "./cron-auth";

test("fail-closed: sin CRON_SECRET seteada rechaza 503 aunque venga un bearer", () => {
  const r = authorizeCron(undefined, "Bearer lo-que-sea");
  assert.deepEqual(r, { ok: false, status: 503, error: "cron_not_configured" });
});

test("fail-closed: secreto vacío también rechaza 503", () => {
  const r = authorizeCron("", "Bearer x");
  assert.equal(r.ok, false);
  assert.equal(r.ok === false && r.status, 503);
});

test("con secreto y bearer correcto autoriza", () => {
  assert.deepEqual(authorizeCron("s3cr3t", "Bearer s3cr3t"), { ok: true });
});

test("con secreto y bearer incorrecto rechaza 401", () => {
  const r = authorizeCron("s3cr3t", "Bearer otro");
  assert.deepEqual(r, { ok: false, status: 401, error: "unauthorized" });
});

test("con secreto y sin header Authorization rechaza 401", () => {
  const r = authorizeCron("s3cr3t", null);
  assert.deepEqual(r, { ok: false, status: 401, error: "unauthorized" });
});

test("no acepta el secreto crudo sin el prefijo Bearer", () => {
  const r = authorizeCron("s3cr3t", "s3cr3t");
  assert.equal(r.ok, false);
});
