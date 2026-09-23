// Tests del export CSV del reporte. Lógica pura — sin DB, sin Next.

import { test } from "node:test";
import assert from "node:assert/strict";
import { csvField, buildReportCsv, type ReportCsvInput } from "./report-csv";
import type { DeepKpis } from "./report-kpis";

test("csvField deja pasar valores simples y escapa separador/comillas/saltos", () => {
  assert.equal(csvField("Ana"), "Ana");
  assert.equal(csvField(1500), "1500");
  // El separador es ';' → un valor con ';' debe ir entre comillas.
  assert.equal(csvField("Corte; color"), '"Corte; color"');
  // Comillas internas se duplican.
  assert.equal(csvField('Servicio "premium"'), '"Servicio ""premium"""');
  // Saltos de línea fuerzan comillas.
  assert.equal(csvField("linea1\nlinea2"), '"linea1\nlinea2"');
});

test("csvField neutraliza en origen un texto que Excel tomaría como fórmula; los números no", () => {
  // Texto que carga cualquiera (un nombre en la tienda online, un proveedor, un motivo).
  assert.equal(csvField("=HIPERVINCULO(\"http://x\")"), '"\'=HIPERVINCULO(""http://x"")"');
  assert.equal(csvField("+54 11 5555"), "'+54 11 5555");
  assert.equal(csvField("@SUMA(A1)"), "'@SUMA(A1)");
  assert.equal(csvField("-2+3"), "'-2+3");
  assert.equal(csvField("\t=1"), "'\t=1");
  // Importes, stocks y porcentajes negativos siguen siendo números que se suman.
  assert.equal(csvField("-1234,50"), "-1234,50");
  assert.equal(csvField("-1.234,50"), "-1.234,50");
  assert.equal(csvField("-4,5%"), "-4,5%");
  assert.equal(csvField(-3.5), "-3.5");
  // Idempotente: lo ya neutralizado no suma otro apóstrofo.
  assert.equal(csvField("'=1+1"), "'=1+1");
});

test("el CSV del reporte sale con el nombre peligroso neutralizado", () => {
  const csv = buildReportCsv(baseInput({ porServicio: [{ label: "=1+1", total: 100 }] }));
  assert.ok(csv.includes("'=1+1"));
  assert.ok(!/(^|;|\r\n)=1\+1/.test(csv));
});

const emptyKpis: DeepKpis = {
  estados: { completados: 0, noShow: 0, cancelados: 0, resueltos: 0, tasaNoShow: 0, tasaCancelacion: 0 },
  ticketPromedio: 0,
  mixMetodoPago: [],
  retencion: { clientesUnicos: 0, recurrentes: 0, esporadicos: 0, tasaRecurrencia: 0 },
  rentabilidadHoraSilla: [],
};

function baseInput(overrides: Partial<ReportCsvInput> = {}): ReportCsvInput {
  return {
    desde: new Date("2026-04-01T00:00:00.000Z"),
    hasta: new Date("2026-06-30T00:00:00.000Z"),
    rangeDays: 90,
    totalIngresos: 0,
    cantidadPagos: 0,
    totalTurnos: 0,
    porDia: [],
    porProfesional: [],
    porServicio: [],
    kpis: emptyKpis,
    ...overrides,
  };
}

test("el CSV es determinista y usa CRLF entre filas", () => {
  const csv = buildReportCsv(baseInput());
  assert.equal(buildReportCsv(baseInput()), csv); // mismo input → mismo texto
  assert.ok(csv.includes("\r\n"));
  assert.ok(csv.startsWith("Reporte del negocio"));
  // El período se emite como fechas ISO cortas.
  assert.ok(csv.includes("2026-04-01 a 2026-06-30"));
});

test("un valor con el separador se escapa dentro del CSV armado", () => {
  const csv = buildReportCsv(
    baseInput({
      porServicio: [{ label: "Corte; barba", total: 5000 }],
    }),
  );
  assert.ok(csv.includes('"Corte; barba"'));
});

test("los KPIs aparecen en la sección de indicadores", () => {
  const kpis: DeepKpis = {
    ...emptyKpis,
    estados: { completados: 8, noShow: 2, cancelados: 1, resueltos: 11, tasaNoShow: 0.2, tasaCancelacion: 0.0909 },
    ticketPromedio: 3500,
    retencion: { clientesUnicos: 10, recurrentes: 4, esporadicos: 6, tasaRecurrencia: 0.4 },
    mixMetodoPago: [{ method: "EFECTIVO", cantidad: 5, total: 15000 }],
    rentabilidadHoraSilla: [{ label: "Ana", ingresos: 12000, horas: 4, porHora: 3000 }],
  };
  const csv = buildReportCsv(baseInput({ totalIngresos: 28000, cantidadPagos: 8, totalTurnos: 11, kpis }));
  assert.ok(csv.includes("Tasa de no-show;20%"));
  assert.ok(csv.includes("Tasa de recurrencia;40%"));
  // Sección hora-silla y método de pago presentes con sus filas.
  assert.ok(csv.includes("Rentabilidad hora-silla"));
  assert.ok(csv.includes("Ana;"));
  assert.ok(csv.includes("Efectivo;5;"));
});
