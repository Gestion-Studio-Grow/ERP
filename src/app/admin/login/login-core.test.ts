import { test } from "node:test";
import assert from "node:assert/strict";
import { LOGIN_RULE } from "@/lib/rate-limit";
import { avisoDeIngreso, folioDelDia } from "./login-core";

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
