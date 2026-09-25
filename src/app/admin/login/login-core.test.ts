import { test } from "node:test";
import assert from "node:assert/strict";
import { LOGIN_RULE } from "@/lib/rate-limit";
import { CLAVE_EMAIL_DEL_INGRESO, avisoDeIngreso, campoParaElCursor, emailAlMontar, folioDelDia } from "./login-core";

test("sin error en la dirección, el ingreso no muestra aviso", () => {
  assert.equal(avisoDeIngreso(undefined), null);
  assert.equal(avisoDeIngreso(""), null);
});

test("clave equivocada: un solo mensaje que no revela si el email existe", () => {
  const a = avisoDeIngreso("1");
  assert.ok(a);
  assert.equal(a.titulo, "El email o la contraseña no coinciden.");
  assert.doesNotMatch(
    `${a.titulo} ${a.detalle}`,
    /no existe|no está registrado|usuario inexistente/i,
  );
});

test("el aviso de bloqueo dice los intentos y los minutos de la regla real del login", () => {
  const a = avisoDeIngreso("throttled");
  assert.ok(a);
  assert.match(a.detalle, new RegExp(`${LOGIN_RULE.max} intentos`));
  assert.match(
    a.detalle,
    new RegExp(`${LOGIN_RULE.windowMs / 60_000} minutos`),
  );
});

test("si la regla cambia, el texto cambia con ella (nunca promete otro tiempo)", () => {
  const a = avisoDeIngreso("throttled", { max: 3, windowMs: 10 * 60_000 });
  assert.ok(a);
  assert.match(a.detalle, /3 intentos/);
  assert.match(a.detalle, /10 minutos/);
  const b = avisoDeIngreso("1", { max: 3, windowMs: 10 * 60_000 });
  assert.match(
    b!.detalle,
    /3 intentos fallidos se frena el ingreso 10 minutos/,
  );
});

test("el folio del día es la fecha de la Argentina, no la del servidor en UTC", () => {
  // 25/09/2026 02:00 UTC = 24/09/2026 23:00 en Buenos Aires.
  assert.equal(
    folioDelDia(new Date("2026-09-25T02:00:00Z")),
    "jueves 24 de septiembre",
  );
  assert.equal(
    folioDelDia(new Date("2026-09-25T15:00:00Z")),
    "viernes 25 de septiembre",
  );
});

// ── Después de una clave equivocada: el email queda, la clave nunca ─────────────────────────
// `login()` redirige a `?error=1` y la página se arma de nuevo: sin esto, el email se borraba y
// lo que la persona estuviera tipeando mientras decía «Entrando…» se perdía.

test("con error, el email guardado vuelve al campo vacío", () => {
  assert.equal(emailAlMontar({ conError: true, enCampo: "", guardado: "ana@chestetica.com" }), "ana@chestetica.com");
});

test("lo que ya está tipeado en el campo no se pisa con el guardado", () => {
  assert.equal(emailAlMontar({ conError: true, enCampo: "otra@", guardado: "ana@chestetica.com" }), null);
});

test("sin error (entrada normal) el email no se completa solo", () => {
  assert.equal(emailAlMontar({ conError: false, enCampo: "", guardado: "ana@chestetica.com" }), null);
});

test("con error y nada guardado (otra pestaña), el campo queda como está", () => {
  assert.equal(emailAlMontar({ conError: true, enCampo: "", guardado: null }), null);
  assert.equal(emailAlMontar({ conError: true, enCampo: "", guardado: "   " }), null);
});

test("con el email de vuelta, el cursor va a la contraseña; sin email, al email", () => {
  assert.equal(campoParaElCursor({ conError: true, email: "ana@chestetica.com" }), "login-password");
  assert.equal(campoParaElCursor({ conError: true, email: "" }), "login-email");
  assert.equal(campoParaElCursor({ conError: false, email: "ana@chestetica.com" }), "login-email");
});

test("lo que se guarda en la pestaña es sólo el email: la clave no tiene clave de guardado", () => {
  assert.equal(CLAVE_EMAIL_DEL_INGRESO, "gsg:ingreso:email");
  assert.doesNotMatch(CLAVE_EMAIL_DEL_INGRESO, /pass|clave|contra/i);
});
