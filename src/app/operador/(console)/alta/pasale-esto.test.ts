import { test } from "node:test";
import assert from "node:assert/strict";
import { LINEA_OTROS_LOCALES, pasaleEsto } from "./pasale-esto";

const base = { negocio: "Estética Norte", usuario: "ana@norte.com", clave: "k3y-Segura" };

test("con dirección: el mensaje lleva dirección, usuario y contraseña, y el WhatsApp no apunta a nadie fijo", () => {
  const p = pasaleEsto({ ...base, direccion: "https://norte.gsg.ar/admin" });
  assert.equal(p.estado, "con-direccion");
  assert.match(p.mensaje, /Estética Norte/);
  assert.match(p.mensaje, /Entrá en: https:\/\/norte\.gsg\.ar\/admin/);
  assert.match(p.mensaje, /Usuario: ana@norte\.com/);
  assert.match(p.mensaje, /Contraseña: k3y-Segura/);
  assert.ok(p.whatsapp.startsWith("https://wa.me/?text="));
  assert.equal(decodeURIComponent(p.whatsapp.split("?text=")[1]), p.mensaje);
});

test("sin dirección: lo dice honestamente y no inventa un link", () => {
  const p = pasaleEsto({ ...base, direccion: null });
  assert.equal(p.estado, "sin-direccion");
  assert.doesNotMatch(p.mensaje, /https?:\/\//);
  assert.match(p.mensaje, /la dirección para entrar te la paso cuando esté lista/i);
  assert.match(p.mensaje, /Usuario: ana@norte\.com/);
});

test("si todavía no se sabe la dirección, no afirma que no la tiene", () => {
  const p = pasaleEsto({ ...base, direccion: undefined });
  assert.equal(p.estado, "sin-saber");
  assert.doesNotMatch(p.mensaje, /https?:\/\//);
});

test("sin contraseña nueva (el dueño ya existía) no promete una", () => {
  const p = pasaleEsto({ ...base, clave: null, direccion: "https://x.gsg.ar/admin" });
  assert.doesNotMatch(p.mensaje, /Contraseña:/);
  assert.match(p.mensaje, /tu contraseña de siempre/);
});

test("refutador vuelta 4 · pidió varios locales: el mensaje dice que por ahora quedó el primero y los otros van aparte", () => {
  const base = { negocio: "Autoservicio Red Sur", direccion: "https://redsur.gsgapp.com.ar/admin", usuario: "duenio@redsur.test", clave: "Clave-1234" };
  const conLocales = pasaleEsto({ ...base, otrosLocales: true });
  assert.equal(conLocales.mensaje.split("\n")[1], LINEA_OTROS_LOCALES, "va segunda, antes de la dirección");
  assert.ok(decodeURIComponent(conLocales.whatsapp).includes(LINEA_OTROS_LOCALES), "también en el WhatsApp");
  assert.ok(!pasaleEsto(base).mensaje.includes(LINEA_OTROS_LOCALES), "un solo local: no la menciona");
});
