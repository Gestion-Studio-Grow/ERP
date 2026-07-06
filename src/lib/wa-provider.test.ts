import { test } from "node:test";
import assert from "node:assert/strict";

import { parseInbound, parseInboundMeta, parseInboundTwilio, normalizePhone } from "./wa-provider";

test("normalizePhone deja solo dígitos", () => {
  assert.equal(normalizePhone("whatsapp:+54 9 11 5555-1234"), "5491155551234");
  assert.equal(normalizePhone("+5491155551234"), "5491155551234");
});

// --- Meta ---------------------------------------------------------------------

function metaPayload(over: { type?: string; body?: string } = {}) {
  return {
    entry: [
      {
        changes: [
          {
            value: {
              contacts: [{ wa_id: "5491155551234", profile: { name: "Juan" } }],
              messages: [
                {
                  from: "5491155551234",
                  id: "wamid.ABC",
                  timestamp: "1751414400", // segundos
                  type: over.type ?? "text",
                  text: over.body === undefined ? { body: "hola quiero un turno" } : { body: over.body },
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

test("Meta: mensaje de texto → canónico con nombre y timestamp en ms", () => {
  const m = parseInboundMeta(metaPayload());
  assert.ok(m);
  assert.equal(m!.provider, "meta");
  assert.equal(m!.from, "5491155551234");
  assert.equal(m!.text, "hola quiero un turno");
  assert.equal(m!.messageId, "wamid.ABC");
  assert.equal(m!.contactName, "Juan");
  assert.equal(m!.timestamp, 1751414400 * 1000);
});

test("Meta: evento no-texto (imagen) → null", () => {
  assert.equal(parseInboundMeta(metaPayload({ type: "image" })), null);
});

test("Meta: status callback (sin messages) → null", () => {
  const statusPayload = { entry: [{ changes: [{ value: { statuses: [{ status: "delivered" }] } }] }] };
  assert.equal(parseInboundMeta(statusPayload), null);
});

test("Meta: payload basura → null (no rompe)", () => {
  assert.equal(parseInboundMeta(null), null);
  assert.equal(parseInboundMeta({}), null);
  assert.equal(parseInboundMeta({ entry: [] }), null);
});

// --- Twilio -------------------------------------------------------------------

test("Twilio: form → canónico, usa receivedAt como timestamp", () => {
  const m = parseInboundTwilio(
    { From: "whatsapp:+5491155551234", Body: "cuanto sale el corte?", MessageSid: "SM123", ProfileName: "Ana" },
    { receivedAt: 1751414400000 },
  );
  assert.ok(m);
  assert.equal(m!.provider, "twilio");
  assert.equal(m!.from, "5491155551234");
  assert.equal(m!.text, "cuanto sale el corte?");
  assert.equal(m!.messageId, "SM123");
  assert.equal(m!.contactName, "Ana");
  assert.equal(m!.timestamp, 1751414400000);
});

test("Twilio: sin body o sin sid → null", () => {
  assert.equal(parseInboundTwilio({ From: "whatsapp:+549", MessageSid: "SM1" }), null);
  assert.equal(parseInboundTwilio({ From: "whatsapp:+549", Body: "  ", MessageSid: "SM1" }), null);
  assert.equal(parseInboundTwilio({ Body: "hola", MessageSid: "SM1" }), null);
});

// --- Dispatcher por proveedor -------------------------------------------------

test("parseInbound enruta por proveedor", () => {
  assert.equal(parseInbound("meta", metaPayload())?.provider, "meta");
  assert.equal(
    parseInbound("twilio", { From: "whatsapp:+549", Body: "hola", MessageSid: "SM1" })?.provider,
    "twilio",
  );
});
