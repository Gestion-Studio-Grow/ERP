// Tests de la ASIGNACIÓN por tenant (variante, ADR-055). node:test + tsx.
// Foco: el guardarraíl DX-6 (nunca "todos con todo") y los rechazos por variante.

import { test } from "node:test";
import assert from "node:assert/strict";
import type { ModuleDescriptor } from "./contract";
import { ModuleRegistry } from "./registry";
import {
  type TenantModuleState,
  resolverActivacion,
  asignacionSugerida,
} from "./activation";

function cap(id: string, extra: Partial<ModuleDescriptor> = {}): ModuleDescriptor {
  return {
    id,
    version: "1.0.0",
    nombre: id,
    descripcion: `Módulo ${id}.`,
    kind: "capability",
    rubros: "todos",
    ...extra,
  };
}

// Catálogo de prueba que reproduce las reglas reales: waitlist→agenda,
// commissions solo servicios (dep reports).
function catalogoPrueba(): ModuleRegistry {
  return new ModuleRegistry().registrarTodos([
    cap("agenda"),
    cap("catalog"),
    cap("clients"),
    cap("reports"),
    cap("waitlist", { dependencias: [{ id: "agenda", rango: "^1.0" }] }),
    cap("commissions", { rubros: ["servicios"], dependencias: [{ id: "reports" }] }),
  ]);
}

test("asignación diferenciada: solo se activan los módulos pedidos", () => {
  const r = catalogoPrueba();
  const tenant: TenantModuleState = {
    tenantId: "t1",
    blueprintId: "servicios",
    modules: ["agenda", "catalog", "clients"],
  };
  const res = resolverActivacion(tenant, r);
  assert.deepEqual(res.activos.map((d) => d.id).sort(), ["agenda", "catalog", "clients"]);
  assert.equal(res.incompatibles.length, 0);
  assert.equal(res.desconocidos.length, 0);
});

test("GUARDARRAÍL DX-6: un tenant sin módulos asignados NO recibe nada (jamás todos-con-todo)", () => {
  const r = catalogoPrueba();
  const res = resolverActivacion(
    { tenantId: "t", blueprintId: "servicios", modules: [] },
    r,
  );
  assert.deepEqual(res.activos, []);
});

test("variante: módulo incompatible con el rubro se rechaza (commissions en carnicería)", () => {
  const r = catalogoPrueba();
  const res = resolverActivacion(
    { tenantId: "t", blueprintId: "carniceria", modules: ["catalog", "commissions"] },
    r,
  );
  assert.deepEqual(res.activos.map((d) => d.id), ["catalog"]);
  assert.equal(res.incompatibles.length, 1);
  assert.equal(res.incompatibles[0].id, "commissions");
});

test("variante: el mismo módulo SÍ se activa en su rubro (commissions en servicios)", () => {
  const r = catalogoPrueba();
  const res = resolverActivacion(
    { tenantId: "t", blueprintId: "servicios", modules: ["reports", "commissions"] },
    r,
  );
  assert.deepEqual(res.activos.map((d) => d.id).sort(), ["commissions", "reports"]);
});

test("dependencia faltante: waitlist sin agenda no se activa", () => {
  const r = catalogoPrueba();
  const res = resolverActivacion(
    { tenantId: "t", blueprintId: "servicios", modules: ["waitlist", "catalog"] },
    r,
  );
  assert.deepEqual(res.activos.map((d) => d.id), ["catalog"]);
  assert.equal(res.dependenciasFaltantes.length, 1);
  assert.equal(res.dependenciasFaltantes[0].id, "waitlist");
});

test("dependencia presente: waitlist con agenda se activa", () => {
  const r = catalogoPrueba();
  const res = resolverActivacion(
    { tenantId: "t", blueprintId: "servicios", modules: ["waitlist", "agenda"] },
    r,
  );
  assert.deepEqual(res.activos.map((d) => d.id).sort(), ["agenda", "waitlist"]);
  assert.equal(res.dependenciasFaltantes.length, 0);
});

test("commissions requiere reports: sin reports queda como dependencia faltante", () => {
  const r = catalogoPrueba();
  const res = resolverActivacion(
    { tenantId: "t", blueprintId: "servicios", modules: ["commissions"] },
    r,
  );
  assert.deepEqual(res.activos, []);
  assert.equal(res.dependenciasFaltantes[0].id, "commissions");
});

test("dependencia TRANSITIVA en cascada: A→B→C, falta C ⇒ caen B y A", () => {
  const r = new ModuleRegistry().registrarTodos([
    cap("a", { dependencias: [{ id: "b" }] }),
    cap("b", { dependencias: [{ id: "c" }] }),
    // c NO está registrado en el catálogo.
  ]);
  const res = resolverActivacion(
    { tenantId: "t", blueprintId: "servicios", modules: ["a", "b"] },
    r,
  );
  assert.deepEqual(res.activos, []); // ni A ni B se activan
  const caidos = res.dependenciasFaltantes.map((x) => x.id).sort();
  assert.deepEqual(caidos, ["a", "b"]);
});

test("dependencia transitiva satisfecha: A→B→C con los tres presentes se activan", () => {
  const r = new ModuleRegistry().registrarTodos([
    cap("a", { dependencias: [{ id: "b" }] }),
    cap("b", { dependencias: [{ id: "c" }] }),
    cap("c"),
  ]);
  const res = resolverActivacion(
    { tenantId: "t", blueprintId: "servicios", modules: ["a", "b", "c"] },
    r,
  );
  assert.deepEqual(res.activos.map((d) => d.id).sort(), ["a", "b", "c"]);
  assert.equal(res.dependenciasFaltantes.length, 0);
});

test("módulo desconocido va a desconocidos, no rompe", () => {
  const r = catalogoPrueba();
  const res = resolverActivacion(
    { tenantId: "t", blueprintId: "servicios", modules: ["catalog", "inexistente"] },
    r,
  );
  assert.deepEqual(res.activos.map((d) => d.id), ["catalog"]);
  assert.deepEqual(res.desconocidos, ["inexistente"]);
});

test("modules[] con duplicados se dedupe", () => {
  const r = catalogoPrueba();
  const res = resolverActivacion(
    { tenantId: "t", blueprintId: "servicios", modules: ["catalog", "catalog"] },
    r,
  );
  assert.equal(res.activos.filter((d) => d.id === "catalog").length, 1);
});

test("flag enforced se propaga (default true; se puede pasar false)", () => {
  const r = catalogoPrueba();
  const base = { tenantId: "t", blueprintId: "servicios", modules: ["catalog"] };
  assert.equal(resolverActivacion(base, r).enforced, true);
  assert.equal(resolverActivacion(base, r, { enforced: false }).enforced, false);
});

test("asignacionSugerida filtra por compatibilidad de rubro (no infla)", () => {
  const r = catalogoPrueba();
  // Para carnicería, commissions (solo servicios) se descarta de la sugerencia.
  assert.deepEqual(
    asignacionSugerida("carniceria", ["catalog", "commissions", "clients"], r),
    ["catalog", "clients"],
  );
  // Para servicios, se conserva.
  assert.deepEqual(
    asignacionSugerida("servicios", ["catalog", "commissions"], r),
    ["catalog", "commissions"],
  );
  // Un id desconocido no se cuela.
  assert.deepEqual(asignacionSugerida("servicios", ["catalog", "ghost"], r), ["catalog"]);
});
