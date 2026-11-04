import { test } from "node:test";
import assert from "node:assert/strict";
import { brandForSlug, resolveAccent } from "@/lib/branding";
import { proponerPiezas, PLANTILLAS_POR_TIPO } from "./plantillas";
import { marcaDeLaPlaca, contraste, textoSobre, AA } from "./marca";
import { TIPOS } from "./tipos";

const marcaDe = (slug: string, settings: { whatsapp?: string; instagram?: string }) => {
  const b = brandForSlug(slug);
  return marcaDeLaPlaca(b, settings, resolveAccent(b.preset, "light"));
};
const magra = marcaDe("magra", { whatsapp: "54 9 11 5555-0101", instagram: "https://www.instagram.com/magra.carnes/" });
const ch = marcaDe("beauty-spa", { whatsapp: "5491166660202", instagram: "@chestetica" });

test("cada tipo tiene 3 plantillas de variantes distintas", () => {
  for (const t of TIPOS) {
    const vs = PLANTILLAS_POR_TIPO[t].map((p) => p.variante);
    assert.equal(new Set(vs).size, 3, t);
  }
});

test("criterio 1: promo con 3 placas y captions listos", () => {
  const piezas = proponerPiezas("2x1 en turnos de lunes a viernes de 10 a 16", magra);
  assert.equal(piezas.length, 3);
  assert.equal(new Set(piezas.map((p) => p.plantilla)).size, 3);
  assert.equal(new Set(piezas.map((p) => p.variante)).size, 3);
  for (const p of piezas) {
    assert.equal(p.tipo, "promo");
    assert.ok(p.campos.titulo && p.campos.cta && p.campos.rotulo);
    assert.match(p.caption.instagram, /@magra\.carnes/);
    assert.match(p.caption.instagram, /#/);
    assert.match(p.caption.whatsapp, /https:\/\/wa\.me\/5491155550101/);
    assert.doesNotMatch(p.caption.whatsapp, /#/);
  }
  assert.equal(piezas[0].campos.titulo, "2x1", "la primera pone el precio grande");
});

test("tipo forzado y formato historia", () => {
  const piezas = proponerPiezas("2x1 en turnos de lunes a viernes de 10 a 16", ch, "horario", { formato: "historia" });
  assert.ok(piezas.every((p) => p.tipo === "horario" && p.formato === "historia"));
  assert.equal(piezas[0].campos.titulo, "de 10 a 16");
});

test("sin WhatsApp ni Instagram: no inventa contacto", () => {
  const b = brandForSlug("magra");
  const sin = marcaDeLaPlaca(b, null, resolveAccent(b.preset, "light"));
  const [p] = proponerPiezas("Llegaron los cortes nuevos", sin);
  assert.doesNotMatch(p.caption.whatsapp, /wa\.me/);
  assert.doesNotMatch(p.caption.instagram, /@/);
});

test("WhatsApp quita hashtags del texto del negocio", () => {
  const [p] = proponerPiezas("Promo de verano #verano\n20% en todo #ofertas", magra);
  assert.doesNotMatch(p.caption.whatsapp, /#/);
});

test("AISLAMIENTO: cada negocio con SUS datos", () => {
  const texto = "Torneo de pádel el sábado 15/11. Inscripción abierta.";
  const a = proponerPiezas(texto, magra);
  const b = proponerPiezas(texto, ch);
  assert.notEqual(magra.colorPrimario, ch.colorPrimario);
  assert.equal(magra.nombre, "Magra");
  assert.equal(ch.nombre, "CH Estética");
  for (const p of a) {
    assert.match(p.caption.whatsapp, /Magra/);
    assert.match(p.caption.whatsapp, /5491155550101/);
    assert.doesNotMatch(`${p.caption.whatsapp}${p.caption.instagram}`, /CH Estética|chestetica|5491166660202/);
  }
  for (const p of b) {
    assert.match(p.caption.instagram, /@chestetica/);
    assert.doesNotMatch(`${p.caption.whatsapp}${p.caption.instagram}`, /Magra|magra\.carnes|5491155550101/);
  }
});

test("colores de la marca con tinta AA", () => {
  for (const m of [magra, ch]) {
    for (const c of [m.colorPrimario, m.colorHondo, m.colorAcento, m.colorClaro]) {
      assert.ok(contraste(c, textoSobre(c)) >= AA, `${m.nombre} ${c}`);
    }
  }
});
