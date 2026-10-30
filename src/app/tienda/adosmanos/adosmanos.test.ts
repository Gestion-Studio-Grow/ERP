// ============================================================================
// LA VIDRIERA DE A DOS MANOS — la ficha de cada pala atada a su fuente y lo que viaja en el pedido.
// ============================================================================
//
// Qué se prueba:
//   · cada pala de palas.ts tiene fuente (URL https), fecha de relevamiento y está en el catálogo semilla
//     del rubro con el MISMO nombre (no hay fichas de palas inventadas); los nombres son únicos;
//   · la vista de cada producto de la semilla: sección, marca (de las que publica el copy) y silueta;
//   · el recomendador devuelve SIEMPRE una pareja (pala + zapatilla) con su porqué, para las 18 combinaciones;
//   · el precio por transferencia no se muestra mientras la constante esté apagada, y si se prende es
//     lista × 0,72 redondeado a $100;
//   · el talle viaja en la nota del pedido y la nota nunca pasa el tope del servidor (500);
//   · sin fotos no hay <img> (ni rotas): todo producto se dibuja en SVG;
//   · sin WhatsApp no hay chat: cada salida a WhatsApp del front está detrás de `hayWhatsApp` / `whatsapp`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { getRetailRubro } from "@/blueprints/retail";
import { getStorefrontCopy } from "@/tenants/storefront";
import { NOMBRE_FORMA, NOMBRE_JUEGO, PALAS, fichaDe, formaPorNombre } from "./palas";
import { TOPE_NOTA, itemsDe, notaConTalles, vistaDe, type Silueta as TipoSilueta } from "./catalogo";
import { EFECTO_DEL_BALANCE, porqueDePala, recomendar, topeDePalas, type NivelDeJuego, type Tope } from "./recomendador";
import { MOSTRAR_PRECIO_TRANSFERENCIA, precioTransferencia } from "./tokens";
import { Silueta } from "./Siluetas";
import type { Juego } from "./palas";

const AQUI = import.meta.dirname;
const copy = getStorefrontCopy("adosmanos");
const rubro = getRetailRubro("padel");
const semilla = (rubro?.catalog ?? []).map((c, i) => ({
  id: `p${i}`,
  name: c.name,
  saleUnit: "UNIT" as const,
  price: "price" in c ? c.price : null,
  pricePerKg: "pricePerKg" in c ? c.pricePerKg : null,
  unit: "u",
  disponibilidad: null,
}));

test("hay copy y catálogo semilla de A Dos Manos", () => {
  assert.ok(copy, "copy de adosmanos");
  assert.ok(semilla.length > 0, "catálogo del rubro padel");
});

test("cada pala de palas.ts tiene fuente, fecha y está en el catálogo con el mismo nombre", () => {
  const nombres = new Set(semilla.map((p) => p.name));
  const vistos = new Set<string>();
  for (const p of PALAS) {
    assert.match(p.fuente, /^https:\/\/[^\s]+$/, `${p.catalogo}: fuente`);
    assert.match(p.verificadoEl, /^\d{4}-\d{2}-\d{2}$/, `${p.catalogo}: fecha`);
    assert.ok(nombres.has(p.catalogo), `${p.catalogo}: no está en el catálogo semilla`);
    assert.ok(!vistos.has(p.catalogo), `${p.catalogo}: repetida`);
    vistos.add(p.catalogo);
    assert.ok(p.modelo && p.peso && p.nucleo && p.cara && p.balance, `${p.catalogo}: datos vacíos`);
  }
});

test("los nombres del catálogo semilla son únicos", () => {
  const n = semilla.map((p) => p.name);
  assert.equal(new Set(n).size, n.length);
});

test("una pala sin ficha no se completa: queda null y sólo se dibuja por regla del nombre", () => {
  assert.equal(fichaDe("Pala Inventada X"), null);
  assert.equal(formaPorNombre("Pala Nox AT10 Luxury"), "lagrima");
  const v = vistaDe("Pala Bullpadel Hack 03", copy!.providers);
  assert.equal(v.seccion, "palas");
  assert.equal(v.ficha, null);
  assert.equal(v.formaConFuente, false);
});

