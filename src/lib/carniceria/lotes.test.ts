import { test } from "node:test";
import assert from "node:assert/strict";
import {
  daysUntil,
  expiryState,
  avgPackageWeight,
  sortFefo,
  pickFefo,
  summarizeBatches,
  type Batch,
} from "./lotes";

const NOW = new Date("2026-07-12T10:00:00Z");
const d = (s: string) => new Date(s);

function batch(over: Partial<Batch>): Batch {
  return {
    id: over.id ?? "b",
    code: over.code ?? "L-001",
    productName: over.productName ?? "Vacío",
    productId: over.productId ?? "p1",
    supplierName: over.supplierName ?? null,
    packedAt: over.packedAt ?? null,
    expiresAt: over.expiresAt ?? null,
    netWeightKg: over.netWeightKg ?? null,
    packages: over.packages ?? 1,
    unitCost: over.unitCost ?? null,
    status: over.status ?? "AVAILABLE",
  };
}

test("daysUntil — por día de calendario, negativo si venció", () => {
  assert.equal(daysUntil(d("2026-07-15T23:00:00Z"), NOW), 3);
  assert.equal(daysUntil(d("2026-07-12T01:00:00Z"), NOW), 0);
  assert.equal(daysUntil(d("2026-07-10T10:00:00Z"), NOW), -2);
  assert.equal(daysUntil(null, NOW), null);
});

test("expiryState — semáforo de vencimiento", () => {
  assert.equal(expiryState(null, NOW), "none");
  assert.equal(expiryState(d("2026-07-10T10:00:00Z"), NOW), "expired");
  assert.equal(expiryState(d("2026-07-13T10:00:00Z"), NOW), "soon"); // 1 día ≤ 3
  assert.equal(expiryState(d("2026-07-15T10:00:00Z"), NOW), "soon"); // 3 días ≤ 3
  assert.equal(expiryState(d("2026-07-20T10:00:00Z"), NOW), "ok"); // 8 días
});

test("avgPackageWeight — PESO VARIABLE: neto/paquetes", () => {
  // 4,935 kg en 3 paquetes al vacío → 1,645 kg promedio (un vacío no pesa exacto)
  assert.equal(avgPackageWeight(4.935, 3), 1.645);
  assert.equal(avgPackageWeight(null, 3), null);
  assert.equal(avgPackageWeight(4.935, 0), null);
  assert.equal(avgPackageWeight(0, 3), null);
});

test("sortFefo — vence antes primero, sin fecha al final, no muta", () => {
  const input = [
    batch({ id: "sinfecha", expiresAt: null }),
    batch({ id: "lejos", expiresAt: d("2026-07-20") }),
    batch({ id: "cerca", expiresAt: d("2026-07-14") }),
  ];
  const sorted = sortFefo(input);
  assert.deepEqual(sorted.map((b) => b.id), ["cerca", "lejos", "sinfecha"]);
  // no mutó el original
  assert.equal(input[0].id, "sinfecha");
});

test("pickFefo — próximo a despachar: available no vencido que vence antes", () => {
  const batches = [
    batch({ id: "vencido", expiresAt: d("2026-07-10") }),
    batch({ id: "retirado", expiresAt: d("2026-07-13"), status: "WITHDRAWN" }),
    batch({ id: "bueno-cerca", expiresAt: d("2026-07-14") }),
    batch({ id: "bueno-lejos", expiresAt: d("2026-07-25") }),
  ];
  assert.equal(pickFefo(batches, NOW)?.id, "bueno-cerca");
  assert.equal(pickFefo([batch({ id: "v", expiresAt: d("2026-07-01") })], NOW), null);
});

test("summarizeBatches — KPIs disponibles/vencidos/por vencer/kg", () => {
  const s = summarizeBatches(
    [
      batch({ status: "AVAILABLE", expiresAt: d("2026-07-25"), netWeightKg: 10 }),
      batch({ status: "AVAILABLE", expiresAt: d("2026-07-13"), netWeightKg: 5 }), // por vencer
      batch({ status: "AVAILABLE", expiresAt: d("2026-07-10"), netWeightKg: 4 }), // vencido
      batch({ status: "DEPLETED", expiresAt: null }),
    ],
    NOW,
  );
  assert.equal(s.total, 4);
  assert.equal(s.available, 3);
  assert.equal(s.soon, 1);
  assert.equal(s.expired, 1);
  assert.equal(s.totalKg, 19);
});
