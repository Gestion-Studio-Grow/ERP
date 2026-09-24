// El alta de usuarios (`createUser`) usa la MISMA decisión de roles que la pantalla: en un
// negocio de mostrador un Profesional no entra ni por un POST a mano; en CH, los tres como
// siempre. La action necesita la sesión de la dueña y la base, así que se ejecuta su decisión
// (`validarAltaDeUsuario`) y se comprueba que la action la usa y da de alta con lo que devuelve.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validarAltaDeUsuario } from "./alta-usuario";
import { rolesParaAlta } from "./roles";

function formulario(campos: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries({ name: "Lucía", email: "Lucia@Magra.com ", password: "secreta123", ...campos })) fd.set(k, v);
  return fd;
}

test("negocio de mostrador: Profesional se rechaza (aunque llegue por un POST a mano); Dueño y Mostrador pasan", () => {
  assert.deepEqual(validarAltaDeUsuario(formulario({ role: "PROFESSIONAL" }), true), { ok: false, status: "error_role" });
  for (const role of ["OWNER", "RECEPTION"]) {
    const r = validarAltaDeUsuario(formulario({ role }), true);
    assert.deepEqual(r, { ok: true, name: "Lucía", email: "lucia@magra.com", role, password: "secreta123" }, role);
  }
});

test("CH (servicios): se admiten los tres roles, como siempre", () => {
  for (const role of ["OWNER", "RECEPTION", "PROFESSIONAL"]) {
    const r = validarAltaDeUsuario(formulario({ role }), false);
    assert.equal(r.ok, true, role);
    assert.equal(r.ok && r.role, role);
  }
});

test("lo que acepta el servidor es exactamente lo que ofrece la pantalla, en los dos tipos de negocio", () => {
  for (const esMostrador of [true, false]) {
    const ofrecidos = rolesParaAlta(esMostrador).map((o) => o.valor).sort();
    const aceptados = ["OWNER", "RECEPTION", "PROFESSIONAL", "ADMIN", ""]
      .filter((role) => validarAltaDeUsuario(formulario({ role }), esMostrador).ok)
      .sort();
    assert.deepEqual(aceptados, ofrecidos, esMostrador ? "mostrador" : "servicios");
  }
});

test("los demás rechazos, con el aviso que muestra la pantalla", () => {
  assert.deepEqual(validarAltaDeUsuario(formulario({ role: "OWNER", name: "  " }), false), { ok: false, status: "error_name" });
  assert.deepEqual(validarAltaDeUsuario(formulario({ role: "OWNER", email: "sin-arroba" }), false), { ok: false, status: "error_email_invalid" });
  assert.deepEqual(validarAltaDeUsuario(formulario({ role: "ADMIN" }), false), { ok: false, status: "error_role" });
  assert.deepEqual(validarAltaDeUsuario(formulario({ role: "OWNER", password: "corta" }), false), { ok: false, status: "error_password_short" });
});

test("createUser decide con validarAltaDeUsuario y el negocio de la sesión, y da de alta con lo que devuelve", () => {
  const src = readFileSync(new URL("../../../../lib/user-actions.ts", import.meta.url), "utf8");
  const i = src.indexOf("export async function createUser(");
  assert.ok(i >= 0);
  const cuerpo = src.slice(i, src.indexOf("\n}\n", i));
  assert.match(cuerpo, /const \{ esMostrador \} = await getNegocioApps\(actor\.role\);/);
  assert.match(cuerpo, /const alta = validarAltaDeUsuario\(formData, esMostrador\);/);
  assert.match(cuerpo, /if \(!alta\.ok\) backWith\(alta\.status\);/);
  assert.match(cuerpo, /const \{ name, email, role, password \} = alta;/);
  // El rol no se vuelve a leer del formulario por otro lado.
  assert.ok(!/formData\.get\("role"\)/.test(cuerpo), "el rol sale sólo de la decisión");
  assert.match(cuerpo, /data: \{ tenantId, name, email, role, passwordHash \}/);
});
