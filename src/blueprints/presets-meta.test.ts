import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultModulesForBlueprint } from "./presets-meta";

// OP-2: la consola de operador mostraba "0 módulos" para los 4 tenants reales porque
// `Tenant.modules` nunca se persistió en el alta — no porque no tuvieran módulos. Esta
// derivación es lo que le da un número honesto sin backfillear prod.

// IDs de módulo de NAV válidos (espejo de MODULES en src/lib/operator-config). El SET
// LITE POR RUBRO SÓLO puede contener estos — nunca el vocabulario interno del blueprint
// retail (stock/venta-peso/venta-unidad/proveedores/cuenta-corriente), que no son nav.
const NAV_MODULE_IDS = new Set([
  "agenda", "pos", "catalog", "clients", "waitlist", "reminders", "reports",
  "commissions", "arca", "mercadopago",
]);
// Módulos propios de SERVICIOS que un retail/mostrador NO debe traer (nav limpia).
const SERVICES_ONLY = ["agenda", "waitlist", "commissions"];

test("familia agenda (rubro sin preset propio, p. ej. peluquería) trae los módulos de agenda", () => {
  const modules = defaultModulesForBlueprint("peluqueria");
  assert.ok(modules.includes("agenda"));
  assert.ok(modules.length > 0);
});

test("SET LITE POR RUBRO: todo rubro devuelve SOLO ids de módulo de nav reales (no vocabulario retail interno)", () => {
  for (const rubro of ["carniceria", "velas", "padel", "verduleria", "dietetica", "kiosco", "fiambreria", "indumentaria", "servicios", "peluqueria"]) {
    for (const m of defaultModulesForBlueprint(rubro)) {
      assert.ok(NAV_MODULE_IDS.has(m), `rubro "${rubro}" devolvió "${m}", que NO es un módulo de nav válido`);
    }
  }
});

test("retail (carnicería) = set lite limpio de mostrador (pos/catálogo/clientes/reportes + arca), SIN pantallas de servicios ni vocabulario interno", () => {
  const modules = defaultModulesForBlueprint("carniceria");
  for (const need of ["pos", "catalog", "clients", "reports", "arca"]) {
    assert.ok(modules.includes(need), `carnicería debería tener "${need}"`);
  }
  for (const forbidden of SERVICES_ONLY) {
    assert.ok(!modules.includes(forbidden), `carnicería NO debería tener "${forbidden}" (es de servicios)`);
  }
  // Guarda de regresión dura: nada del vocabulario interno de retail.
  for (const internal of ["stock", "venta-peso", "venta-unidad", "proveedores", "cuenta-corriente"]) {
    assert.ok(!modules.includes(internal), `carnicería NO debería exponer el concepto interno "${internal}" como módulo`);
  }
});

test("velas y padel (retail) = piso lite de mostrador, sin agenda/espera/comisiones — los 3 tenants retail reales", () => {
  for (const rubro of ["velas", "padel"]) {
    const modules = defaultModulesForBlueprint(rubro);
    for (const need of ["pos", "catalog", "clients", "reports"]) {
      assert.ok(modules.includes(need), `${rubro} debería tener "${need}"`);
    }
    for (const forbidden of SERVICES_ONLY) {
      assert.ok(!modules.includes(forbidden), `${rubro} NO debería tener "${forbidden}"`);
    }
  }
});

test("'servicios' (blueprint histórico de CH) hereda el set de agenda — con agenda, sin pos", () => {
  const modules = defaultModulesForBlueprint("servicios");
  assert.ok(modules.includes("agenda"));
  assert.ok(!modules.includes("pos"), "servicios no es mostrador → sin pos");
  assert.ok(modules.length > 0);
});

test("blueprint sin default conocido (p. ej. genérico) devuelve vacío, no inventa", () => {
  assert.deepEqual(defaultModulesForBlueprint("generico"), []);
});

test("blueprintId null/undefined no rompe — vacío", () => {
  assert.deepEqual(defaultModulesForBlueprint(null), []);
  assert.deepEqual(defaultModulesForBlueprint(undefined), []);
});
