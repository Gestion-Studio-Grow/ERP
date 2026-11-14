import { test } from "node:test";
import assert from "node:assert/strict";
import {
  kilosPorCorte,
  mermaPorVencimiento,
  mesesDelReporte,
  muestraReporteDelRubro,
  rendimientoDelDespiece,
  whereRenglonesPorPeso,
} from "./reporte-rubro";
import { instanteDelDia, type Batch } from "./lotes";
import { businessWallTimeToUtc } from "@/lib/datetime";

const HOY = "2026-11-10";
const MESES = mesesDelReporte(HOY);

test("mesesDelReporte: este mes hasta hoy incluido y el anterior entero (cruza el año)", () => {
  assert.deepEqual(MESES, {
    actual: { desde: "2026-11-01", hasta: "2026-11-11" },
    anterior: { desde: "2026-10-01", hasta: "2026-11-01" },
  });
  assert.deepEqual(mesesDelReporte("2026-01-31"), {
    actual: { desde: "2026-01-01", hasta: "2026-02-01" },
    anterior: { desde: "2025-12-01", hasta: "2026-01-01" },
  });
  assert.throws(() => mesesDelReporte("10/11/2026"));
});

test("whereRenglonesPorPeso: sólo por peso, pedidos no anulados y el tenantId en renglón y pedido", () => {
  const d = new Date("2026-11-01T03:00:00Z");
  const h = new Date("2026-11-11T03:00:00Z");
  assert.deepEqual(whereRenglonesPorPeso("t1", d, h), {
    tenantId: "t1",
    saleUnit: "WEIGHT",
    order: { tenantId: "t1", paid: true, status: { not: "CANCELLED" }, createdAt: { gte: d, lt: h } },
  });
});

test("kilosPorCorte: top por kg, % del total, variación y corte nuevo", () => {
  const actual = [
    { productId: "asado", name: "Asado", kg: 30 },
    { productId: "asado", name: "Asado de tira", kg: 10 }, // renombrado: mismo producto
    { productId: "vacio", name: "Vacío", kg: 40 },
    { productId: null, name: "Picada ", kg: 20 },
    { productId: "x", name: "Cero", kg: 0 },
  ];
  const anterior = [
    { productId: "asado", name: "Asado", kg: 50 },
    { productId: "vacio", name: "Vacío", kg: 20 },
  ];
  const r = kilosPorCorte(actual, anterior);
  assert.equal(r.totalKg, 100);
  assert.equal(r.totalKgAnterior, 70);
  assert.equal(r.cortes, 3);
  assert.deepEqual(
    r.filas.map((f) => [f.nombre, f.kg, f.delTotal, f.kgAnterior, f.variacion]),
    [
      ["Asado", 40, 0.4, 50, -0.2],
      ["Vacío", 40, 0.4, 20, 1],
      ["Picada", 20, 0.2, 0, null],
    ],
  );
  const muchos = Array.from({ length: 15 }, (_, i) => ({ productId: `p${i}`, name: `C${i}`, kg: i + 1 }));
  const top = kilosPorCorte(muchos, []);
  assert.equal(top.filas.length, 10);
  assert.equal(top.filas[0].kg, 15);
  assert.equal(top.cortes, 15);
});

test("rendimientoDelDespiece: ponderado por kilo, sin anulados ni fuera del período", () => {
  const en = (dia: string) => businessWallTimeToUtc(dia, "10:00");
  const r = rendimientoDelDespiece(
    [
      { inputName: "Media res", inputWeightKg: 100, totalOutputKg: 80, status: "DONE", createdAt: en("2026-11-02") },
      { inputName: "media res ", inputWeightKg: 100, totalOutputKg: 70, status: "DONE", createdAt: en("2026-11-05") },
      { inputName: "Media res", inputWeightKg: 100, totalOutputKg: 10, status: "CANCELLED", createdAt: en("2026-11-05") },
      { inputName: "Media res", inputWeightKg: 100, totalOutputKg: 10, status: "DONE", createdAt: en("2026-10-31") },
      { inputName: "Cuarto", inputWeightKg: 30, totalOutputKg: 27, status: "DRAFT", createdAt: en("2026-11-10") },
    ],
    MESES.actual,
  );
  assert.equal(r.length, 2);
  assert.equal(r[0].origen, "Media res");
  assert.equal(r[0].corridas, 2);
  assert.equal(r[0].kgEntrada, 200);
  assert.ok(Math.abs(r[0].rendimiento - 0.75) < 1e-9);
  assert.ok(Math.abs(r[0].merma - 0.25) < 1e-9);
  assert.equal(r[1].origen, "Cuarto");
  assert.ok(Math.abs(r[1].merma - 0.1) < 1e-9);
});

const lote = (over: Partial<Batch>): Batch => ({
  id: over.code ?? "L",
  code: "L",
  productName: "Vacío",
  productId: "vacio",
  supplierName: null,
  packedAt: null,
  expiresAt: null,
  netWeightKg: 5,
  packages: 1,
  unitCost: 1000,
  status: "AVAILABLE",
  ...over,
});

test("mermaPorVencimiento: vencidos, retirados y vencidos con stock del período; sin costo aparte", () => {
  const m = mermaPorVencimiento(
    [
      lote({ code: "A", status: "EXPIRED", expiresAt: instanteDelDia("2026-11-03") }),
      lote({ code: "B", status: "WITHDRAWN", expiresAt: instanteDelDia("2026-11-20"), unitCost: null, netWeightKg: 2 }),
      lote({ code: "C", status: "AVAILABLE", expiresAt: instanteDelDia("2026-11-09"), netWeightKg: 1.5 }),
      lote({ code: "D", status: "AVAILABLE", expiresAt: instanteDelDia("2026-11-10") }), // vence hoy: todavía no
      lote({ code: "E", status: "EXPIRED", expiresAt: instanteDelDia("2026-10-30") }), // otro mes
      lote({ code: "F", status: "DEPLETED", expiresAt: instanteDelDia("2026-11-02") }), // se vendió
      lote({ code: "G", status: "EXPIRED", expiresAt: null }), // sin fecha
    ],
    MESES.actual,
    HOY,
  );
  assert.deepEqual(
    m.lotes.map((l) => [l.code, l.motivo, l.kg, l.pesos]),
    [
      ["A", "vencido", 5, 5000],
      ["C", "vencido", 1.5, 1500],
    ],
  );
  assert.equal(m.kg, 6.5);
  assert.equal(m.pesos, 6500);
  assert.equal(m.sinCosto, 0);

  const conRetiro = mermaPorVencimiento(
    [lote({ code: "B", status: "WITHDRAWN", expiresAt: instanteDelDia("2026-11-08"), unitCost: null, netWeightKg: 2 })],
    MESES.actual,
    HOY,
  );
  assert.deepEqual(conRetiro, {
    lotes: [{ id: "B", code: "B", productName: "Vacío", vence: "2026-11-08", motivo: "retirado", kg: 2, pesos: null }],
    kg: 2,
    pesos: 0,
    sinCosto: 1,
  });
});

test("no-cambio de CH: un rubro sin perecederos no ve el link «Reporte de la carnicería»", () => {
  assert.equal(muestraReporteDelRubro(null), false);
  assert.equal(muestraReporteDelRubro(undefined), false);
  assert.equal(muestraReporteDelRubro(""), false);
  assert.equal(muestraReporteDelRubro("spa"), false);
  assert.equal(muestraReporteDelRubro("no-existe"), false);
  assert.equal(muestraReporteDelRubro("carniceria"), true);
});
