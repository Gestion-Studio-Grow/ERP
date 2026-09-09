// Tests del filtro de rollout por flag (ADR-054 `flag`) + el descriptor VIAJES en el
// catálogo real (variante ADR-055: solo agencia-viajes). node:test, puro.

import { test } from "node:test";
import assert from "node:assert/strict";
import { filtrarPorFlagDeRollout } from "./rollout";
import { ModuleRegistry } from "./registry";
import { construirCatalogo } from "./catalog";
import { resolverActivacion } from "./activation";
import { presupuestosViajeModule, buscadorOfertasViajeModule, MODULO_PRESUPUESTOS_VIAJE, MODULO_BUSCADOR_OFERTAS_VIAJE } from "./descriptors/viajes";
import type { ModuleDescriptor } from "./contract";

function cap(id: string, extra: Partial<ModuleDescriptor> = {}): ModuleDescriptor {
  return { id, version: "1.0.0", nombre: id, descripcion: `Módulo ${id}.`, kind: "capability", rubros: "todos", ...extra };
}

test("filtrarPorFlagDeRollout: sin flag pasa; con flag OFF se filtra; con flag ON pasa", () => {
  const r = new ModuleRegistry().registrarTodos([cap("agenda"), cap("beta", { flag: "BETA_ENABLED" })]);
  assert.deepEqual(filtrarPorFlagDeRollout(["agenda", "beta"], r, {}), ["agenda"]);
  assert.deepEqual(filtrarPorFlagDeRollout(["agenda", "beta"], r, { BETA_ENABLED: "0" }), ["agenda"]);
  assert.deepEqual(filtrarPorFlagDeRollout(["agenda", "beta"], r, { BETA_ENABLED: "true" }), ["agenda", "beta"]);
  assert.deepEqual(filtrarPorFlagDeRollout(["agenda", "beta"], r, { BETA_ENABLED: " ON " }), ["agenda", "beta"]);
});

test("filtrarPorFlagDeRollout: ids desconocidos se conservan (no es su tarea validarlos)", () => {
  const r = new ModuleRegistry().registrarTodos([cap("agenda")]);
  assert.deepEqual(filtrarPorFlagDeRollout(["agenda", "fantasma"], r, {}), ["agenda", "fantasma"]);
});

test("VIAJES: los dos módulos están en el catálogo real, con flag VIAJES_ENABLED y migración aditiva", () => {
  const r = construirCatalogo();
  const p = r.get(MODULO_PRESUPUESTOS_VIAJE);
  const b = r.get(MODULO_BUSCADOR_OFERTAS_VIAJE);
  assert.equal(p.kind, "capability");
  assert.equal(b.kind, "plugin");
  assert.equal(p.capability, "quotes:manage");
  assert.equal(p.flag, "VIAJES_ENABLED");
  assert.equal(b.flag, "VIAJES_ENABLED");
  assert.ok(p.migraciones?.every((m) => m.aditiva === true));
  assert.equal(presupuestosViajeModule.nucleoPara, undefined); // no es núcleo de ningún producto
  assert.ok(buscadorOfertasViajeModule.dependencias?.some((d) => d.id === MODULO_PRESUPUESTOS_VIAJE));
});

test("VIAJES (variante ADR-055): incompatible con servicios/carnicería/genérico; compatible solo con el rubro viajes", () => {
  const r = construirCatalogo();
  for (const rubro of ["servicios", "carniceria", "generico", "facturita", null]) {
    const res = resolverActivacion({ tenantId: "t", blueprintId: rubro, modules: ["clients", MODULO_PRESUPUESTOS_VIAJE] }, r);
    assert.deepEqual(res.activos.map((d) => d.id), ["clients"], `rubro ${rubro}`);
    assert.equal(res.incompatibles[0]?.id, MODULO_PRESUPUESTOS_VIAJE);
  }
  const ok = resolverActivacion({ tenantId: "t", blueprintId: "viajes", modules: ["clients", MODULO_PRESUPUESTOS_VIAJE, MODULO_BUSCADOR_OFERTAS_VIAJE] }, r);
  assert.deepEqual(ok.activos.map((d) => d.id).sort(), [MODULO_BUSCADOR_OFERTAS_VIAJE, "clients", MODULO_PRESUPUESTOS_VIAJE].sort());
});

test("VIAJES: presupuestos depende de clients; el buscador depende de presupuestos (cae en cascada)", () => {
  const r = construirCatalogo();
  const sinClients = resolverActivacion({ tenantId: "t", blueprintId: "viajes", modules: [MODULO_PRESUPUESTOS_VIAJE, MODULO_BUSCADOR_OFERTAS_VIAJE] }, r);
  assert.deepEqual(sinClients.activos, []);
  assert.deepEqual(sinClients.dependenciasFaltantes.map((x) => x.id).sort(), [MODULO_BUSCADOR_OFERTAS_VIAJE, MODULO_PRESUPUESTOS_VIAJE].sort());
});

test("VIAJES: con el flag apagado (default) se filtran del set asignado → la nav no los muestra", () => {
  const r = construirCatalogo();
  assert.deepEqual(filtrarPorFlagDeRollout(["clients", MODULO_PRESUPUESTOS_VIAJE, MODULO_BUSCADOR_OFERTAS_VIAJE], r, {}), ["clients"]);
  assert.deepEqual(filtrarPorFlagDeRollout(["clients", MODULO_PRESUPUESTOS_VIAJE], r, { VIAJES_ENABLED: "1" }), ["clients", MODULO_PRESUPUESTOS_VIAJE]);
});
