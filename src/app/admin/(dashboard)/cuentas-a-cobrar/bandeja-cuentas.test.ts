import { test } from "node:test";
import assert from "node:assert/strict";
import { agruparCuentas, folioDeLaCuenta, grupoDeLaCuenta, type CuentaDeBandeja } from "./bandeja-cuentas";

const HOY = "2026-09-24";
const c = (id: string, saldo: number, desde: string, vence: string | null): CuentaDeBandeja => ({
  id,
  quien: id,
  concepto: null,
  total: saldo,
  saldo,
  desde,
  vence,
});

test("vencido primero, y adentro la plata más grande arriba", () => {
  const g = agruparCuentas([c("a", 1000, "2026-08-01", "2026-09-10"), c("b", 5000, "2026-08-01", "2026-09-20"), c("c", 200, "2026-09-20", "2026-10-30")], HOY, "cobrar");
  assert.deepEqual(
    g.map((x) => x.clave),
    ["vencido", "resto"],
  );
  assert.deepEqual(
    g[0].cuentas.map((x) => x.id),
    ["b", "a"],
  );
  assert.equal(g[0].suma, 6000);
});

test("esta semana va por fecha: lo que vence antes, primero", () => {
  const g = agruparCuentas([c("tarde", 9000, "2026-09-01", "2026-09-30"), c("hoy", 100, "2026-09-01", "2026-09-24")], HOY, "cobrar");
  assert.deepEqual(
    g[0].cuentas.map((x) => x.id),
    ["hoy", "tarde"],
  );
});

test("fiado sin vencimiento de más de 30 días pide atención; el reciente queda al día", () => {
  assert.equal(grupoDeLaCuenta({ desde: "2026-08-20", vence: null }, HOY, "cobrar"), "viejo");
  assert.equal(grupoDeLaCuenta({ desde: "2026-09-10", vence: null }, HOY, "cobrar"), "resto");
  assert.equal(grupoDeLaCuenta({ desde: "2026-08-20", vence: null }, HOY, "pagar"), "viejo");
});

test("lo saldado no entra en la bandeja", () => {
  assert.deepEqual(agruparCuentas([c("x", 0, "2026-09-01", null)], HOY, "cobrar"), []);
});

test("a pagar: lo sin vencimiento va al final", () => {
  const g = agruparCuentas([c("sin", 100, "2026-09-01", null), c("lejos", 100, "2026-09-01", "2026-11-01")], HOY, "pagar");
  assert.deepEqual(
    g.map((x) => x.clave),
    ["resto", "viejo"],
  );
  assert.equal(g[1].titulo, "Sin vencimiento");
});

test("el folio dice cuándo, en palabras", () => {
  assert.equal(folioDeLaCuenta({ desde: "2026-09-01", vence: "2026-09-23" }, HOY), "venció ayer");
  assert.equal(folioDeLaCuenta({ desde: "2026-09-01", vence: "2026-09-12" }, HOY), "venció hace 12 días");
  assert.equal(folioDeLaCuenta({ desde: "2026-09-01", vence: "2026-09-24" }, HOY), "vence hoy");
  assert.equal(folioDeLaCuenta({ desde: "2026-09-01", vence: "2026-09-25" }, HOY), "vence mañana");
  assert.equal(folioDeLaCuenta({ desde: "2026-09-01", vence: "2026-10-05" }, HOY), "vence 05/10");
  assert.equal(folioDeLaCuenta({ desde: "2026-08-10", vence: null }, HOY), "hace 45 días");
});
