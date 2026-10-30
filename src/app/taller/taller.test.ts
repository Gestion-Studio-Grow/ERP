// Vidriera del taller (AGR): lo que no se ve en el build pero rompe en la calle. node:test, sin base.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { mostrarPatente } from "@/lib/taller/core";
import { autoDeLaNota, avisoPatente, notaDelAuto, patenteEnVivo, puedeSerPatente } from "./patente";
import { desde, esTrabajoPublicable } from "./reglas";
import { CSS_TALLER, ROJO_AGR } from "./estilos";
import { rutaDelTurno } from "./EnlaceTurno";

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
  assert.equal(desde(1250000), "$ 1.250.000");
  assert.equal(desde(950), "$ 950");
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

test("la nota del turno: se arma con la patente y el modelo, y la página pública lee sólo esos dos datos", () => {
  assert.equal(notaDelAuto("AB 123 CD", " VW Gol Trend 2015 "), "Patente: AB 123 CD · Auto: VW Gol Trend 2015");
  assert.equal(notaDelAuto("", "Fiat Uno"), "Auto: Fiat Uno");
  assert.equal(notaDelAuto("", "  "), "");
  assert.deepEqual(autoDeLaNota(notaDelAuto("AC 456 GH", "Peugeot 208")), { patente: "AC 456 GH", auto: "Peugeot 208" });
  assert.deepEqual(autoDeLaNota(null), { patente: null, auto: null });
  // Lo que el panel le sume a la nota (interno) no sale en la página pública del turno.
  assert.deepEqual(autoDeLaNota("Patente: AB 123 CD · debe la seña del service anterior"), { patente: "AB 123 CD", auto: null });
  assert.deepEqual(autoDeLaNota("Cliente difícil, cobrar antes"), { patente: null, auto: null });
});

test("la confirmación y «ver mi turno» del taller van a su página propia; los demás negocios, como siempre", () => {
  for (const [ruta, destino] of [
    ["src/app/(site)/reserva/confirmacion/[id]/page.tsx", "`/taller/turno/${id}?nuevo=1`"],
    ["src/app/(site)/reserva/turno/[id]/page.tsx", "`/taller/turno/${id}`"],
  ] as const) {
    const fuente = readFileSync(path.join(RAIZ, ruta), "utf8");
    assert.ok(
      fuente.includes(`if (resolveAgendaRubroIdBySlug(await getCurrentTenantSlug()) === "taller") redirect(${destino});`),
      `${ruta}: el desvío tiene que depender sólo del rubro taller`,
    );
  }
  const pagina = readFileSync(path.join(AQUI, "turno", "[id]", "page.tsx"), "utf8");
  // Vocabulario del taller: puesto, no box; sin «Pendiente de pago»; el menú del taller (Barra) y no el del sitio.
  assert.match(pagina, /<dt>Puesto<\/dt>/);
  assert.doesNotMatch(pagina, />Box<|Pendiente de pago<|href="\/servicios"/);
  assert.match(pagina, /<Barra t=\{t\} \/>/);
});

test("la barra fija y la de arriba llevan la patente escrita en la chapa (?patente=)", () => {
  assert.equal(rutaDelTurno(""), "/taller/turno");
  assert.equal(rutaDelTurno("AC456GH"), "/taller/turno?patente=AC456GH");
  assert.equal(rutaDelTurno("AC456GHXX"), "/taller/turno?patente=AC456GH");
  const marco = readFileSync(path.join(AQUI, "marco.tsx"), "utf8");
  assert.doesNotMatch(marco, /<a href="\/taller\/turno" className="agr-btn">/, "la barra fija no puede ser un enlace fijo sin patente");
  assert.match(readFileSync(path.join(AQUI, "Chapa.tsx"), "utf8"), /publicarPatente\(normalizarPatente\(nuevo\)\)/);
});
