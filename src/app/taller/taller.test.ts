// Vidriera del taller (AGR): lo que no se ve en el build pero rompe en la calle. node:test, sin base.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { mostrarPatente } from "@/lib/taller/core";
import { avisoPatente, patenteEnVivo, puedeSerPatente } from "./patente";
import { desde, esTrabajoPublicable } from "./reglas";
import { CSS_TALLER, ROJO_AGR } from "./estilos";

const RAIZ = process.cwd();
const AQUI = path.join(RAIZ, "src", "app", "taller");

function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    return statSync(p).isDirectory() ? archivos(p) : /\.(tsx?|css)$/.test(n) && !n.endsWith(".test.ts") ? [p] : [];
  });
}

test("el logo y su versión chica para la barra existen", () => {
  for (const f of ["logo.webp", "logo-88.webp"]) {
    assert.ok(existsSync(path.join(RAIZ, "public", "tenants", "taller-agr", "marca", f)), f);
  }
});

test("la letra se declara con next/font en un módulo propio y sólo la importa el layout del taller", () => {
  const fuentes = readFileSync(path.join(AQUI, "fuentes.ts"), "utf8");
  for (const fam of ["Barlow_Condensed", "Barlow", "IBM_Plex_Mono"]) assert.match(fuentes, new RegExp(`\\b${fam}\\(`), fam);
  // Una sola familia precargada: la del H1.
  assert.equal((fuentes.match(/preload: true/g) ?? []).length, 1);
  const deAca = archivos(AQUI).filter((f) => /from "\.\.?\/fuentes"/.test(readFileSync(f, "utf8")));
  assert.deepEqual(deAca.map((f) => path.relative(AQUI, f)), ["layout.tsx"]);
  const deAfuera = archivos(path.join(RAIZ, "src")).filter((f) => /taller\/fuentes"/.test(readFileSync(f, "utf8")));
  assert.deepEqual(deAfuera, []);
});

test("ningún texto de la vidriera trae datos de relleno (0000, $0, «consultar» como precio, WA en letras)", () => {
  for (const f of archivos(AQUI)) {
    const src = readFileSync(f, "utf8");
    assert.doesNotMatch(src, /0000/, f);
    assert.doesNotMatch(src, /\$\s?0(?![\d.,])/, f);
    assert.doesNotMatch(src, />\s*consultar\s*</i, f);
    assert.doesNotMatch(src, />\s*WA\s*</, f);
  }
});

test("la chapa del hero: los ejemplos del diseño", () => {
  assert.equal(mostrarPatente("ab123cd"), "AB 123 CD");
  assert.equal(mostrarPatente("abc123"), "ABC 123");
  assert.equal(patenteEnVivo("ab1"), "AB 1");
  assert.equal(patenteEnVivo("ab123c"), "AB 123 C");
  assert.equal(patenteEnVivo("ab-123-cd"), "AB 123 CD");
  assert.equal(patenteEnVivo("a123bcd"), "A 123 BCD");
  assert.equal(patenteEnVivo("ab123cdxyz"), "AB 123 CD");
  assert.equal(avisoPatente("hola"), "No parece una patente argentina; igual podés seguir.");
  assert.equal(avisoPatente("AB1"), null);
  assert.equal(avisoPatente("AB 123 CD"), null);
  assert.equal(avisoPatente(""), null);
  assert.ok(puedeSerPatente("12"));
  assert.ok(!puedeSerPatente("A1B"));
});

test("precios: «desde $ 25.000», y sin precio o «de ejemplo» no se publica", () => {
  assert.equal(desde(25000), "$ 25.000");
  assert.equal(desde(180000.4), "$ 180.000");
  assert.ok(esTrabajoPublicable({ name: "Cambio de aceite y filtro", price: 60000 }));
  assert.ok(!esTrabajoPublicable({ name: "Service completo", price: 0 }));
  assert.ok(!esTrabajoPublicable({ name: "Servicio de ejemplo", price: 1000 }));
  assert.ok(!esTrabajoPublicable({ name: "Trabajo DE EJEMPLO (editable)", price: 1000 }));
});

test("piel: rojo del logo, foco visible y nada se anima desde opacidad 0", () => {
  assert.equal(ROJO_AGR, "#d0111b");
  assert.match(CSS_TALLER, /:focus-visible\{outline:3px solid var\(--rojo\)/);
  assert.match(CSS_TALLER, /prefers-reduced-motion:reduce/);
  assert.doesNotMatch(CSS_TALLER, /opacity\s*:\s*0[;}]/);
  assert.match(CSS_TALLER, /env\(safe-area-inset-bottom\)/);
});
