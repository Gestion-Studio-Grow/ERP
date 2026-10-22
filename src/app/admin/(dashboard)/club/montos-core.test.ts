// B2 del Gate: una sola lectura de montos para todo el club. La de caja-core.ts era la referencia y no cambia; la de
// «Cobrar una parte» de la cancha (cuenta-piezas.tsx) no entendía «$ 12.500». Las dos usan ahora `leerMonto`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { leerMonto as deLaCaja } from "./caja-core";
import { leerMonto, vueltoDe } from "./montos-core";

/** La regla de caja-core.ts antes de moverla (copiada tal cual): la equivalencia se mide contra ella. */
function referenciaDeLaCaja(texto: string): number {
  const limpio = texto.replace(/[$\s.]/g, "").replace(",", ".");
  return limpio === "" ? Number.NaN : Math.round(Number(limpio));
}

const CASOS: [string, number][] = [
  ["12500", 12500],
  ["12.500", 12500],
  ["$ 12.500", 12500],
  ["$12.500", 12500],
  ["12.500,50", 12501],
  ["1,5", 2],
  [" 21.000 ", 21000],
  ["", Number.NaN],
  ["   ", Number.NaN],
  ["doce", Number.NaN],
  ["12a", Number.NaN],
  ["$", Number.NaN],
];

test("leerMonto: la caja y la cuenta leen igual (y como la caja leía antes)", () => {
  for (const [texto, esperado] of CASOS) {
    assert.deepEqual(leerMonto(texto), esperado, `«${texto}»`);
    assert.deepEqual(deLaCaja(texto), leerMonto(texto), `caja «${texto}»`);
    assert.deepEqual(referenciaDeLaCaja(texto), leerMonto(texto), `referencia «${texto}»`);
  }
  assert.equal(deLaCaja, leerMonto, "caja-core re-exporta la misma función");
});

test("BP-041 · vuelto: $ 3.800 y paga con 10.000 → vuelto $ 6.200 (con la misma lectura de montos del club)", () => {
  assert.deepEqual(vueltoDe(3800, "10.000"), { estado: "ok", vuelto: 6200 });
  assert.deepEqual(vueltoDe(3800, "$ 10.000"), { estado: "ok", vuelto: 6200 });
  assert.deepEqual(vueltoDe(3800, "10000"), { estado: "ok", vuelto: 6200 });
  assert.deepEqual(vueltoDe(3800, "3.800"), { estado: "ok", vuelto: 0 }, "justo: vuelto cero");
  assert.deepEqual(vueltoDe(3800, ""), { estado: "vacio" }, "sin «paga con» se cobra justo");
  assert.deepEqual(vueltoDe(3800, "   "), { estado: "vacio" });
  assert.deepEqual(vueltoDe(3800, "2.000"), { estado: "falta", falta: 1800 });
  assert.deepEqual(vueltoDe(3800, "diez"), { estado: "invalido" });
  assert.deepEqual(vueltoDe(3800, "0"), { estado: "invalido" });
});
