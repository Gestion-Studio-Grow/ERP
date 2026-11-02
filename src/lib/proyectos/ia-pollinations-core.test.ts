import assert from "node:assert/strict";
import test from "node:test";
import { aDataUri, tipoDeImagen, urlPollinations } from "./ia-pollinations-core";

test("la dirección lleva el pedido codificado, el tamaño, la semilla y sin logo", () => {
  const u = new URL(urlPollinations("stand con pantalla & luz cálida", 7));
  assert.equal(u.origin, "https://image.pollinations.ai");
  assert.equal(decodeURIComponent(u.pathname.replace("/prompt/", "")), "stand con pantalla & luz cálida");
  assert.equal(u.searchParams.get("width"), "1024");
  assert.equal(u.searchParams.get("height"), "576");
  assert.equal(u.searchParams.get("nologo"), "true");
  assert.equal(u.searchParams.get("seed"), "7");
});

test("el pedido no puede salirse de la ruta ni agrandar la dirección sin límite", () => {
  const u = new URL(urlPollinations("a/../../b?x=1#y\n\n" + "z".repeat(5000), 1));
  assert.equal(u.pathname.startsWith("/prompt/"), true);
  assert.equal(u.searchParams.has("x"), false);
  assert.ok(u.pathname.length < 1200);
});

test("sólo se aceptan JPG, PNG y WebP; un SVG o un HTML no", () => {
  assert.equal(tipoDeImagen("image/jpeg"), "image/jpeg");
  assert.equal(tipoDeImagen("image/PNG; charset=binary"), "image/png");
  assert.equal(tipoDeImagen("image/webp"), "image/webp");
  assert.equal(tipoDeImagen("image/svg+xml"), null);
  assert.equal(tipoDeImagen("text/html"), null);
  assert.equal(tipoDeImagen(null), null);
});

test("la imagen se guarda como data URI con su tipo", () => {
  assert.equal(aDataUri("image/jpeg", new Uint8Array([65, 66, 67])), "data:image/jpeg;base64,QUJD");
});
