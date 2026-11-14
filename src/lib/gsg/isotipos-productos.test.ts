import { test } from "node:test";
import assert from "node:assert/strict";
import { ISOTIPO_COMERCIANTE, ISOTIPO_CONTADOR, isotipoDeProducto } from "./isotipos-productos";
import { ISOTIPO_FACTOQUE } from "../factoque-icono";

type Rect = { x: number; y: number; w: number; h: number };
const rects = (d: string): Rect[] =>
  [...d.matchAll(/M(\d+) (\d+)h(\d+)v(\d+)H\d+z/g)].map((m) => ({ x: +m[1], y: +m[2], w: +m[3], h: +m[4] }));

for (const [nombre, g] of [["Comerciante", ISOTIPO_COMERCIANTE], ["Contador", ISOTIPO_CONTADOR]] as const) {
  test(`${nombre}: trazo 10, dentro del viewBox 100 y nudo 10×10 con luz ≥ 8`, () => {
    const forma = rects(g.forma);
    const [nudo] = rects(g.nudo);
    assert.ok(forma.length >= 3, "la forma son rectángulos de trazo");
    for (const r of forma) {
      assert.ok(Math.min(r.w, r.h) === 10, "trazo 10");
      assert.ok(r.x >= 0 && r.y >= 0 && r.x + r.w <= 100 && r.y + r.h <= 100, "dentro del viewBox");
    }
    assert.deepEqual([nudo.w, nudo.h], [10, 10]);
    for (const r of forma) {
      const dx = Math.max(r.x - (nudo.x + nudo.w), nudo.x - (r.x + r.w), 0);
      const dy = Math.max(r.y - (nudo.y + nudo.h), nudo.y - (r.y + r.h), 0);
      assert.ok(Math.max(dx, dy) >= 8, `luz mínima 8 entre el nudo y ${JSON.stringify(r)}`);
    }
  });
}

test("cada producto tiene su isotipo; el vertical no", () => {
  assert.equal(isotipoDeProducto("comerciante"), ISOTIPO_COMERCIANTE);
  assert.equal(isotipoDeProducto("contador"), ISOTIPO_CONTADOR);
  assert.equal(isotipoDeProducto("facturita"), ISOTIPO_FACTOQUE);
  assert.equal(isotipoDeProducto(null), null);
  assert.notEqual(ISOTIPO_COMERCIANTE.forma, ISOTIPO_CONTADOR.forma);
});
