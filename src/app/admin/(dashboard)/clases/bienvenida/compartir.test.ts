import { test } from "node:test";
import assert from "node:assert/strict";
import { enumerar, linkCompartirWhatsApp, mensajeParaAlumnos, textoParaBio, TOPE_BIO } from "./compartir";

const link = "https://matias.gsgapp.com.ar/clases";

test("enumerar en criollo: uno, dos, tres o más", () => {
  assert.equal(enumerar([]), "");
  assert.equal(enumerar(["Club Norte"]), "Club Norte");
  assert.equal(enumerar(["Club Norte", "La Red"]), "Club Norte y La Red");
  assert.equal(enumerar(["A", " ", "B", "C"]), "A, B y C");
});

test("bio con club, sin club y siempre con el link", () => {
  assert.equal(textoParaBio({ link, clubes: ["Club Norte"] }), `Clases de pádel en Club Norte. Pedí tu clase acá: ${link}`);
  assert.equal(textoParaBio({ link }), `Clases de pádel. Pedí tu clase acá: ${link}`);
});

test("la bio nunca pasa el tope de Instagram", () => {
  const muchos = Array.from({ length: 8 }, (_, i) => `Club de Pádel Número ${i}`);
  const t = textoParaBio({ link, clubes: muchos });
  assert.ok(t.length <= TOPE_BIO);
  assert.equal(t, `Clases de pádel. Pedí tu clase acá: ${link}`);
  const largo = `https://${"x".repeat(160)}.com/clases`;
  assert.equal(textoParaBio({ link: largo }), largo);
});

test("WhatsApp: wa.me sin número y con el texto codificado", () => {
  const url = linkCompartirWhatsApp(mensajeParaAlumnos(link));
  assert.ok(url.startsWith("https://wa.me/?text="));
  assert.equal(decodeURIComponent(url.slice("https://wa.me/?text=".length)), mensajeParaAlumnos(link));
  assert.ok(!url.includes(" "));
});
