// Contacto enmascarado (casilla 5 de la matriz de permisos): quién ve el teléfono y el mail de la
// clienta, y qué ve quien no puede. Lo que importa no es el formato exacto de la máscara, sino que
// el número NO se pueda reconstruir ni usar para escribirle por WhatsApp.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { enmascararContacto, enmascararEmail, enmascararTelefono, puedeVerContacto } from "./telefono";
import { waLinkClienta } from "@/lib/whatsapp-cta";
import { contactoDeLaFicha } from "@/app/admin/(dashboard)/clientes/contacto-ficha";

const ana = { id: "c1", name: "Ana", phone: "+54 9 11 4000-4821", email: "ana@mail.com" };

test("la dueña y la recepción ven el contacto; el profesional no; sin sesión, nadie", () => {
  assert.equal(puedeVerContacto({ role: "OWNER", overrides: [] }), true);
  assert.equal(puedeVerContacto({ role: "RECEPTION", overrides: [] }), true);
  assert.equal(puedeVerContacto({ role: "PROFESSIONAL", overrides: [] }), false);
  assert.equal(puedeVerContacto(null), false);
  assert.equal(puedeVerContacto(undefined), false);
});

test("la excepción de la casilla manda sobre el rol, para los dos lados", () => {
  assert.equal(puedeVerContacto({ role: "PROFESSIONAL", overrides: [{ capability: "clients:contact", allowed: true }] }), true);
  assert.equal(puedeVerContacto({ role: "RECEPTION", overrides: [{ capability: "clients:contact", allowed: false }] }), false);
});

test("con permiso devuelve la MISMA ficha, sin tocar nada", () => {
  assert.equal(enmascararContacto(ana, { role: "RECEPTION", overrides: [] }), ana);
});

test("sin permiso: quedan los 4 últimos dígitos y la inicial del mail, y el resto de la ficha intacto", () => {
  const f = enmascararContacto(ana, { role: "PROFESSIONAL", overrides: [] });
  assert.equal(f.phone, "•••• 4821");
  assert.equal(f.email, "a…@…");
  assert.equal(f.name, "Ana");
  assert.equal(f.id, "c1");
  assert.equal(ana.phone, "+54 9 11 4000-4821", "no muta la original");
});

test("un teléfono enmascarado no arma link de WhatsApp: el botón se apaga solo", () => {
  for (const tel of ["+54 9 11 4000-4821", "1140004821", "011 15-4000-4821", "+1 415 555 0101"]) {
    assert.equal(waLinkClienta(enmascararTelefono(tel)), null, tel);
    assert.ok(!/\d{5}/.test(enmascararTelefono(tel)), "nunca quedan más de 4 dígitos seguidos");
  }
});

test("la ficha con el teléfono enmascarado no ofrece WhatsApp ni dice «no es un celular»", () => {
  assert.deepEqual(contactoDeLaFicha({ telefono: enmascararTelefono("1140004821"), noQuiere: false, puedeEditar: true }), { tipo: "oculto" });
  assert.equal(contactoDeLaFicha({ telefono: "1140004821", noQuiere: false, puedeEditar: true }).tipo, "whatsapp");
});

test("vacío y null quedan como estaban (no se inventa un contacto que no existe)", () => {
  assert.equal(enmascararTelefono(null), null);
  assert.equal(enmascararTelefono(""), "");
  assert.equal(enmascararEmail(null), null);
  assert.equal(enmascararTelefono("123"), "••••");
  const sinMail = enmascararContacto({ phone: "1140004821", email: null }, null);
  assert.equal(sinMail.email, null);
  assert.equal(sinMail.phone, "•••• 4821");
});

test("sólo toca las claves que la fila trae (no agrega `email` a una fila que no lo tenía)", () => {
  const f = enmascararContacto({ name: "Bea", phone: "1140001111" }, { role: "PROFESSIONAL", overrides: [] });
  assert.deepEqual(Object.keys(f).sort(), ["name", "phone"]);
});

// Guardas de forma: cada superficie que entrega el contacto pasa por el enmascarado. Si alguien
// borra la llamada, esto lo frena (la regla en sí está probada arriba con datos de verdad).
const SUPERFICIES: [string, RegExp][] = [
  ["src/lib/clientes/lista-fichas.server.ts", /enmascararContacto/],
  ["src/lib/clientes/buscar-actions.ts", /enmascararTelefono/],
  ["src/lib/clientes/buscar-para-venta.ts", /enmascararTelefono/],
  ["src/lib/buscador/buscar-en-el-negocio.ts", /enmascararTelefono/],
  ["src/lib/turnos/sin-cerrar.server.ts", /enmascararContacto/],
  ["src/lib/client-actions.ts", /puedeVerContacto/],
  ["src/app/admin/(dashboard)/turnos/agenda.server.ts", /enmascararContacto[\s\S]*telefonosSegunQuienMira/],
  ["src/app/admin/(dashboard)/turnos/lista/page.tsx", /enmascararContacto/],
  ["src/app/admin/(dashboard)/clientes/page.tsx", /enmascararTelefono/],
  ["src/app/admin/(dashboard)/clientes/[id]/page.tsx", /enmascararContacto/],
  ["src/app/admin/(dashboard)/clientes/[id]/FichaRenglon.tsx", /enmascararContacto/],
  ["src/app/admin/(dashboard)/clientes/[id]/FichaUnica.tsx", /enmascararContacto/],
  ["src/app/admin/(dashboard)/clientes/[id]/FichaProductora.tsx", /enmascararContacto/],
  ["src/app/admin/(dashboard)/clientes/duplicadas/page.tsx", /enmascararContacto/],
  ["src/app/admin/(dashboard)/clientes/hoy/page.tsx", /puedeVerContacto/],
  ["src/app/admin/(dashboard)/clientes/recuperar/page.tsx", /puedeVerContacto/],
  ["src/app/admin/(dashboard)/espera/page.tsx", /enmascararTelefono/],
  ["src/app/admin/(dashboard)/campania/page.tsx", /enmascararTelefono/],
  ["src/app/admin/(dashboard)/campania/export/route.ts", /puedeVerContacto\(user\)/],
];

test("«Confirmar mañana» se lee siempre por el loader que enmascara, nunca directo", () => {
  for (const archivo of ["turnos/page.tsx", "turnos/AgendaRenglon.tsx", "turnos/manana/page.tsx"]) {
    const fuente = readFileSync(new URL(`../../app/admin/(dashboard)/${archivo}`, import.meta.url), "utf8");
    assert.doesNotMatch(fuente, /getMananaConfirmar\(\)/, archivo);
  }
});

for (const [archivo, patron] of SUPERFICIES) {
  test(`${archivo} pasa el contacto por el enmascarado`, () => {
    const fuente = readFileSync(new URL(`../../../${archivo}`, import.meta.url), "utf8");
    assert.match(fuente, patron);
  });
}
