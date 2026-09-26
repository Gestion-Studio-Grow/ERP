import { test } from "node:test";
import assert from "node:assert/strict";
import { avisoDelPaquete } from "./pagina-de-aviso";

test("el paquete de un mes en curso abre una pantalla con el motivo y «Volver a la cartera», no un texto plano", () => {
  const html = avisoDelPaquete("Ese mes todavía no terminó: el paquete se baja cuando el mes cierra.");
  assert.match(html, /^<!doctype html>/);
  assert.match(html, /<html lang="es-AR">/);
  assert.match(html, /Ese mes todavía no terminó/);
  assert.match(html, /<a href="\/contador">Volver a la cartera<\/a>/);
  assert.match(html, /min-height:44px/, "el botón de volver es tocable");
});

test("el texto se escapa y el link de vuelta no depende del cliente pedido", () => {
  const html = avisoDelPaquete('<script>alert("x")</script>');
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
  const a = avisoDelPaquete("Ese cliente no está en tu cartera.");
  assert.equal(a, avisoDelPaquete("Ese cliente no está en tu cartera."), "misma pantalla, exista o no el negocio");
});
