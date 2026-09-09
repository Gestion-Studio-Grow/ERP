// Tests de los flags del módulo VIAJES + el ítem de nav (asignación dura). node:test.

import { test } from "node:test";
import assert from "node:assert/strict";
import { viajesCuotaDiaria, viajesEnabled, viajesProveedorClave } from "./flags";
import { ALL_ITEMS, navItemForPath, rutaPermitidaParaModulos } from "@/lib/admin-nav-items";
import { roleHasCapability } from "@/lib/capabilities";

test("viajesEnabled: default OFF; acepta 1/true/on/yes", () => {
  assert.equal(viajesEnabled({}), false);
  assert.equal(viajesEnabled({ VIAJES_ENABLED: "false" }), false);
  for (const v of ["1", "true", "on", "yes", " YES "]) assert.equal(viajesEnabled({ VIAJES_ENABLED: v }), true, v);
});

test("viajesProveedorClave: default stub; viajesCuotaDiaria: default 50, entero no negativo", () => {
  assert.equal(viajesProveedorClave({}), "stub");
  assert.equal(viajesProveedorClave({ VIAJES_PROVEEDOR: " Amadeus " }), "amadeus");
  assert.equal(viajesCuotaDiaria({}), 50);
  assert.equal(viajesCuotaDiaria({ VIAJES_CUOTA_DIARIA: "10" }), 10);
  assert.equal(viajesCuotaDiaria({ VIAJES_CUOTA_DIARIA: "-3" }), 50);
  assert.equal(viajesCuotaDiaria({ VIAJES_CUOTA_DIARIA: "abc" }), 50);
});

test("nav: /admin/viajes existe, exige asignación dura y va atado al módulo viajes", () => {
  const item = navItemForPath("/admin/viajes");
  assert.equal(item?.module, "viajes");
  assert.equal(item?.requiereAsignacion, true);
  assert.equal(item?.cap, "viajes:manage");
  // Es el ÚNICO ítem con asignación dura hoy: los demás no cambian de comportamiento.
  assert.deepEqual(ALL_ITEMS.filter((i) => i.requiereAsignacion).map((i) => i.href), ["/admin/viajes"]);
});

test("gating por-URL: un Comerciante (sin viajes) no entra a /admin/viajes; una agencia con el módulo sí", () => {
  assert.equal(rutaPermitidaParaModulos("/admin/viajes", ["arca", "bancos", "clients"]), false);
  assert.equal(rutaPermitidaParaModulos("/admin/viajes", ["clients", "viajes"]), true);
});

test("RBAC: viajes:manage es solo OWNER", () => {
  assert.equal(roleHasCapability("OWNER", "viajes:manage"), true);
  assert.equal(roleHasCapability("RECEPTION", "viajes:manage"), false);
  assert.equal(roleHasCapability("PROFESSIONAL", "viajes:manage"), false);
});
