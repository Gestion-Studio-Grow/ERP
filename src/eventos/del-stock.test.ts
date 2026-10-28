// P2 · `cruzaElMinimo` (stock.bajo@1): O-v5-3 del dictamen vuelta 5 — la coma flotante no repite el aviso.
//   node --import tsx --test src/eventos/del-stock.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { cruzaElMinimo, emitirEventosDeMovimientos } from "./del-stock";

const mov = (saldo: number, delta: number, minimo: number | null = 5) => ({ saldo, delta, minimo, controlaStock: true });

test("O-v5-3 · con el stock justo en el mínimo, otra baja no vuelve a avisar (antes al milésimo)", () => {
  // 5 → -3.002 (mínimo entero, venta que deja negativo): antes = -3.002 - (-8.002) = 5.000000000000001 sin redondear.
  assert.equal(-3.002 - -8.002 > 5, true, "el caso sigue siendo de coma flotante");
  assert.equal(cruzaElMinimo(mov(-3.002, -8.002)), false);
  // Mínimo fraccionario: 0.102 → 0.002 (antes = 0.10200000000000001).
  assert.equal(cruzaElMinimo(mov(0.002, -0.1, 0.102)), false);
  // Los cruces de verdad siguen avisando.
  assert.equal(cruzaElMinimo(mov(4.999, -0.002)), true);
  assert.equal(cruzaElMinimo(mov(3, -8.002)), true);
  assert.equal(cruzaElMinimo(mov(0.1, -0.003, 0.102)), true);
  // Sin control de stock, sin mínimo o con una entrada: nunca.
  assert.equal(cruzaElMinimo({ ...mov(3, -5), controlaStock: false }), false);
  assert.equal(cruzaElMinimo(mov(3, -5, null)), false);
  assert.equal(cruzaElMinimo(mov(3, 1)), false);
});

test("emitirEventosDeMovimientos · un doble sin SQL no emite (unidad)", async () => {
  assert.deepEqual(await emitirEventosDeMovimientos({}, [{ tenantId: "t", productId: "p", movimientoId: "m", tipo: "AJUSTE", delta: -1, saldo: 1, motivo: null, minimo: 5, controlaStock: true }]), []);
});