test("la vista de la semilla: sección, marca de las del copy y silueta", () => {
  const items = itemsDe(semilla, copy!.providers);
  const palas = items.filter((p) => p.vista.seccion === "palas");
  const zapas = items.filter((p) => p.vista.seccion === "calzado");
  assert.equal(palas.length, 6);
  assert.equal(zapas.length, 4);
  for (const p of palas) {
    assert.ok(p.vista.ficha, `${p.name}: sin ficha`);
    assert.equal(p.vista.silueta, p.vista.ficha!.forma);
    assert.ok(p.vista.marca && copy!.providers.includes(p.vista.marca), `${p.name}: marca`);
  }
  for (const z of zapas) assert.equal(z.vista.silueta, "zapatilla");
  // «Protector de pala» es accesorio, no pala.
  assert.equal(items.find((p) => p.name === "Protector de pala transparente")?.vista.seccion, "accesorios");
  // Los slugs (para ?p= y ?vs=) no se repiten.
  assert.equal(new Set(items.map((p) => p.vista.slug)).size, items.length);
});

test("el recomendador siempre devuelve una pareja con su porqué", () => {
  const items = itemsDe(semilla, copy!.providers);
  const tope = topeDePalas(items.filter((p) => p.vista.seccion === "palas"));
  assert.ok(tope > 0);
  for (const nivel of ["empiezo", "seguido", "compito"] as NivelDeJuego[])
    for (const juego of ["control", "equilibrio", "potencia"] as Juego[])
      for (const t of ["hasta", "sin-tope"] as Tope[]) {
        const r = recomendar(items, { nivel, juego, tope: t });
        assert.ok(r.pala && r.pala.vista.seccion === "palas", `${nivel}/${juego}/${t}: pala`);
        assert.ok(r.zapatilla && r.zapatilla.vista.seccion === "calzado", `${nivel}/${juego}/${t}: zapatilla`);
        assert.ok(r.porquePala.length > 10 && r.porqueZapatilla.length > 10);
        if (t === "hasta") assert.ok(r.pala.precio <= tope, `${nivel}/${juego}: respeta el tope`);
      }
  // Control lleva a la redonda; potencia, a una diamante.
  assert.equal(recomendar(items, { nivel: "seguido", juego: "control", tope: "sin-tope" }).pala?.vista.forma, "redonda");
  assert.equal(recomendar(items, { nivel: "compito", juego: "potencia", tope: "sin-tope" }).pala?.vista.forma, "diamante");
});

test("el precio por transferencia no se muestra mientras la constante esté apagada", () => {
  assert.equal(MOSTRAR_PRECIO_TRANSFERENCIA, false, "el dueño no cargó ese precio: va apagado");
  assert.equal(precioTransferencia(329900), null);
  // Prendido: lista × 0,72 redondeado a $100.
  assert.equal(precioTransferencia(329900, true, 0.28), 237500);
  assert.equal(precioTransferencia(129900, true, 0.28), 93500);
  assert.equal(precioTransferencia(129900, true, null), null);
});

test("el talle viaja en la nota del pedido y la nota no pasa el tope", () => {
  const nota = notaConTalles([{ nombre: "Zapatillas Asics Gel-Padel Pro", cantidad: 1, talle: "42" }, { nombre: "Pala Adidas RX Series", cantidad: 1, talle: null }], "Juego de revés");
  assert.match(nota, /Zapatillas Asics Gel-Padel Pro, talle 42 \(x1\)/);
  assert.match(nota, /Juego de revés$/);
  assert.doesNotMatch(nota, /RX Series/);
  assert.ok(notaConTalles([{ nombre: "Z", cantidad: 1, talle: "40" }], "x".repeat(900)).length <= TOPE_NOTA);
  assert.equal(notaConTalles([], "  "), "");
});

test("sin fotos no hay <img>: cada producto se dibuja en SVG", () => {
  const tipos: TipoSilueta[] = ["redonda", "lagrima", "diamante", "zapatilla", "tubo", "paletero", "mochila", "grip", "muniequera", "protector"];
  for (const t of tipos) {
    const html = renderToStaticMarkup(createElement(Silueta, { tipo: t, marca: "Nox" }));
    assert.match(html, /^<svg[^>]*aria-hidden="true"/, `${t}: svg decorativo`);
    assert.doesNotMatch(html, /<img/);
  }
  for (const f of readdirSync(AQUI).filter((f) => /\.tsx$/.test(f))) {
    const src = readFileSync(path.join(AQUI, f), "utf8");
    assert.doesNotMatch(src, /<img\b|next\/image/, `${f}: no hay fotos reales todavía`);
  }
});

