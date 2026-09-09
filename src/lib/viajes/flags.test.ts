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

test("nav: /admin/viajes existe, exige asignación dura y va atado al módulo presupuestos-viaje", () => {
  const item = navItemForPath("/admin/viajes");
  assert.equal(item?.module, "presupuestos-viaje");
  assert.equal(item?.requiereAsignacion, true);
  assert.equal(item?.cap, "quotes:read");
  // Es el ÚNICO ítem con asignación dura hoy: los demás no cambian de comportamiento.
  assert.deepEqual(ALL_ITEMS.filter((i) => i.requiereAsignacion).map((i) => i.href), ["/admin/viajes"]);
});

test("gating por-URL: un Comerciante (sin viajes) no entra a /admin/viajes; una agencia con el módulo sí", () => {
  assert.equal(rutaPermitidaParaModulos("/admin/viajes", ["arca", "bancos", "clients"]), false);
  assert.equal(rutaPermitidaParaModulos("/admin/viajes", ["clients", "presupuestos-viaje"]), true);
});

test("RBAC (spec §5.2): RECEPTION arma y sigue pero NO pone precio ni envía; OWNER todo; PROFESSIONAL nada", () => {
  for (const c of ["quotes:read", "quotes:manage", "quotes:track"] as const) {
    assert.equal(roleHasCapability("OWNER", c), true, c);
    assert.equal(roleHasCapability("RECEPTION", c), true, c);
    assert.equal(roleHasCapability("PROFESSIONAL", c), false, c);
  }
  for (const c of ["quotes:price", "quotes:send"] as const) {
    assert.equal(roleHasCapability("OWNER", c), true, c);
    assert.equal(roleHasCapability("RECEPTION", c), false, c);
    assert.equal(roleHasCapability("PROFESSIONAL", c), false, c);
  }
});
