import { test } from "node:test";
import assert from "node:assert/strict";
import {
  daysUntil,
  diaDelLote,
  expiryState,
  avgPackageWeight,
  fmtDia,
  instanteDelDia,
  leerDiaDelFormulario,
  plataEnRiesgo,
  sortFefo,
  pickFefo,
  summarizeBatches,
  type Batch,
} from "./lotes";
import { dateStrInBusinessTz } from "@/lib/datetime";

// "Hoy" es el día del NEGOCIO (AAAA-MM-DD), no un instante del servidor.
const HOY = "2026-07-12";
const d = (s: string) => new Date(s);
/** Un vencimiento guardado como lo guarda la app desde la ola 3 (mediodía UTC del día). */
const vence = (dia: string) => instanteDelDia(dia);

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

// ── La fecha del lote es un día de calendario ───────────────────────────────

test("el vencimiento tipeado '2026-10-15' se ve 15/10 en hora argentina (antes se veía 14/10)", () => {
  // Lo de antes: `new Date("2026-10-15")` es la medianoche UTC, que en Buenos Aires es el 14 a
  // las 21:00. Medido con la misma función que usa la pantalla para mostrar fechas.
  assert.equal(dateStrInBusinessTz(new Date("2026-10-15")), "2026-10-14", "así se corría un día");
  // Lo de ahora: se guarda al mediodía UTC y se lee como día.
  const guardado = instanteDelDia("2026-10-15");
  assert.equal(dateStrInBusinessTz(guardado), "2026-10-15", "en hora del negocio es el mismo día");
  assert.equal(diaDelLote(guardado), "2026-10-15");
  assert.equal(fmtDia(diaDelLote(guardado)!), "15/10/2026");
  // Y un lote guardado ANTES del arreglo (medianoche UTC) también se lee con el día tipeado.
  assert.equal(diaDelLote(new Date("2026-10-15")), "2026-10-15");
});

test("a las 22:00 del 14 en Buenos Aires un lote que vence el 15 vence MAÑANA, no hoy", () => {
  // El servidor corre en UTC: a las 22:00 AR ya es 01:00Z del 15. Con "hoy" del negocio (el 14)
  // el lote vence mañana; antes, contando con el día UTC del servidor, decía "vence hoy".
  const hoyDelNegocio = dateStrInBusinessTz(new Date("2026-10-15T01:00:00Z"));
  assert.equal(hoyDelNegocio, "2026-10-14");
  assert.equal(daysUntil(vence("2026-10-15"), hoyDelNegocio), 1);
});

test("el formulario: vacío es sin fecha; un día que no existe se rechaza, no se corre", () => {
  assert.equal(leerDiaDelFormulario(""), null);
  assert.equal(leerDiaDelFormulario("  "), null);
  assert.equal(leerDiaDelFormulario("2026-10-15"), "2026-10-15");
  assert.equal(leerDiaDelFormulario("2026-02-30"), "invalido", "30 de febrero no es el 2 de marzo");
  assert.equal(leerDiaDelFormulario("15/10/2026"), "invalido");
  assert.equal(leerDiaDelFormulario("mañana"), "invalido");
});

test("daysUntil — por día de calendario, negativo si venció", () => {
  assert.equal(daysUntil(vence("2026-07-15"), HOY), 3);
  assert.equal(daysUntil(vence("2026-07-12"), HOY), 0);
  assert.equal(daysUntil(vence("2026-07-10"), HOY), -2);
  // Cruza fin de mes.
  assert.equal(daysUntil(vence("2026-08-01"), "2026-07-30"), 2);
  assert.equal(daysUntil(null, HOY), null);
});

test("expiryState — semáforo de vencimiento", () => {
  assert.equal(expiryState(null, HOY), "none");
  assert.equal(expiryState(vence("2026-07-10"), HOY), "expired");
  assert.equal(expiryState(vence("2026-07-12"), HOY), "soon", "vence hoy: todavía se puede vender");
  assert.equal(expiryState(vence("2026-07-13"), HOY), "soon"); // 1 día ≤ 3
  assert.equal(expiryState(vence("2026-07-15"), HOY), "soon"); // 3 días ≤ 3
  assert.equal(expiryState(vence("2026-07-20"), HOY), "ok"); // 8 días
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
    batch({ id: "vencido", expiresAt: vence("2026-07-10") }),
    batch({ id: "retirado", expiresAt: vence("2026-07-13"), status: "WITHDRAWN" }),
    batch({ id: "bueno-cerca", expiresAt: vence("2026-07-14") }),
    batch({ id: "bueno-lejos", expiresAt: vence("2026-07-25") }),
  ];
  assert.equal(pickFefo(batches, HOY)?.id, "bueno-cerca");
  assert.equal(pickFefo([batch({ id: "v", expiresAt: vence("2026-07-01") })], HOY), null);
});

test("summarizeBatches — sólo lo disponible: un lote agotado o retirado ya no es un 'vencido'", () => {
  const s = summarizeBatches(
    [
      batch({ status: "AVAILABLE", expiresAt: vence("2026-07-25"), netWeightKg: 10 }),
      batch({ status: "AVAILABLE", expiresAt: vence("2026-07-13"), netWeightKg: 5 }), // por vencer
      batch({ status: "AVAILABLE", expiresAt: vence("2026-07-10"), netWeightKg: 4 }), // vencido
      batch({ status: "DEPLETED", expiresAt: null }),
      // Agotado y retirado CON fecha vencida: antes el agotado sumaba en "Vencidos" y el
      // contador no bajaba nunca aunque la heladera estuviera vacía.
      batch({ status: "DEPLETED", expiresAt: vence("2026-07-01"), netWeightKg: 3 }),
      batch({ status: "WITHDRAWN", expiresAt: vence("2026-07-02"), netWeightKg: 2 }),
    ],
    HOY,
  );
  assert.equal(s.total, 6);
  assert.equal(s.available, 3);
  assert.equal(s.soon, 1);
  assert.equal(s.expired, 1);
  assert.equal(s.totalKg, 19);
});

test("plata en riesgo: disponibles vencidos o por vencer, a costo por kilo × peso; sin costo aparte", () => {
  const r = plataEnRiesgo(
    [
      batch({ status: "AVAILABLE", expiresAt: vence("2026-07-13"), netWeightKg: 5, unitCost: 9000 }), // 45.000
      batch({ status: "AVAILABLE", expiresAt: vence("2026-07-10"), netWeightKg: 2.5, unitCost: 6543 }), // 16.357,50
      batch({ status: "AVAILABLE", expiresAt: vence("2026-07-14"), netWeightKg: 3, unitCost: null }), // sin costo
      batch({ status: "AVAILABLE", expiresAt: vence("2026-07-30"), netWeightKg: 50, unitCost: 9000 }), // lejos: no
      batch({ status: "DEPLETED", expiresAt: vence("2026-07-11"), netWeightKg: 9, unitCost: 9000 }), // agotado: no
    ],
    HOY,
  );
  assert.deepEqual(r, { lotes: 3, pesos: 61357.5, sinCosto: 1 });
});