test("sin WhatsApp no hay chat: cada salida a WhatsApp está detrás del número", () => {
  for (const f of readdirSync(AQUI).filter((f) => /\.tsx$/.test(f))) {
    const src = readFileSync(path.join(AQUI, f), "utf8");
    // wa.me sólo en la página de gracias, dentro de `{whatsapp && (`.
    for (const m of src.matchAll(/wa\.me/g)) {
      const antes = src.slice(Math.max(0, m.index - 240), m.index);
      assert.match(antes, /\{whatsapp && \(/, `${f}: wa.me sin guardia`);
    }
    // Los botones que abren el chat (alConsultar / wa) van con `hayWhatsApp &&`.
    for (const m of src.matchAll(/onClick=\{\(\) => (alConsultar|wa)\(/g)) {
      const antes = src.slice(Math.max(0, m.index - 260), m.index);
      assert.match(antes, /hayWhatsApp && /, `${f}: botón de WhatsApp sin guardia`);
    }
  }
});

test("el porqué de la pala sale de SU ficha en las 18 combinaciones (QA 29/10, MEDIA-1)", () => {
  const items = itemsDe(semilla, copy!.providers);
  const efectos = Object.values(EFECTO_DEL_BALANCE);
  for (const nivel of ["empiezo", "seguido", "compito"] as NivelDeJuego[])
    for (const juego of ["control", "equilibrio", "potencia"] as Juego[])
      for (const t of ["hasta", "sin-tope"] as Tope[]) {
        const caso = `${nivel}/${juego}/${t}`;
        const r = recomendar(items, { nivel, juego, tope: t });
        const f = r.pala!.vista.ficha!;
        assert.equal(r.porquePala, porqueDePala(r.pala!, { nivel, juego, tope: t }), caso);
        // Forma, balance y juego de la pala recomendada, tal cual figuran en su ficha (los de «Enfrentadas»).
        assert.ok(r.porquePala.startsWith(`${NOMBRE_FORMA[f.forma]}, balance ${f.balance.split(" ")[0]}, juego de ${NOMBRE_JUEGO[f.juego].toLowerCase()}:`), `${caso}: ${r.porquePala}`);
        // El efecto es el de SU balance y ningún otro.
        const propio = /alto/i.test(f.balance) ? EFECTO_DEL_BALANCE.alto : /bajo/i.test(f.balance) ? EFECTO_DEL_BALANCE.bajo : EFECTO_DEL_BALANCE.medio;
        assert.ok(r.porquePala.includes(propio), `${caso}: efecto propio`);
        for (const otro of efectos.filter((e) => e !== propio)) assert.ok(!r.porquePala.includes(otro), `${caso}: dice «${otro}»`);
        // Si no es del juego pedido, lo dice; si lo es, no.
        assert.equal(r.porquePala.includes(`No es de ${NOMBRE_JUEGO[juego].toLowerCase()}`), f.juego !== juego, `${caso}: juego`);
      }
  // El caso del informe: Empiezo · Potencia · Hasta el tope ya no promete pegada de una pala de balance medio.
  const r = recomendar(items, { nivel: "empiezo", juego: "potencia", tope: "hasta" });
  if (!/alto/i.test(r.pala!.vista.ficha!.balance)) assert.ok(!r.porquePala.includes("peso arriba"));
});

// Ronda 2, P0-2: las promesas apagadas no viajan en el HTML (se filtran en el servidor).
test("promesas apagadas: fuera del copy que se serializa", async () => {
  const { copySinPromesasApagadas } = await import("./promesas");
  const { getStorefrontCopy } = await import("@/tenants/storefront");
  const { PROMESAS } = await import("./tokens");
  const copy = getStorefrontCopy("adosmanos")!;
  const limpio = copySinPromesasApagadas(copy, PROMESAS);
  const json = JSON.stringify(limpio);
  for (const prohibido of ["28%", "sin interés", "30 días", "Envío gratis"]) assert.ok(!json.includes(prohibido), prohibido);
  assert.ok(limpio.valueProps.some((v) => v.title === "Elegidas a mano"), "lo que no promete nada queda");
  assert.ok(limpio.paymentMethods.includes("Transferencia"), "el medio queda, sin el descuento");
  const prendido = copySinPromesasApagadas(copy, { transferencia: true, cuotas: true, envios: true, cambios: true });
  assert.ok(JSON.stringify(prendido).includes("28%"));
});
