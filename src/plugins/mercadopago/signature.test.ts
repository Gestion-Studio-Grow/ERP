import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  parseXSignature,
  buildManifest,
  verifyMercadoPagoSignature,
} from "./signature";

const SECRET = "test_webhook_secret";

// Helper: firma v1 legítima para un manifest, como la generaría MP.
function sign(manifest: string): string {
  return createHmac("sha256", SECRET).update(manifest).digest("hex");
}

test("parseXSignature extrae ts y v1", () => {
  assert.deepEqual(parseXSignature("ts=1704908010,v1=abc123"), {
    ts: "1704908010",
    v1: "abc123",
  });
});

test("parseXSignature tolera espacios y orden", () => {
  assert.deepEqual(parseXSignature(" v1=deadbeef , ts=42 "), {
    ts: "42",
    v1: "deadbeef",
  });
});

test("parseXSignature → null si falta ts o v1, o header vacío", () => {
  assert.equal(parseXSignature("ts=1"), null);
  assert.equal(parseXSignature("v1=abc"), null);
  assert.equal(parseXSignature(null), null);
  assert.equal(parseXSignature(""), null);
});

test("buildManifest arma id;request-id;ts con data.id en minúsculas", () => {
  assert.equal(
    buildManifest("AbC123", "req-9", "1000"),
    "id:abc123;request-id:req-9;ts:1000;",
  );
});

test("buildManifest omite request-id si falta", () => {
  assert.equal(buildManifest("123456", null, "1000"), "id:123456;ts:1000;");
});

test("verifica una firma legítima", () => {
  const ts = "1704908010";
  const manifest = buildManifest("payment-123", "req-42", ts);
  const v1 = sign(manifest);
  assert.equal(
    verifyMercadoPagoSignature({
      xSignature: `ts=${ts},v1=${v1}`,
      xRequestId: "req-42",
      dataId: "payment-123",
      secret: SECRET,
    }),
    true,
  );
});

test("rechaza una firma forjada (secreto equivocado)", () => {
  const ts = "1704908010";
  const manifest = buildManifest("payment-123", "req-42", ts);
  const forged = createHmac("sha256", "otro_secreto").update(manifest).digest("hex");
  assert.equal(
    verifyMercadoPagoSignature({
      xSignature: `ts=${ts},v1=${forged}`,
      xRequestId: "req-42",
      dataId: "payment-123",
      secret: SECRET,
    }),
    false,
  );
});

test("rechaza si cambian los datos firmados (manifest distinto)", () => {
  const ts = "1704908010";
  const v1 = sign(buildManifest("payment-123", "req-42", ts));
  // mismo v1 pero otro dataId → el manifest recomputado no matchea
  assert.equal(
    verifyMercadoPagoSignature({
      xSignature: `ts=${ts},v1=${v1}`,
      xRequestId: "req-42",
      dataId: "payment-999",
      secret: SECRET,
    }),
    false,
  );
});

test("fail-closed ante datos faltantes", () => {
  const base = { xRequestId: "r", dataId: "1", secret: SECRET };
  assert.equal(verifyMercadoPagoSignature({ ...base, xSignature: null }), false);
  assert.equal(
    verifyMercadoPagoSignature({ ...base, xSignature: "ts=1,v1=a", secret: "" }),
    false,
  );
  assert.equal(
    verifyMercadoPagoSignature({ ...base, xSignature: "ts=1,v1=a", dataId: "" }),
    false,
  );
});
