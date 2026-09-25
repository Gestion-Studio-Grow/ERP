// Lo que el tablero nuevo manda a las acciones de la bandeja es lo mismo que mandaban los
// formularios de siempre. Cada caso reproduce el <form> viejo (sus campos, en su orden, con la
// regla del navegador: un control deshabilitado no viaja, una casilla sin tildar no viaja) y lo
// compara con lo que arma el diseño nuevo.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  aFormData,
  camposDeLaAnulacion,
  camposDeLaEntrega,
  camposDelCobro,
  textoDeLaEntrega,
} from "./formularios-del-pedido";

const entradas = (fd: FormData) => [...fd.entries()].map(([k, v]) => [k, String(v)]);

/** El <form> de EntregarPedidoForm: hidden id, select paymentMethod (disabled con «queda a cobrar»), casilla quedaACobrar. */
function formViejoDeEntrega(id: string, medio: string, quedaACobrar: boolean): [string, string][] {
  const out: [string, string][] = [["id", id]];
  if (!quedaACobrar) out.push(["paymentMethod", medio]);
  if (quedaACobrar) out.push(["quedaACobrar", "on"]);
  return out;
}

test("cobrar manda el id y el medio, vacío si no se eligió (lo rechaza el servidor con su texto)", () => {
  assert.deepEqual(entradas(aFormData(camposDelCobro({ id: "o1", medio: "MERCADOPAGO" }))), [
    ["id", "o1"],
    ["paymentMethod", "MERCADOPAGO"],
  ]);
  assert.deepEqual(entradas(aFormData(camposDelCobro({ id: "o1", medio: "" }))), [
    ["id", "o1"],
    ["paymentMethod", ""],
  ]);
});

test("entregar sin cobrar manda lo mismo que el formulario viejo, en los tres casos", () => {
  for (const [medio, queda] of [
    ["EFECTIVO", false],
    ["", true],
    ["", false],
  ] as const) {
    assert.deepEqual(
      camposDeLaEntrega({ id: "o2", medio, quedaACobrar: queda, cobrado: false }),
      formViejoDeEntrega("o2", medio, queda),
      `medio=${medio || "(ninguno)"} queda=${queda}`,
    );
  }
});

test("entregar lo ya cobrado manda sólo el id (el formulario de un toque)", () => {
  assert.deepEqual(camposDeLaEntrega({ id: "o3", medio: "EFECTIVO", quedaACobrar: false, cobrado: true }), [["id", "o3"]]);
});

test("anular manda id, motivo y, sólo tildada, que la mercadería no volvió", () => {
  assert.deepEqual(camposDeLaAnulacion({ id: "o4", motivo: "se pesó mal", stockNoVolvio: false }), [
    ["id", "o4"],
    ["motivo", "se pesó mal"],
  ]);
  assert.deepEqual(camposDeLaAnulacion({ id: "o4", motivo: "", stockNoVolvio: true }), [
    ["id", "o4"],
    ["motivo", ""],
    ["stockNoVolvio", "on"],
  ]);
});

test("los nombres de los campos son los que leen las acciones del servidor", () => {
  const acciones = readFileSync(new URL("../../../../lib/order-actions.ts", import.meta.url), "utf8");
  for (const campo of ["paymentMethod", "quedaACobrar", "stockNoVolvio", "motivo"]) {
    assert.match(acciones, new RegExp(`formData\\.get\\("${campo}"\\)`), `order-actions.ts ya no lee «${campo}»`);
  }
});

test("la tecla de la entrega dice lo que va a pasar", () => {
  assert.equal(textoDeLaEntrega({ cobrado: true, medio: "", quedaACobrar: false, total: "$1" }), "Entregar");
  assert.equal(textoDeLaEntrega({ cobrado: false, medio: "EFECTIVO", quedaACobrar: false, total: "$52.340" }), "Cobrar $52.340 y entregar");
  assert.equal(textoDeLaEntrega({ cobrado: false, medio: "", quedaACobrar: true, total: "$1" }), "Entregar sin cobrar");
});
