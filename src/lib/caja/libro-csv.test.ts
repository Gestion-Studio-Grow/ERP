// Pruebas del export del libro de caja. Lo que se protege acá es que el archivo que
// recibe la contadora sea USABLE: números que Excel es-AR pueda sumar, y filas que no
// se partan cuando el detalle trae el mismo caracter que separa las columnas.

import test from "node:test";
import assert from "node:assert/strict";
import { buildLibroCsv } from "./libro-csv";
import { buildLibro, CASH_METHOD_LABEL, totalOf, zeroAmounts, type LibroMovement } from "./libro-caja";

const deps = {
  methodLabel: (m: "EFECTIVO" | "MP" | "TARJETA") => CASH_METHOD_LABEL[m],
  monthLabel: "septiembre 2026",
  totalOf,
};

function mov(over: Partial<LibroMovement> & { amount: number }): LibroMovement {
  return {
    id: over.id ?? "m1",
    occurredAt: over.occurredAt ?? new Date("2026-09-10T15:00:00.000Z"),
    type: over.type ?? "INGRESO",
    method: over.method ?? "EFECTIVO",
    amount: over.amount,
    detail: over.detail ?? "detalle",
  };
}

test("el CSV lleva el resumen arriba y después los movimientos", () => {
  const libro = buildLibro(zeroAmounts(), [mov({ amount: 1000 })]);
  const csv = buildLibroCsv(libro, deps);
  assert.ok(csv.startsWith("Libro de caja — septiembre 2026"));
  assert.ok(csv.includes("RESUMEN"));
  assert.ok(csv.includes("Saldo actual"));
  assert.ok(csv.includes("Fecha;Detalle;Medio;Ingreso;Egreso;Saldo"));
});

test("los importes usan COMA decimal para que Excel es-AR los sume", () => {
  const libro = buildLibro(zeroAmounts(), [mov({ amount: 1234.5 })]);
  const csv = buildLibroCsv(libro, deps);
  // Con punto decimal Excel es-AR lo lee como TEXTO y no se puede sumar.
  assert.ok(csv.includes("1234,50"), csv);
  assert.ok(!csv.includes("1234.50"));
});

test("un detalle con punto y coma no parte la fila", () => {
  const libro = buildLibro(zeroAmounts(), [mov({ amount: 100, detail: "Seña; saldo pendiente" })]);
  const csv = buildLibroCsv(libro, deps);
  assert.ok(csv.includes('"Seña; saldo pendiente"'));
  // La fila de movimiento sigue teniendo 6 columnas.
  const fila = csv.split("\r\n").find((l) => l.includes("Seña"))!;
  assert.equal(fila.split(";").length, 7); // 6 columnas, 1 separador extra dentro de las comillas
});

test("un detalle con comillas las duplica (RFC 4180)", () => {
  const libro = buildLibro(zeroAmounts(), [mov({ amount: 100, detail: 'Vale "el pibe"' })]);
  assert.ok(buildLibroCsv(libro, deps).includes('"Vale ""el pibe"""'));
});

test("ingreso y egreso van en columnas distintas y el saldo acompaña", () => {
  const libro = buildLibro(zeroAmounts(), [
    mov({ id: "a", amount: 1000, type: "INGRESO", occurredAt: new Date("2026-09-01T15:00:00Z") }),
    mov({ id: "b", amount: 400, type: "EGRESO", occurredAt: new Date("2026-09-02T15:00:00Z") }),
  ]);
  const lineas = buildLibroCsv(libro, deps).split("\r\n");
  const ing = lineas.find((l) => l.startsWith("2026-09-01"))!;
  const egr = lineas.find((l) => l.startsWith("2026-09-02"))!;
  assert.equal(ing.split(";")[3], "1000,00"); // columna Ingreso
  assert.equal(ing.split(";")[4], ""); // Egreso vacío
  assert.equal(egr.split(";")[3], ""); // Ingreso vacío
  assert.equal(egr.split(";")[4], "400,00");
  assert.equal(egr.split(";")[5], "600,00"); // saldo corrido
});

test("la fecha va en ISO, que ordena bien en cualquier planilla", () => {
  const libro = buildLibro(zeroAmounts(), [mov({ amount: 10, occurredAt: new Date("2026-09-06T15:00:00Z") })]);
  assert.ok(buildLibroCsv(libro, deps).includes("2026-09-06"));
});

test("un mes sin movimientos exporta el resumen y lo dice", () => {
  const csv = buildLibroCsv(buildLibro(zeroAmounts(), []), deps);
  assert.ok(csv.includes("(sin movimientos en el mes)"));
  assert.ok(csv.includes("RESUMEN"));
});
