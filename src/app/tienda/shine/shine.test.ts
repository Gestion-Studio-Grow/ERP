// ============================================================================
// LA VIDRIERA DE SHINE — el catálogo atado a su fuente y lo que viaja en el pedido.
// ============================================================================
//
// Qué se prueba:
//   · cada producto de catalogo.ts está en el catálogo oficial (docs/diseno/catalogo-shine-2026.md) con
//     el MISMO precio, y no hay nombres inventados;
//   · las cartas de aromas son las del documento, letra por letra;
//   · cada foto existe en sus dos tamaños WebP, y cada foto real del PDF tiene su WebP;
//   · un producto que no está en el catálogo (los de la semilla del rubro) lleva una foto real de su
//     familia rotulada como ilustrativa, nunca un degradé;
//   · la nota del pedido lleva el aroma de cada renglón y nunca pasa el tope del servidor;
//   · el copy de la marca es el del catálogo (manifiesto, aromas) y no promete lo que no tiene fuente;
//   · el peso de lo que baja la portada (trama, logo y póster) y que las letras de la marca (next/font)
//     sólo viajen con esta vidriera.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { getStorefrontCopy } from "@/tenants/storefront";
import {
  AROMAS_DIFUSOR,
  AROMAS_VELA,
  CATALOGO,
  CIERRE,
  MANIFIESTO,
  REGALOS,
  TOPE_NOTA,
  entradaDe,
  normalizar,
  notaConAromas,
  rutaFoto,
  vistaDe,
} from "./catalogo";

const RAIZ = path.resolve(import.meta.dirname, "../../../..");
const PUBLICO = path.join(RAIZ, "public");
const DOC = readFileSync(path.join(RAIZ, "docs/diseno/catalogo-shine-2026.md"), "utf8");
const kb = (rel: string) => statSync(path.join(PUBLICO, rel)).size / 1024;

/** Las filas de las tablas de productos del documento: nombre normalizado → precio de la página. */
function filasDelDocumento(): Map<string, number> {
  const filas = new Map<string, number>();
  const desde = DOC.indexOf("## Productos y precios");
  for (const linea of DOC.slice(desde).split("\n")) {
    if (!linea.startsWith("|") || /^\|\s*-/.test(linea) || /Producto\s*\|/.test(linea)) continue;
    const celdas = linea.split("|").map((c) => c.trim()).filter(Boolean);
    const precio = celdas[celdas.length - 1].match(/\$([\d.]+)/);
    if (precio) filas.set(normalizar(celdas[0]), Number(precio[1].replace(/\./g, "")));
  }
  return filas;
}

test("cada producto del catálogo de la vidriera está en el PDF de la dueña, con el mismo precio", () => {
  const filas = filasDelDocumento();
  assert.equal(filas.size, 42, "el documento trae 42 productos");
  assert.equal(CATALOGO.length, filas.size, "ni uno de más ni uno de menos");
  for (const e of CATALOGO) {
    assert.ok(filas.has(normalizar(e.nombre)), `«${e.nombre}» no figura en el catálogo oficial`);
    assert.equal(e.precio, filas.get(normalizar(e.nombre)), `precio de «${e.nombre}»`);
  }
  assert.equal(new Set(CATALOGO.map((e) => e.clave)).size, CATALOGO.length, "claves únicas");
});

test("las cartas de aromas son las del documento, letra por letra", () => {
  const lista = (rotulo: string) => {
    const m = DOC.match(new RegExp(`\\*\\*${rotulo}[^*]*\\*\\*([^\\n]+(?:\\n  [^\\n]+)*)`));
    assert.ok(m, rotulo);
    return m[1].split("·").map((s) => s.trim());
  };
  assert.deepEqual([...AROMAS_VELA], lista("Velas \\(9\\):"));
  assert.deepEqual([...AROMAS_DIFUSOR], lista("Difusores / Home spray \\(6\\):"));
});

