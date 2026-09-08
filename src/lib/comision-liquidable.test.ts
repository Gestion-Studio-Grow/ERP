import test from "node:test";
import assert from "node:assert/strict";
import { sePuedeLiquidar, separarPorSaldo } from "./comision-liquidable";

const saldado = { precio: 35000, cobros: [{ amount: 10000, method: "MERCADOPAGO" }, { amount: 25000, method: "EFECTIVO" }] };
const conSaldo = { precio: 35000, cobros: [{ amount: 10000, method: "MERCADOPAGO" }] };

test("un turno saldado se liquida", () => {
  assert.equal(sePuedeLiquidar(saldado), true);
});

test("un turno con saldo pendiente NO se liquida: si se liquidara, la comisión del saldo se perdería para siempre", () => {
  assert.equal(sePuedeLiquidar(conSaldo), false);
});

test("un turno sobrepagado se liquida igual: el saldo a favor no perjudica a la profesional", () => {
  assert.equal(sePuedeLiquidar({ precio: 35000, cobros: [{ amount: 40000, method: "EFECTIVO" }] }), true);
});

test("el turno cobrado por el camino viejo (Payment sin Collection) cuenta como saldado", () => {
  assert.equal(
    sePuedeLiquidar({ precio: 35000, cobros: [], pagoLegado: { status: "APPROVED", amount: 35000 } }),
    true,
  );
});

test("sin ningún cobro no se liquida", () => {
  assert.equal(sePuedeLiquidar({ precio: 35000, cobros: [] }), false);
});

test("los que esperan se pueden nombrar, no desaparecen en silencio", () => {
  const { liquidables, conSaldo: esperan } = separarPorSaldo([saldado, conSaldo, saldado]);
  assert.equal(liquidables.length, 2);
  assert.equal(esperan.length, 1);
});
