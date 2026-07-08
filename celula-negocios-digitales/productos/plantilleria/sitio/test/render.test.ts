import { test } from "node:test";
import assert from "node:assert/strict";
import { landing, producto, carrito, checkout, gracias, esc } from "../src/render";
import { PLANTILLAS, BUNDLE } from "../data/catalogo";

test("esc neutraliza HTML", () => {
  assert.equal(esc(`<script>&"`), `&lt;script&gt;&amp;"`);
});

test("landing incluye hero, catálogo completo y el pack", () => {
  const html = landing();
  assert.match(html, /<!doctype html>/);
  assert.match(html, /Argentina real/);
  for (const p of PLANTILLAS) assert.ok(html.includes(p.nombre), `falta ${p.nombre}`);
  assert.ok(html.includes(BUNDLE.nombre));
  // sello GSG + demo
  assert.match(html, /name="generator" content="Gestión Studio Grow"/);
  assert.match(html, /modo demo/i);
  // cablea el carrito
  assert.match(html, /data-add="control-monotributo"/);
});

test("cada ficha de producto es válida y trae normativa + CTA", () => {
  for (const p of PLANTILLAS) {
    const html = producto(p);
    assert.match(html, /<!doctype html>/);
    assert.ok(html.includes(p.nombre));
    assert.ok(html.includes(p.dolor));
    assert.ok(html.includes("Normativa argentina embebida"));
    assert.ok(html.includes(`data-add="${p.slug}"`));
    assert.ok(html.includes("contador matriculado")); // disclaimer legal obligatorio
  }
});

test("carrito, checkout y gracias renderizan el cascarón + hooks del cliente", () => {
  assert.match(carrito(), /data-cart-view/);
  const co = checkout();
  assert.match(co, /data-checkout/);
  assert.match(co, /Checkout \(demo\)/);
  const gr = gracias();
  assert.match(gr, /data-gracias-nombre/);
  assert.match(gr, /data-orden/);
});

test("todas las páginas cargan app.js y el CSS", () => {
  for (const html of [landing(), carrito(), checkout(), gracias(), producto(PLANTILLAS[0])]) {
    assert.match(html, /<script type="module" src="\/app\.js">/);
    assert.match(html, /href="\/globals\.css"/);
  }
});
