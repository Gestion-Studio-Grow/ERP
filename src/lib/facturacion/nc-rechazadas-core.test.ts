import { test } from "node:test";
import assert from "node:assert/strict";
import { importeDeLaReemision, notasRechazadasPendientes, type NotaRechazadaFila } from "./nc-rechazadas-core";

const fila = (id: string, extra: Partial<NotaRechazadaFila> = {}): NotaRechazadaFila => ({
  id,
  total: 5000,
  rechazoMotivo: "10016: la fecha no corresponde",
  createdAt: new Date("2026-11-01T10:00:00Z"),
  factura: { id: `f-${id}`, puntoVenta: 2, numero: 123, total: 18000, notasVivas: [] },
  ...extra,
});

test("la rechazada sin volver a emitir y con saldo en la factura pide atención, con el número de la factura y el motivo de ARCA", () => {
  assert.deepEqual(notasRechazadasPendientes([fila("a")], new Set()), [
    { notaId: "a", facturaId: "f-a", factura: "0002-00000123", importe: 5000, saldoDeLaFactura: 18000, motivoArca: "10016: la fecha no corresponde", creada: new Date("2026-11-01T10:00:00Z") },
  ]);
});

test("ya vuelta a emitir (o dada por resuelta): no aparece", () => {
  assert.deepEqual(notasRechazadasPendientes([fila("a"), fila("b")], new Set(["a"])).map((n) => n.notaId), ["b"]);
});

test("la factura ya quedó anulada entera por otra nota: no aparece; con saldo parcial, sí y con el saldo al centavo", () => {
  const cubierta = fila("a", { factura: { id: "f", puntoVenta: 1, numero: 1, total: 100.1, notasVivas: [50.05, 50.05] } });
  const parcial = fila("b", { factura: { id: "g", puntoVenta: 1, numero: 2, total: 100.1, notasVivas: [0.1, 0.2] } });
  const r = notasRechazadasPendientes([cubierta, parcial], new Set());
  assert.deepEqual(r.map((n) => [n.notaId, n.saldoDeLaFactura]), [["b", 99.8]]);
});

test("sin motivo de ARCA lo dice; sin factura asociada se ignora; ordenadas de la más vieja a la más nueva", () => {
  const r = notasRechazadasPendientes(
    [fila("nueva", { createdAt: new Date("2026-11-05T00:00:00Z"), rechazoMotivo: "  " }), fila("vieja"), fila("huérfana", { factura: null })],
    new Set(),
  );
  assert.deepEqual(r.map((n) => [n.notaId, n.motivoArca]), [["vieja", "10016: la fecha no corresponde"], ["nueva", "ARCA no dio el motivo"]]);
});

test("el importe de la reemisión nunca pasa el saldo de la factura", () => {
  assert.equal(importeDeLaReemision(5000, 18000), 5000);
  assert.equal(importeDeLaReemision(5000, 3000), 3000);
});
