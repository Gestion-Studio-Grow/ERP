import { test } from "node:test";
import assert from "node:assert/strict";
import {
  totalOutputKg,
  yieldPct,
  mermaKg,
  mermaPct,
  costPerSellableKg,
  analyzeDespiece,
  type DespieceInput,
} from "./despiece";

// Media res de 120 kg que costó $900.000; se obtienen 100 kg de cortes → 20 kg de merma.
const run: DespieceInput = {
  inputWeightKg: 120,
  inputCost: 900000,
  outputs: [
    { name: "Asado de tira", weightKg: 30 },
    { name: "Vacío", weightKg: 12 },
    { name: "Nalga", weightKg: 18 },
    { name: "Carne picada", weightKg: 40 },
  ],
};

test("totalOutputKg — suma de cortes", () => {
  assert.equal(totalOutputKg(run.outputs), 100);
});

test("yieldPct — rendimiento por corte sobre la entrada", () => {
  assert.equal(yieldPct(30, 120), 0.25); // asado = 25% de la media res
  assert.equal(yieldPct(10, 0), 0);
});

test("mermaKg / mermaPct — lo que no se vende", () => {
  assert.equal(mermaKg(run), 20); // 120 − 100
  assert.ok(Math.abs(mermaPct(run) - 20 / 120) < 1e-9); // ~16,7%
});

test("costPerSellableKg — el costo se reparte entre lo VENDIBLE, no la entrada", () => {
  // $900.000 / 100 kg vendibles = $9.000/kg (NO 900000/120 = 7500: la merma se pagó igual)
  assert.equal(costPerSellableKg(run), 9000);
  assert.equal(costPerSellableKg({ inputWeightKg: 120, inputCost: 0, outputs: run.outputs }), null);
  assert.equal(costPerSellableKg({ inputWeightKg: 120, inputCost: 900000, outputs: [] }), null);
});

test("analyzeDespiece — rendimiento + costo real por corte + merma", () => {
  const a = analyzeDespiece(run);
  assert.equal(a.totalOutputKg, 100);
  assert.equal(a.mermaKg, 20);
  assert.equal(a.overDeclared, false);
  assert.equal(a.costPerSellableKg, 9000);
  const asado = a.outputs.find((o) => o.name === "Asado de tira")!;
  assert.equal(asado.yieldPct, 0.25);
  assert.equal(asado.sharePct, 0.3); // 30/100
  assert.equal(asado.costShare, 270000); // 9000 * 30
});

test("analyzeDespiece — over-declared: más kilos que la entrada → flag", () => {
  const bad = analyzeDespiece({ inputWeightKg: 50, inputCost: 100000, outputs: [{ name: "x", weightKg: 60 }] });
  assert.equal(bad.mermaKg, -10);
  assert.equal(bad.overDeclared, true);
});
