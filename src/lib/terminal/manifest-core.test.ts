// Tests del manifiesto del backoffice por negocio (plan T-5). Regla madre: la marca de un negocio
// nunca aparece en el manifiesto de otro (MT-1, J-2); sin ficha → "Mi negocio" neutro.

import { test } from "node:test";
import assert from "node:assert/strict";
import { brandForSlug, resolveAccent, ACCENT_PRESETS } from "../branding";
import {
  ICONOS_GENERICOS,
  FONDO_NEUTRO,
  iconosPara,
  manifestDe,
  nombreCorto,
  panelInstalable,
} from "./manifest-core";

const armar = (slug: string | null, conIcono?: ReadonlySet<string>) => {
  const marca = brandForSlug(slug);
  return manifestDe(marca, resolveAccent(marca.preset, "light").accent, iconosPara(slug, conIcono));
};

test("CH (beauty-spa) se presenta como CH Estética, con su acento", () => {
  const m = armar("beauty-spa");
  assert.equal(m.name, "CH Estética");
  assert.equal(m.short_name, "CH Estética");
  assert.equal(m.theme_color, ACCENT_PRESETS.petroleo.light);
});

test("slug sin ficha → 'Mi negocio' neutro, nunca la marca ni el color de CH (regresión MT-1)", () => {
  for (const slug of ["un-negocio-sin-ficha", "", null]) {
    const m = armar(slug);
    assert.equal(m.name, "Mi negocio");
    assert.notEqual(m.name, "CH Estética");
    assert.notEqual(m.theme_color, ACCENT_PRESETS.petroleo.light);
    assert.ok(!JSON.stringify(m).includes("CH"), `se filtró CH en ${JSON.stringify(m)}`);
    assert.deepEqual(m.icons, ICONOS_GENERICOS);
  }
});

test("ningún negocio real lleva el nombre de otro", () => {
  const slugs = ["beauty-spa", "magra", "shinevelas", "adosmanos", "quebienoles"];
  const nombres = slugs.map((s) => armar(s).name);
  assert.equal(new Set(nombres).size, nombres.length);
  for (const s of slugs.filter((x) => x !== "beauty-spa")) assert.notEqual(armar(s).name, "CH Estética");
});

test("scope, start_url e id siempre /admin; standalone, es-AR y fondo neutro", () => {
  for (const slug of ["beauty-spa", "magra", null]) {
    const m = armar(slug);
    assert.equal(m.scope, "/admin");
    assert.equal(m.start_url, "/admin");
    assert.equal(m.id, "/admin");
    assert.equal(m.display, "standalone");
    assert.equal(m.lang, "es-AR");
    assert.equal(m.background_color, FONDO_NEUTRO);
  }
});

test("íconos: propios sólo si el negocio está en la lista; nunca los de otro negocio", () => {
  const conIcono = new Set(["magra"]);
  const magra = armar("magra", conIcono);
  assert.ok(magra.icons.every((i) => i.src.startsWith("/tenants/magra/")));
  assert.ok(magra.icons.some((i) => i.sizes === "192x192") && magra.icons.some((i) => i.sizes === "512x512"));
  const shine = armar("shinevelas", conIcono);
  assert.deepEqual(shine.icons, ICONOS_GENERICOS);
  assert.ok(!JSON.stringify(shine).includes("magra"));
  // Con la lista de hoy (vacía) todos usan el genérico.
  assert.deepEqual(armar("beauty-spa").icons, ICONOS_GENERICOS);
});

test("el manifiesto no comparte arrays con el genérico (no se puede mutar entre pedidos)", () => {
  const m = armar(null);
  m.icons[0].src = "/otro.png";
  assert.equal(ICONOS_GENERICOS[0].src, "/gsg/icon-192.png");
});

test("nombreCorto: ≤ 12 caracteres, por palabras enteras", () => {
  assert.equal(nombreCorto("Break Point Pádel"), "Break Point");
  assert.equal(nombreCorto("Circuito WPE"), "Circuito WPE");
  assert.equal(nombreCorto("Mi negocio"), "Mi negocio");
  assert.equal(nombreCorto("Supercalifragilístico SA"), "Supercalifra");
  for (const n of ["CH Estética", "A Dos Manos", "Qué Bien Olés", "Shine"]) assert.ok(nombreCorto(n).length <= 12);
});

test("nombre vacío en la marca → 'Mi negocio' (no un ícono sin nombre)", () => {
  assert.equal(manifestDe({ name: "  " }, "#000000", []).name, "Mi negocio");
});

test("M6: el panel se ofrece para instalar SÓLO con mostrador (terminal o club); CH sin esos módulos no cambia", () => {
  assert.equal(panelInstalable([]), false, "sin módulos (o sin base: fail-open), no");
  assert.equal(panelInstalable(["agenda", "caja", "facturacion"]), false, "CH: sin mostrador, no");
  assert.equal(panelInstalable(["pos", "terminal"]), true);
  assert.equal(panelInstalable(["club"]), true, "el club de Break Point");
});
