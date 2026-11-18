// C5 (GSG-MIA-080): definir el PIN y cambiar la contraseña muestran el nombre del negocio (`Tenant.name`), nunca el
// genérico «Mi negocio» (branding.ts, DEFAULT_BRAND), también en un negocio sin ficha de marca.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { brandForSlug, marcaConElNombreDelNegocio } from "@/lib/branding";

test("C5: sin ficha de marca, la marca de la cuenta es el Tenant.name, nunca «Mi negocio»", () => {
  const sinFicha = brandForSlug("negocio-sin-ficha-xyz");
  assert.equal(sinFicha.name, "Mi negocio", "precondición: el negocio no tiene ficha");
  assert.equal(marcaConElNombreDelNegocio(sinFicha, null, "Constructora MIA").nombre, "Constructora MIA");
  assert.equal(marcaConElNombreDelNegocio(sinFicha, null, "  Panadería Sol  ").nombre, "Panadería Sol");
  for (const falta of [null, undefined, "", "   "]) {
    assert.notEqual(marcaConElNombreDelNegocio(sinFicha, null, falta).nombre, "Mi negocio", `sin nombre (${JSON.stringify(falta)})`);
  }
});

test("C5: con ficha propia o identidad de producto GSG, sigue la marca de siempre", () => {
  const conFicha = { ...brandForSlug("negocio-sin-ficha-xyz"), name: "Marca Propia", monogram: "MP", propia: true };
  assert.equal(marcaConElNombreDelNegocio(conFicha, null, "Otro Nombre").nombre, "Marca Propia");
  const sinFicha = brandForSlug("negocio-sin-ficha-xyz");
  assert.deepEqual(marcaConElNombreDelNegocio(sinFicha, { nombre: "Kudos", monograma: "K" }, "Otro Nombre"), { nombre: "Kudos", monograma: "K" });
});

test("C5: las dos pantallas de la cuenta usan la marca con el nombre del negocio (no `marcaDelNegocio` sola)", () => {
  const leer = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8");
  const cambiar = leer("src/app/admin/cambiar-password/page.tsx");
  assert.match(cambiar, /marcaConElNombreDelNegocio\(brand, identidad, negocio\)/);
  assert.doesNotMatch(cambiar, /marcaDelNegocio\(/);
  const hoja = leer("src/app/admin/login/HojaSimple.tsx");
  assert.match(hoja, /marcaConElNombreDelNegocio\(brand, null, nombreDelNegocio\)/);
  assert.doesNotMatch(hoja, /marcaDelNegocio\(/);
  assert.match(leer("src/app/admin/definir-pin/page.tsx"), /<HojaSimple titulo="Elegí tu PIN" nombreDelNegocio=\{negocio\}>/);
});
