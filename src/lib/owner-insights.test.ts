import { test } from "node:test";
import assert from "node:assert/strict";

import { generateOwnerInsights, DEFAULT_THRESHOLDS } from "./owner-insights";
import type { DeepKpis } from "./report-kpis";

// Fábrica de DeepKpis con overrides — evita repetir el shape completo en cada test.
function kpis(over: Partial<DeepKpis> = {}): DeepKpis {
  return {
    estados: {
      completados: 10,
      noShow: 0,
      cancelados: 0,
      resueltos: 10,
      tasaNoShow: 0,
      tasaCancelacion: 0,
      ...(over.estados ?? {}),
    },
    ticketPromedio: over.ticketPromedio ?? 1000,
    mixMetodoPago: over.mixMetodoPago ?? [],
    retencion: {
      clientesUnicos: 10,
      recurrentes: 5,
      esporadicos: 5,
      tasaRecurrencia: 0.5,
      ...(over.retencion ?? {}),
    },
    rentabilidadHoraSilla: over.rentabilidadHoraSilla ?? [],
  };
}

test("no-show por encima del umbral genera una alerta", () => {
  const current = kpis({
    estados: {
      completados: 8,
      noShow: 2,
      cancelados: 0,
      resueltos: 10,
      tasaNoShow: 0.2, // > 0.15
      tasaCancelacion: 0,
    },
  });
  const insights = generateOwnerInsights(current);
  const alerta = insights.find((i) => i.id === "no-show-alto");
  assert.ok(alerta, "debería existir el insight de no-show alto");
  assert.equal(alerta!.severity, "alert");
});

test("las alertas quedan primeras (orden por severidad)", () => {
  const current = kpis({
    estados: {
      completados: 8,
      noShow: 2,
      cancelados: 0,
      resueltos: 10,
      tasaNoShow: 0.2,
      tasaCancelacion: 0,
    },
    rentabilidadHoraSilla: [{ label: "Ana", ingresos: 5000, horas: 5, porHora: 1000 }],
  });
  const insights = generateOwnerInsights(current);
  assert.ok(insights.length >= 2);
  assert.equal(insights[0].severity, "alert");
});

test("caída del ticket promedio vs período previo dispara advertencia con delta", () => {
  const previous = kpis({ ticketPromedio: 1000 });
  const current = kpis({ ticketPromedio: 850 }); // -15%, umbral 10%
  const insights = generateOwnerInsights(current, previous);
  const ticket = insights.find((i) => i.id === "ticket-cae");
  assert.ok(ticket, "debería advertir por caída de ticket");
  assert.equal(ticket!.severity, "warn");
  assert.ok(ticket!.deltaPct !== null && ticket!.deltaPct < 0);
});

test("suba del ticket promedio se reporta como algo bueno", () => {
  const previous = kpis({ ticketPromedio: 1000 });
  const current = kpis({ ticketPromedio: 1200 }); // +20%
  const insights = generateOwnerInsights(current, previous);
  const ticket = insights.find((i) => i.id === "ticket-sube");
  assert.ok(ticket);
  assert.equal(ticket!.severity, "good");
});

test("sin período previo NO hay insights de comparación temporal", () => {
  const current = kpis({ ticketPromedio: 500 });
  const insights = generateOwnerInsights(current, null);
  assert.ok(!insights.some((i) => i.id === "ticket-cae"));
  assert.ok(!insights.some((i) => i.id === "ticket-sube"));
});

test("recurrencia baja abre una oportunidad de fidelización", () => {
  const current = kpis({
    retencion: { clientesUnicos: 20, recurrentes: 2, esporadicos: 18, tasaRecurrencia: 0.1 },
  });
  const insights = generateOwnerInsights(current);
  assert.ok(insights.some((i) => i.id === "recurrencia-baja" && i.severity === "info"));
});

test("mix de pago muy concentrado se marca como info de riesgo", () => {
  const current = kpis({
    mixMetodoPago: [
      { method: "MERCADOPAGO", cantidad: 90, total: 9000 },
      { method: "EFECTIVO", cantidad: 10, total: 1000 },
    ],
  });
  const insights = generateOwnerInsights(current);
  const mix = insights.find((i) => i.id === "mix-concentrado");
  assert.ok(mix, "90% por un medio debería disparar el insight");
});

test("un negocio sano (sin fuga, ticket estable) no genera alertas", () => {
  const previous = kpis({ ticketPromedio: 1000 });
  const current = kpis({ ticketPromedio: 1000 });
  const insights = generateOwnerInsights(current, previous, DEFAULT_THRESHOLDS);
  assert.ok(!insights.some((i) => i.severity === "alert"));
});
