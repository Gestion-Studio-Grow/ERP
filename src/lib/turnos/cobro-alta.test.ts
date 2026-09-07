import test from "node:test";
import assert from "node:assert/strict";
import { cobroPropuestoAlAlta, montoDelCobro, quedaSaldado } from "./cobro-alta";

// ── La propuesta según de dónde se abre el formulario ────────────────────────

test("desde el mostrador se propone cobrar el total: la clienta está ahí", () => {
  assert.equal(cobroPropuestoAlAlta({ origen: "mostrador", senia: 5000 }), "total");
  assert.equal(cobroPropuestoAlAlta({ origen: "mostrador", senia: 0 }), "total");
});

test("desde la agenda se propone la seña, y si no hay seña no se cobra nada", () => {
  assert.equal(cobroPropuestoAlAlta({ origen: "agenda", senia: 5000 }), "senia");
  assert.equal(cobroPropuestoAlAlta({ origen: "agenda", senia: 0 }), "nada");
});

// ── El monto ─────────────────────────────────────────────────────────────────

test("cada modo cobra lo suyo", () => {
  const base = { senia: 5000, precio: 35000 };
  assert.equal(montoDelCobro({ ...base, modo: "nada" }), 0);
  assert.equal(montoDelCobro({ ...base, modo: "senia" }), 5000);
  assert.equal(montoDelCobro({ ...base, modo: "total" }), 35000);
  assert.equal(montoDelCobro({ ...base, modo: "otro", otro: "12000" }), 12000);
});

test("el monto libre acepta coma decimal, como se tipea en Argentina", () => {
  assert.equal(montoDelCobro({ senia: 0, precio: 100, modo: "otro", otro: "1500,50" }), 1500.5);
});

test("un monto libre ilegible vale 0, y con 0 el servidor rechaza: nunca se inventa un cobro", () => {
  for (const basura of ["", "   ", "abc", "-100", "0"]) {
    assert.equal(montoDelCobro({ senia: 0, precio: 100, modo: "otro", otro: basura }), 0, `falló con ${JSON.stringify(basura)}`);
  }
  assert.equal(montoDelCobro({ senia: 0, precio: 100, modo: "otro" }), 0);
});

test("una seña o un precio rotos no se cobran", () => {
  assert.equal(montoDelCobro({ senia: NaN, precio: 100, modo: "senia" }), 0);
  assert.equal(montoDelCobro({ senia: -5, precio: 100, modo: "senia" }), 0);
  assert.equal(montoDelCobro({ senia: 0, precio: NaN, modo: "total" }), 0);
});

// ── El aviso de saldado ──────────────────────────────────────────────────────

test("cobrar el total deja el turno saldado; la seña no", () => {
  assert.equal(quedaSaldado({ monto: 35000, precio: 35000 }), true);
  assert.equal(quedaSaldado({ monto: 40000, precio: 35000 }), true);
  assert.equal(quedaSaldado({ monto: 5000, precio: 35000 }), false);
  assert.equal(quedaSaldado({ monto: 0, precio: 0 }), false);
});
