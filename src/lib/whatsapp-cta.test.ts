import { test } from "node:test";
import assert from "node:assert/strict";

import { sanitizePhone, buildWhatsAppHref, whatsappStorageKey } from "./whatsapp-cta";

test("sanitizePhone deja solo dígitos", () => {
  assert.equal(sanitizePhone("+54 9 11 2233-4455"), "5491122334455");
  assert.equal(sanitizePhone("5491122334455"), "5491122334455");
});

test("sanitizePhone de null/undefined/vacío da string vacío", () => {
  assert.equal(sanitizePhone(null), "");
  assert.equal(sanitizePhone(undefined), "");
  assert.equal(sanitizePhone(""), "");
});

test("buildWhatsAppHref arma el link con el número saneado y el texto codificado", () => {
  assert.equal(
    buildWhatsAppHref("54 9 11 2233-4455", "¡Hola! Quiero hacer un pedido."),
    "https://wa.me/5491122334455?text=%C2%A1Hola!%20Quiero%20hacer%20un%20pedido.",
  );
});

test("whatsappStorageKey namespacea por tenant", () => {
  assert.equal(whatsappStorageKey("magra"), "gsg-whatsapp-magra");
  assert.notEqual(whatsappStorageKey("magra"), whatsappStorageKey("shinevelas"));
});
