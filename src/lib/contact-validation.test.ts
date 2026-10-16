// CH-A1 — reserva valida email + teléfono AR (cliente y servidor comparten estas reglas puras).

import { test } from "node:test";
import assert from "node:assert/strict";
import { isValidEmail, isValidArgentinePhone, validateBookingContact, errorDelTelefonoDelPedido, TELEFONO_DEL_PEDIDO_INVALIDO } from "./contact-validation";

test("isValidEmail: acepta bien formados, rechaza basura", () => {
  assert.equal(isValidEmail("caro@gmail.com"), true);
  assert.equal(isValidEmail("a.b+c@sub.dominio.com.ar"), true);
  assert.equal(isValidEmail("esto-no-es-un-email"), false); // el caso del reporte CH-A1
  assert.equal(isValidEmail("sin@arroba"), false);
  assert.equal(isValidEmail("@nada.com"), false);
  assert.equal(isValidEmail(""), false);
  assert.equal(isValidEmail("  "), false);
});

test("isValidArgentinePhone: acepta formatos AR usuales, rechaza letras/cortos", () => {
  assert.equal(isValidArgentinePhone("11 2345 6789"), true);
  assert.equal(isValidArgentinePhone("+54 9 11 2345 6789"), true);
  assert.equal(isValidArgentinePhone("(0223) 15-345-678"), true);
  assert.equal(isValidArgentinePhone("2231234567"), true);
  assert.equal(isValidArgentinePhone("esto-no-es-un-email"), false); // letras
  assert.equal(isValidArgentinePhone("123"), false); // muy corto
  assert.equal(isValidArgentinePhone(""), false);
  assert.equal(isValidArgentinePhone("12345678901234"), false); // demasiado largo
});

test("validateBookingContact: teléfono obligatorio y con formato; email opcional pero válido si viene", () => {
  assert.deepEqual(validateBookingContact("11 2345 6789"), { ok: true });
  assert.deepEqual(validateBookingContact("11 2345 6789", ""), { ok: true }); // sin email → ok
  assert.deepEqual(validateBookingContact("11 2345 6789", "caro@gmail.com"), { ok: true });

  // CH-A1 repro: el botón Confirmar NO debe habilitarse con estos datos.
  const telMalo = validateBookingContact("esto-no-es-un-email");
  assert.equal(telMalo.ok, false);

  const mailMalo = validateBookingContact("11 2345 6789", "esto-no-es-un-email");
  assert.equal(mailMalo.ok, false);
});

test("pedido de la tienda: un WhatsApp que no es teléfono se rechaza con un texto que dice qué corregir", () => {
  for (const malo of ["hola", "123", "", "   ", "11-2345", "llamame al 11 2345 6789", "<script>", "12345678901234"]) {
    assert.equal(errorDelTelefonoDelPedido(malo), TELEFONO_DEL_PEDIDO_INVALIDO, `«${malo}» no es un teléfono`);
  }
  for (const bueno of ["11 2345 6789", "+54 9 11 2345-6789", "(0223) 15-345-678", "2234567890"]) {
    assert.equal(errorDelTelefonoDelPedido(bueno), null, `«${bueno}» es un teléfono`);
  }
});

test("pedido de la tienda: el mensaje del teléfono no nombra campos ni reglas internas", () => {
  assert.match(TELEFONO_DEL_PEDIDO_INVALIDO, /11 2345 6789/, "trae un ejemplo");
  assert.doesNotMatch(TELEFONO_DEL_PEDIDO_INVALIDO, /customerPhone|dígitos|regex|campo|10|13/i);
});
