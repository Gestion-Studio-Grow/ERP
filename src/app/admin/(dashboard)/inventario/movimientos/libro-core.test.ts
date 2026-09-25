import { test } from "node:test";
import assert from "node:assert/strict";
import { agruparPorDia, diasAbiertos, rotuloCercano } from "./libro-core";

const fila = (dia: string, n: number) => ({ dia, n });

test("agrupa los movimientos por día sin cambiar el orden en que llegan", () => {
  const filas = [fila("2026-09-25", 1), fila("2026-09-25", 2), fila("2026-09-24", 3), fila("2026-09-22", 4)];
  const dias = agruparPorDia(filas, (f) => f.dia);
  assert.deepEqual(
    dias.map((d) => [d.dia, d.filas.map((f) => f.n)]),
    [
      ["2026-09-25", [1, 2]],
      ["2026-09-24", [3]],
      ["2026-09-22", [4]],
    ],
  );
});

test("sin movimientos no hay días", () => {
  assert.deepEqual(agruparPorDia([], () => "x"), []);
  assert.equal(diasAbiertos([]), 0);
});

test("el primer día arranca abierto aunque tenga más renglones que el tope", () => {
  assert.equal(diasAbiertos([{ filas: Array(40) }, { filas: Array(3) }]), 1);
});

test("se abren días mientras entren en el tope de renglones y el resto queda plegado", () => {
  assert.equal(diasAbiertos([{ filas: Array(10) }, { filas: Array(10) }, { filas: Array(10) }]), 2);
  assert.equal(diasAbiertos([{ filas: Array(10) }, { filas: Array(15) }, { filas: Array(1) }]), 2);
  assert.equal(diasAbiertos([{ filas: Array(2) }, { filas: Array(2) }], 25), 2);
});

test("rótulo cercano: hoy, ayer (también cruzando de mes) y nada para los demás", () => {
  assert.equal(rotuloCercano("2026-09-25", "2026-09-25"), "Hoy");
  assert.equal(rotuloCercano("2026-09-24", "2026-09-25"), "Ayer");
  assert.equal(rotuloCercano("2026-09-30", "2026-10-01"), "Ayer");
  assert.equal(rotuloCercano("2026-09-23", "2026-09-25"), null);
});
