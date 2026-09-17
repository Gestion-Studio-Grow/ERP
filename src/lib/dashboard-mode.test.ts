import { test } from "node:test";
import assert from "node:assert/strict";
import { dashboardMode, dashboardModeForModules } from "./dashboard-mode";

// ============================================================================
// QUÉ HOME VE CADA LOCAL. Las dos puntas, porque las dos costaron plata:
//   · si el rubro NO manda, una carnicería abre el sistema y ve la agenda de un spa
//     (el home de mostrador existía y no se disparaba nunca);
//   · si para arreglar eso alguien prende `MODULE_REGISTRY_ENABLED`, beauty-spa —que
//     tiene `modules = {}` y es el único tenant vivo— se queda sin menú.
// El porqué completo está en dashboard-mode.ts.
// ============================================================================

// --- La respuesta del producto: `dashboardMode` (rubro + módulos) ---

test("HOY (registro de módulos apagado): el RUBRO manda", () => {
  // magra y sus 4 locales hermanos: mostrador.
  assert.equal(dashboardMode({ activeModules: null, isRetail: true }), "retail");
  // beauty-spa: su home de agenda de siempre.
  assert.equal(dashboardMode({ activeModules: null, isRetail: false }), "servicios");
});

test("con el registro ENCENDIDO manda el dato explícito del tenant, no el rubro", () => {
  // Un retail que NO contrató pos no ve el home de mostrador…
  assert.equal(dashboardMode({ activeModules: new Set(["catalog"]), isRetail: true }), "servicios");
  // …y uno que sí, lo ve aunque su rubro no estuviera resuelto.
  assert.equal(dashboardMode({ activeModules: new Set(["pos"]), isRetail: false }), "retail");
  // Set vacío (el caso de beauty-spa con el flag ON) → home legado, nunca mostrador.
  assert.equal(dashboardMode({ activeModules: new Set(), isRetail: false }), "servicios");
});

test("fail-safe: sin saber el rubro y sin módulos, se cae al home de servicios", () => {
  assert.equal(dashboardMode({ activeModules: null, isRetail: false }), "servicios");
});

// --- El camino por módulos, intacto (se usará el día que el registro se encienda) ---

test("flag OFF (null) → servicios: los módulos no dicen NADA, la respuesta la da el rubro", () => {
  assert.equal(dashboardModeForModules(null), "servicios");
});

test("mostrador: pos sin agenda → retail", () => {
  assert.equal(dashboardModeForModules(new Set(["pos", "catalog", "clients", "reports"])), "retail");
  assert.equal(dashboardModeForModules(new Set(["pos", "catalog", "clients", "reports", "arca"])), "retail");
});

test("servicios: tiene agenda → servicios (aunque tuviera pos)", () => {
  assert.equal(dashboardModeForModules(new Set(["agenda", "catalog", "clients", "waitlist", "reminders", "reports"])), "servicios");
  assert.equal(dashboardModeForModules(new Set(["agenda", "pos"])), "servicios");
});

test("sin pos ni agenda → servicios (default seguro)", () => {
  assert.equal(dashboardModeForModules(new Set(["catalog", "clients"])), "servicios");
  assert.equal(dashboardModeForModules(new Set()), "servicios");
});