test("cada foto existe en sus dos tamaños (WebP) y cada foto real del PDF tiene su WebP", () => {
  const fotos = new Set([...CATALOGO.flatMap((e) => e.fotos), ...REGALOS.map((g) => g.foto)]);
  for (const f of fotos) {
    for (const t of [480, 900] as const) assert.ok(existsSync(path.join(PUBLICO, rutaFoto(f, t))), `${f}-${t}.webp`);
  }
  const originales = readdirSync(path.join(PUBLICO, "demo-shine-shop/img")).filter((f) => f.endsWith(".jpg"));
  assert.equal(originales.length, 40);
  for (const o of originales) assert.ok(existsSync(path.join(PUBLICO, rutaFoto(o.replace(/\.jpg$/, ""), 900))), `falta el WebP de ${o}`);
  for (const f of fotos) assert.ok(kb(rutaFoto(f, 900)) <= 110, `${f}-900.webp pesa más de 110 KB`);
});

test("el nombre del ERP encuentra su ficha aunque esté escrito distinto", () => {
  assert.equal(entradaDe('"Huele a que…"')?.clave, "huele-a-que");
  assert.equal(entradaDe("Huele a que")?.clave, "huele-a-que");
  assert.equal(entradaDe("Peonía")?.clave, "peonia");
  assert.equal(entradaDe("Sol y Luna")?.clave, "sol-luna");
  assert.equal(entradaDe("KIT DIFU + HOME")?.clave, "kit-difu-home");
  assert.equal(entradaDe("Vela Lavanda"), null);
});

test("producto fuera del catálogo: foto real de su familia rotulada como ilustrativa, o el ícono; nunca inventa", () => {
  const vela = vistaDe({ id: "p1", name: "Vela Lavanda" });
  assert.equal(vela.familia, "envase");
  assert.equal(vela.ilustrativa, true);
  assert.deepEqual(vela.fotos, [rutaFoto("morronero-liso", 900)]);
  assert.match(vela.alt, /ilustrativa/i);
  assert.deepEqual(vela.aromas, AROMAS_VELA);
  const difusor = vistaDe({ id: "p2", name: "Difusor Jazmín" });
  assert.equal(difusor.familia, "difu");
  assert.deepEqual(difusor.aromas, AROMAS_DIFUSOR);
  const espejo = vistaDe({ id: "p3", name: "Espejo decorativo redondo" });
  assert.deepEqual(espejo.fotos, [], "sin familia: el ícono de la marca, no una foto ajena");
  assert.equal(espejo.clave, "p3");
  // Los del catálogo: su foto, su alt real (nunca vacío) y su carta de aromas.
  for (const e of CATALOGO) {
    const v = vistaDe({ id: "x", name: e.nombre });
    assert.equal(v.ilustrativa, false);
    assert.ok(v.alt.length > 20, e.nombre);
    assert.equal(v.fotos.length, e.fotos.length);
  }
  assert.equal(vistaDe({ id: "x", name: "Apaga velas" }).aromas.length, 0, "el apaga velas no lleva aroma");
});

test("la nota del pedido: el aroma de cada renglón y después la nota libre, sin pasar el tope del servidor", () => {
  assert.equal(
    notaConAromas(
      [
        { nombre: "Peonia", cantidad: 2, aroma: "Lavanda" },
        { nombre: "Oso XL", cantidad: 1, aroma: "Rosas" },
        { nombre: "Apaga velas", cantidad: 1, aroma: null },
      ],
      "  Es para regalo ",
    ),
    "Aromas: Peonia ×2 — Lavanda · Oso XL ×1 — Rosas | Es para regalo",
  );
  assert.equal(notaConAromas([{ nombre: "Apaga velas", cantidad: 1, aroma: null }], ""), "");
  assert.equal(notaConAromas([], "hola"), "hola");
  const larga = notaConAromas([{ nombre: "Peonia", cantidad: 1, aroma: "Lavanda" }], "x".repeat(900));
  assert.ok(larga.length <= TOPE_NOTA);
  assert.ok(larga.startsWith("Aromas: Peonia ×1 — Lavanda | x"), "se recorta la nota libre, no los aromas");
});

