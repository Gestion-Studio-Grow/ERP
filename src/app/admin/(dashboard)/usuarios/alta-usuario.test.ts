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
  assert.match(cuerpo, /const negocio = await getNegocioApps\(actor\.role\);/);
  assert.match(cuerpo, /const conProyectos = appDelPanelCerrado\(negocio\)\?\.id === "proyectos";/);
  assert.match(cuerpo, /const alta = validarAltaDeUsuario\(formData, esMostrador, conProyectos\);/);
  assert.match(cuerpo, /if \(!alta\.ok\) backWith\(alta\.status\);/);
  assert.match(cuerpo, /const \{ name, email, role, password, puesto \} = alta;/);
  // MIA-229: la ficha nace en la misma transacción que el usuario, sólo si hay puesto (productora).
  assert.match(cuerpo, /luego: puesto \? \(tx, userId\) => fichaDelAltaEnTx\(tx, \{ tenantId, userId, nombre: name, email, rol: puesto \}\) : undefined/);
  // El rol no se vuelve a leer del formulario por otro lado.
  assert.ok(!/formData\.get\("role"\)/.test(cuerpo), "el rol sale sólo de la decisión");
  // La clave la fija la dueña: es provisoria y nace con el cambio obligatorio (GSG-SEG-013).
  assert.match(cuerpo, /data: \{ tenantId, name, email, role, passwordHash, mustChangePassword: true \}/);
});

test("MIA-229 · productora: se da de alta por puesto; el rol del ERP y la ficha salen del puesto (P1–P4 en decisiones-puestos.ts)", () => {
  const esperado: Record<string, { role: string; puesto: string | null }> = {
    DUENIO: { role: "OWNER", puesto: null },
    DIRECCION: { role: "RECEPTION", puesto: "DIRECCION" },
    ADMINISTRACION: { role: "OWNER", puesto: "ADMINISTRACION" },
    COMERCIAL: { role: "RECEPTION", puesto: "COMERCIAL" },
    // MIA-237: el orden del dueño (productor comercial, productor de campo, producción, diseño).
    PRODUCCION_CAMPO: { role: "PROFESSIONAL", puesto: "PRODUCCION_CAMPO" },
    PRODUCCION: { role: "PROFESSIONAL", puesto: "PRODUCCION" },
    DISENO: { role: "PROFESSIONAL", puesto: "DISENO" },
  };
  assert.deepEqual(rolesParaAlta(false, true).map((o) => o.valor), Object.keys(esperado));
  for (const [valor, e] of Object.entries(esperado)) {
    const r = validarAltaDeUsuario(formulario({ role: valor }), false, true);
    assert.ok(r.ok, valor);
    assert.deepEqual({ role: r.ok && r.role, puesto: r.ok && r.puesto }, e, valor);
  }
  // «Recepción» no existe en una productora, ni por un POST a mano; tampoco el rol del ERP pelado.
  for (const role of ["RECEPTION", "PROFESSIONAL", "OWNER", ""]) assert.deepEqual(validarAltaDeUsuario(formulario({ role }), false, true), { ok: false, status: "error_role" }, role);
});

test("MIA-229 · CH (servicios) y mostrador no cambian: sin productora no hay puestos ni ficha", () => {
  assert.deepEqual(rolesParaAlta(false).map((o) => o.valor), ["OWNER", "RECEPTION", "PROFESSIONAL"]);
  assert.deepEqual(rolesParaAlta(true).map((o) => o.valor), ["OWNER", "RECEPTION"]);
  for (const puesto of ["DIRECCION", "PRODUCCION", "DUENIO"]) assert.deepEqual(validarAltaDeUsuario(formulario({ role: puesto }), false), { ok: false, status: "error_role" }, puesto);
  const r = validarAltaDeUsuario(formulario({ role: "RECEPTION" }), false);
  assert.ok(r.ok && !("puesto" in r), "sin puesto: createUser no crea ficha (`luego` queda undefined)");
});

test("MIA-237 · productora: el alta ofrece «Productor comercial» y «Productor de campo» (ordenados), y Administración se lee sin usuarios ni permisos", () => {
  const opciones = rolesParaAlta(false, true);
  // El orden del dueño: los de la plata, los dos productores y después el resto. Los valores no cambian (las fichas siguen).
  assert.deepEqual(opciones.map((o) => o.valor), ["DUENIO", "DIRECCION", "ADMINISTRACION", "COMERCIAL", "PRODUCCION_CAMPO", "PRODUCCION", "DISENO"]);
  const texto = Object.fromEntries(opciones.map((o) => [o.valor, o.etiqueta]));
  assert.match(texto.COMERCIAL, /^Productor comercial \(.*cobros.*costos.*sin pagos/);
  assert.match(texto.PRODUCCION_CAMPO, /^Productor de campo \(.*sin importes/);
  assert.match(texto.ADMINISTRACION, /^Administración \(.*proyectos.*sin usuarios ni permisos\)/);
  // El rol del ERP de Administración sigue OWNER por Facturación: lo que no hace lo frena el puesto (decisiones-puestos.ts).
  const r = validarAltaDeUsuario(formulario({ role: "ADMINISTRACION" }), false, true);
  assert.ok(r.ok && r.role === "OWNER" && r.puesto === "ADMINISTRACION");
});
