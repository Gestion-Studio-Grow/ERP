// Tests del filtro de rollout por flag (ADR-054 `flag`) + el descriptor VIAJES en el
// catálogo real (variante ADR-055: solo agencia-viajes). node:test, puro.

import { test } from "node:test";
import assert from "node:assert/strict";
import { filtrarPorFlagDeRollout } from "./rollout";
import { ModuleRegistry } from "./registry";
import { construirCatalogo } from "./catalog";
import { resolverActivacion } from "./activation";
import { viajesModule, MODULO_VIAJES } from "./descriptors/viajes";
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

test("VIAJES: está en el catálogo real, es capability, tiene flag VIAJES_ENABLED y migración aditiva", () => {
  const r = construirCatalogo();
  const d = r.get(MODULO_VIAJES);
  assert.equal(d.kind, "capability");
  assert.equal(d.capability, "viajes:manage");
  assert.equal(d.flag, "VIAJES_ENABLED");
  assert.ok(d.migraciones?.every((m) => m.aditiva === true));
  assert.equal(viajesModule.nucleoPara, undefined); // no es núcleo de ningún producto
});

test("VIAJES (variante ADR-055): incompatible con servicios/carnicería/genérico; compatible solo con agencia-viajes", () => {
  const r = construirCatalogo();
  for (const rubro of ["servicios", "carniceria", "generico", "facturita", null]) {
    const res = resolverActivacion({ tenantId: "t", blueprintId: rubro, modules: ["clients", MODULO_VIAJES] }, r);
    assert.deepEqual(res.activos.map((d) => d.id), ["clients"], `rubro ${rubro}`);
    assert.equal(res.incompatibles[0]?.id, MODULO_VIAJES);
  }
  const ok = resolverActivacion({ tenantId: "t", blueprintId: "agencia-viajes", modules: ["clients", MODULO_VIAJES] }, r);
  assert.deepEqual(ok.activos.map((d) => d.id).sort(), ["clients", MODULO_VIAJES]);
});

test("VIAJES: depende de clients (el pasajero principal es un Client del Core)", () => {
  const r = construirCatalogo();
  const res = resolverActivacion({ tenantId: "t", blueprintId: "agencia-viajes", modules: [MODULO_VIAJES] }, r);
  assert.deepEqual(res.activos, []);
  assert.equal(res.dependenciasFaltantes[0]?.id, MODULO_VIAJES);
});

test("VIAJES: con el flag apagado (default) se filtra del set asignado → la nav no lo muestra", () => {
  const r = construirCatalogo();
  assert.deepEqual(filtrarPorFlagDeRollout(["clients", MODULO_VIAJES], r, {}), ["clients"]);
  assert.deepEqual(filtrarPorFlagDeRollout(["clients", MODULO_VIAJES], r, { VIAJES_ENABLED: "1" }), ["clients", MODULO_VIAJES]);
});
