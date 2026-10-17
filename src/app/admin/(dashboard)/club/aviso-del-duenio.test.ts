// El aviso 🔔 del dueño, pintado con React (sin navegador): sólo a un dueño, sólo con pedidos esperando, y se apaga
// cuando se resuelven.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { resolverCredito } from "@/lib/club/motor.mjs";
import { crearAlmacen, type RolDelPanel } from "./almacen";
import { AvisoDelDuenio, textoAvisoDelDuenio } from "./aviso-del-duenio";

const HOY = "2026-10-17";
const almacen = (rol: RolDelPanel) => crearAlmacen({ hoy: HOY, clave: "gsg-club:prueba:yo:v1", guardado: null, rol, enReposo: null });
const pintar = (a: ReturnType<typeof almacen>) => renderToStaticMarkup(h(AvisoDelDuenio, { almacen: a, onVerTablero: () => undefined }));

test("el texto: uno, varios, ninguno", () => {
  assert.equal(textoAvisoDelDuenio(0), null);
  assert.equal(textoAvisoDelDuenio(1), "Un pedido de crédito espera tu OK.");
  assert.equal(textoAvisoDelDuenio(3), "3 pedidos de crédito esperan tu OK.");
});

test("al dueño le aparece con el botón al Tablero; a recepción, no (la región queda montada vacía)", () => {
  const html = pintar(almacen("OWNER"));
  assert.match(html, /Un pedido de crédito espera tu OK\./);
  assert.match(html, /<button[^>]*>Ver y resolver en el Tablero<\/button>/);
  assert.match(html, /aria-live="polite"/);
  const recepcion = pintar(almacen("RECEPTION"));
  assert.equal(recepcion, '<div aria-live="polite" data-ui="aviso-del-duenio"></div>');
});

test("resuelto el pedido, el aviso se apaga", () => {
  const a = almacen("OWNER");
  const n = a.estado().novedades.find((x) => x.estado === "pendiente")!;
  a.aplicar((e, ahora) => resolverCredito(e, n.id, { aprobar: false }, a.auth(), ahora));
  assert.doesNotMatch(pintar(a), /espera tu OK/);
});
