import { test } from "node:test";
import assert from "node:assert/strict";
import { buildInvoiceOriginLink } from "./invoice-origin";

// D10 (ADR-060) — enlace factura → origen, puro.

test("origen ORDER → { orderId }", () => {
  assert.deepEqual(buildInvoiceOriginLink("ORDER", "ord_1"), { orderId: "ord_1" });
});

test("origen APPOINTMENT → { appointmentId }", () => {
  assert.deepEqual(buildInvoiceOriginLink("APPOINTMENT", "apt_1"), { appointmentId: "apt_1" });
});

test("sin id o sin tipo → objeto vacío (factura sin origen, válido)", () => {
  assert.deepEqual(buildInvoiceOriginLink("ORDER", ""), {});
  assert.deepEqual(buildInvoiceOriginLink("ORDER", null), {});
  assert.deepEqual(buildInvoiceOriginLink(null, "ord_1"), {});
  assert.deepEqual(buildInvoiceOriginLink(undefined, undefined), {});
});

test("nunca setea las dos FKs a la vez", () => {
  const link = buildInvoiceOriginLink("APPOINTMENT", "apt_9");
  assert.equal("orderId" in link, false);
  assert.equal(link.appointmentId, "apt_9");
});
