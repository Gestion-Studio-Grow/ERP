// Tests del contexto de request para observabilidad (v2). Ejercitan el ALS real:
// aislamiento entre requests concurrentes, herencia a través de awaits, el merge de
// etiquetas y el saneo del requestId entrante. Sin DB ni consola.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  runInRequestContext,
  getRequestContext,
  getRequestId,
  setRequestContext,
  sanitizeRequestId,
  newRequestId,
} from "./request-context";

test("fuera de contexto no hay store ni requestId", () => {
  assert.equal(getRequestContext(), undefined);
  assert.equal(getRequestId(), undefined);
});

test("runInRequestContext expone el requestId provisto y lo mantiene tras awaits", async () => {
  await runInRequestContext({ requestId: "req-1" }, async () => {
    assert.equal(getRequestId(), "req-1");
    await Promise.resolve();
    // El ALS sobrevive al await: sigue viendo el mismo contexto.
    assert.equal(getRequestId(), "req-1");
  });
  // Al salir del scope, el store se limpia.
  assert.equal(getRequestId(), undefined);
});

test("sin requestId provisto genera uno (UUID)", () => {
  runInRequestContext({}, () => {
    const id = getRequestId();
    assert.ok(id && /^[0-9a-f-]{36}$/.test(id), `no parece UUID: ${id}`);
  });
});

test("setRequestContext agrega etiquetas al store vigente y no pisa requestId", () => {
  runInRequestContext({ requestId: "req-2" }, () => {
    setRequestContext({ tenantId: "t_caro", actor: "webhook" });
    setRequestContext({ requestId: "HACKEO" }); // debe ignorarse
    const ctx = getRequestContext();
    assert.equal(ctx?.requestId, "req-2");
    assert.equal(ctx?.tenantId, "t_caro");
    assert.equal(ctx?.actor, "webhook");
  });
});

test("setRequestContext fuera de contexto es no-op (no lanza)", () => {
  assert.doesNotThrow(() => setRequestContext({ tenantId: "x" }));
});

test("contextos concurrentes no se filtran entre sí", async () => {
  const [a, b] = await Promise.all([
    runInRequestContext({ requestId: "A" }, async () => {
      await new Promise((r) => setTimeout(r, 5));
      return getRequestId();
    }),
    runInRequestContext({ requestId: "B" }, async () => {
      return getRequestId();
    }),
  ]);
  assert.equal(a, "A");
  assert.equal(b, "B");
});

test("sanitizeRequestId acepta ids seguros y descarta los peligrosos", () => {
  assert.equal(sanitizeRequestId("abc-123_XYZ.9"), "abc-123_XYZ.9");
  // Vacío/nulo → genera uno nuevo (UUID, distinto del input).
  assert.notEqual(sanitizeRequestId(""), "");
  assert.ok(/^[0-9a-f-]{36}$/.test(sanitizeRequestId(null)));
  // Con saltos de línea (inyección en logs) → se descarta y se genera limpio.
  const injected = "ok\nlevel=error msg=fake";
  assert.notEqual(sanitizeRequestId(injected), injected);
  // Demasiado largo (>200) → se descarta.
  assert.ok(/^[0-9a-f-]{36}$/.test(sanitizeRequestId("x".repeat(201))));
});

test("newRequestId genera ids únicos", () => {
  assert.notEqual(newRequestId(), newRequestId());
});