test("el copy de Shine es el del catálogo y no promete lo que no tiene fuente", () => {
  const c = getStorefrontCopy("shinevelas");
  assert.ok(c);
  assert.equal(c.intro, MANIFIESTO);
  assert.ok(DOC.replace(/\r?\n>\s*/g, " ").includes(MANIFIESTO), "el manifiesto es textual");
  assert.ok(DOC.replace(/\s+/g, " ").includes(CIERRE), "el cierre es textual");
  assert.deepEqual(c.gourmetItems, [...AROMAS_VELA]);
  assert.equal(c.tagline, "Que tu luz nunca se apague.");
  const todo = JSON.stringify(c);
  for (const prohibido of [/mecha de algod/i, /Descubr[ií] nuestra colecci/i, /env[ií]o gratis/i, /Set Ritual|Caja Aromas|Deco & Luz/, /Armá tu ritual/]) {
    assert.doesNotMatch(todo, prohibido);
  }
  assert.equal(c.reviews.length, 0, "sin reseñas reales, ninguna");
});

test("lo que baja la portada: trama ≤ 40 KB, logo ≤ 21 KB (el de estetica-base), póster ≤ 70 KB", () => {
  assert.ok(kb("tenants/shinevelas/brand/trama.webp") <= 40);
  // El logo.webp es el que generó estetica-base (20 KB, mismos bytes para no chocar al juntar ramas); el
  // diseño pedía ≤ 12 KB: queda anotado como pendiente de esa rama.
  assert.ok(kb("tenants/shinevelas/brand/logo.webp") <= 21);
  assert.ok(kb("tenants/shinevelas/brand/poster-vela.webp") <= 70);
});

test("las letras de Shine (next/font) se declaran en su módulo y sólo las importa la vidriera de Shine", () => {
  const fuentes = readFileSync(path.join(RAIZ, "src/app/tienda/shine/fuentes.ts"), "utf8");
  assert.match(fuentes, /from "next\/font\/google"/);
  // Sólo la del H1 se precarga.
  assert.equal((fuentes.match(/preload: true/g) ?? []).length, 1);
  const quienes: string[] = [];
  const recorrer = (d: string) => {
    for (const f of readdirSync(d)) {
      const p = path.join(d, f);
      if (statSync(p).isDirectory()) recorrer(p);
      else if (/\.tsx?$/.test(f)) {
        const src = readFileSync(p, "utf8");
        const enShine = path.basename(d) === "shine" && /from ["']\.\/fuentes["']/.test(src);
        if (enShine || /from ["'][^"']*shine\/fuentes["']/.test(src)) quienes.push(path.relative(RAIZ, p).split(path.sep).join("/"));
      }
    }
  };
  recorrer(path.join(RAIZ, "src"));
  assert.deepEqual(quienes, ["src/app/tienda/shine/ShineFront.tsx"]);
});

test("la vidriera no usa las fotos de ambiente sin confirmar", () => {
  const dir = path.join(RAIZ, "src/app/tienda/shine");
  const codigo = readdirSync(dir)
    .filter((f) => /\.(tsx?|ts)$/.test(f) && !f.endsWith(".test.ts"))
    .flatMap((f) => readFileSync(path.join(dir, f), "utf8").split("\n"))
    .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)) // sin comentarios: el código, no la historia
    .join("\n");
  assert.doesNotMatch(codigo, /["'`/][\w/.-]*(hero|ambiance|gift|mundo-[a-z]+)\.(jpg|webp)/, "ninguna ruta a las fotos de ambiente");
  assert.doesNotMatch(codigo, /0000 0000/);
});
