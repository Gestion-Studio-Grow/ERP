import { test } from "node:test";
import assert from "node:assert/strict";
import {
  totalOutputKg,
  yieldPct,
  mermaKg,
  mermaPct,
  costPerSellableKg,
  analyzeDespiece,
  costearPorValorDeVenta,
  costoDeLaPieza,
  costosFijadosAMano,
  esMovimientoDeDespiece,
  motivoDeDespiece,
  precioPorKiloDe,
  rendimientoDelPeriodo,
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

// ── Costo por valor relativo de venta (ola 3) ───────────────────────────────

// Media res de 100 kg, $500.000. Salen lomo, osobuco, asado y hueso (sin precio).
const MEDIA_RES = {
  inputCost: 500000,
  outputs: [
    { name: "Lomo", weightKg: 3, precioPorKg: 18900 }, // vale 56.700
    { name: "Osobuco", weightKg: 5, precioPorKg: 5000 }, // vale 25.000
    { name: "Asado", weightKg: 20, precioPorKg: 11500 }, // vale 230.000
    { name: "Hueso", weightKg: 15, precioPorKg: null }, // no se vende
  ],
};

test("valor relativo: cada corte carga el costo en proporción a lo que se vende", () => {
  const r = costearPorValorDeVenta(MEDIA_RES.inputCost, MEDIA_RES.outputs);
  assert.equal(r.metodo, "valor-de-venta");
  const [lomo, osobuco, asado, hueso] = r.cortes;
  // Σ valor = 311.700. Lomo: 500.000 × 56.700 / 311.700 = 90.952,84.
  assert.equal(lomo.costoTotal, 90952.84);
  assert.equal(lomo.costoPorKg, 30317.61);
  assert.equal(osobuco.costoTotal, 40102.66);
  assert.equal(osobuco.costoPorKg, 8020.53);
  assert.equal(hueso.costoTotal, 0, "el hueso no se vende: no carga costo");
  assert.equal(hueso.costoPorKg, 0);
  // La plata no aparece ni desaparece: la suma de los cortes es el costo de la pieza.
  const suma = r.cortes.reduce((s, c) => s + (c.costoTotal ?? 0), 0);
  assert.equal(Math.round(suma * 100) / 100, 500000);
  assert.ok(asado.costoTotal! > 0);
});

test("antes (parejo por kilo) el lomo y el osobuco costaban lo mismo; ahora el lomo cuesta más", () => {
  // El reparto viejo: $500.000 / 43 kg vendibles = $11.627,91 el kilo, para TODOS los cortes.
  const viejo = costPerSellableKg({ inputWeightKg: 100, inputCost: 500000, outputs: MEDIA_RES.outputs });
  assert.equal(viejo, 11627.91);
  const r = costearPorValorDeVenta(MEDIA_RES.inputCost, MEDIA_RES.outputs);
  const lomo = r.cortes[0].costoPorKg!;
  const osobuco = r.cortes[1].costoPorKg!;
  assert.ok(lomo > viejo! && osobuco < viejo!, "sube el costo del lomo y baja el del osobuco");
  // El costo por kilo guarda la misma proporción que el precio: 30.317,61 / 8.020,53 ≈ 18.900 / 5.000.
  assert.ok(Math.abs(lomo / osobuco - 18900 / 5000) < 0.001);
});

test("sin ningún precio: vuelve al reparto parejo por kilo, y lo dice", () => {
  const r = costearPorValorDeVenta(900000, [
    { name: "Asado", weightKg: 30 },
    { name: "Vacío", weightKg: 70 },
  ]);
  assert.equal(r.metodo, "por-kilo");
  assert.deepEqual(r.cortes.map((c) => c.costoPorKg), [9000, 9000]);
  assert.deepEqual(r.cortes.map((c) => c.costoTotal), [270000, 630000]);
});

test("sin costo de la pieza: ningún corte tiene costo (no se inventa un $0)", () => {
  const r = costearPorValorDeVenta(0, MEDIA_RES.outputs);
  assert.equal(r.metodo, "sin-costo");
  assert.ok(r.cortes.every((c) => c.costoTotal === null && c.costoPorKg === null));
});

test("los centavos del redondeo van al corte de más valor: la suma cierra exacta", () => {
  const r = costearPorValorDeVenta(100000, [
    { name: "A", weightKg: 1, precioPorKg: 1 },
    { name: "B", weightKg: 1, precioPorKg: 1 },
    { name: "C", weightKg: 1, precioPorKg: 1 },
  ]);
  // 100.000 / 3 = 33.333,33 cada uno → falta 1 centavo, que va al primero de mayor valor.
  assert.deepEqual(r.cortes.map((c) => c.costoTotal), [33333.34, 33333.33, 33333.33]);
});

test("analyzeDespiece usa el valor relativo cuando hay precios", () => {
  const a = analyzeDespiece({ inputWeightKg: 100, ...MEDIA_RES });
  assert.equal(a.metodoDeCosteo, "valor-de-venta");
  assert.equal(a.outputs[0].costShare, 90952.84);
  assert.equal(a.outputs[0].costPerKg, 30317.61);
  assert.equal(a.mermaKg, 57, "100 kg − 43 de cortes: el hueso cuenta como corte obtenido (15 kg)");
});

test("el costo de la pieza: el tipeado, o el de la compra por los kilos que entran", () => {
  assert.equal(costoDeLaPieza(500000, 4000, 100), 500000, "manda lo tipeado");
  assert.equal(costoDeLaPieza(null, 4250.5, 110), 467555, "vacío: costo vigente × kilos");
  assert.equal(costoDeLaPieza(0, null, 110), null, "ninguno: sin costo");
});

test("precio por kilo del corte: por peso, o por unidad si la unidad es el kilo; si no, no hay", () => {
  assert.equal(precioPorKiloDe({ saleUnit: "WEIGHT", pricePerKg: 18900 }), 18900);
  assert.equal(precioPorKiloDe({ saleUnit: "WEIGHT", pricePerKg: null }), null);
  assert.equal(precioPorKiloDe({ saleUnit: "UNIT", unit: "kg", price: 12000 }), 12000);
  assert.equal(precioPorKiloDe({ saleUnit: "UNIT", unit: "u", price: 6900 }), null, "una hamburguesa no se pasa a kilos");
});

test("los movimientos del despiece se reconocen por su motivo", () => {
  const m = motivoDeDespiece(12, " Media res novillo ");
  assert.equal(m, "Despiece #12 — Media res novillo");
  assert.equal(esMovimientoDeDespiece(m), true);
  assert.equal(esMovimientoDeDespiece("Merma — se cayó"), false);
  assert.equal(esMovimientoDeDespiece(null), false);
});

test("rendimiento del período: kilos obtenidos sobre kilos de entrada de todas las corridas", () => {
  assert.equal(rendimientoDelPeriodo([]), null);
  assert.equal(
    rendimientoDelPeriodo([
      { inputWeightKg: 120, totalOutputKg: 100 },
      { inputWeightKg: 80, totalOutputKg: 60 },
    ]),
    0.8,
  );
});

test("costo fijado a mano: se avisa, y si lo escribió un despiece viejo, cuál y de cuándo", () => {
  const corridas = [
    { code: 3, createdAt: new Date("2026-08-01T15:00:00Z"), costPerSellableKg: 9000, productIds: ["asado"] },
    { code: 5, createdAt: new Date("2026-08-20T15:00:00Z"), costPerSellableKg: 9500, productIds: ["asado", "vacio"] },
  ];
  const r = costosFijadosAMano(
    [
      { id: "asado", nombre: "Asado", costoFijado: 9500 }, // lo escribió el #5
      { id: "vacio", nombre: "Vacío", costoFijado: 7000 }, // no coincide: lo puso la dueña
      { id: "lomo", nombre: "Lomo", costoFijado: null }, // sin costo fijado: no se avisa
    ],
    corridas,
  );
  assert.deepEqual(
    r.map((c) => [c.nombre, c.costo, c.despiece?.code ?? null]),
    [
      ["Asado", 9500, 5],
      ["Vacío", 7000, null],
    ],
  );
});
