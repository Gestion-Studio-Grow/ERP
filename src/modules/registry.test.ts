// Tests del registro/catálogo de módulos. node:test + tsx.

import { test } from "node:test";
import assert from "node:assert/strict";
import type { ModuleDescriptor } from "./contract";
import {
  ModuleRegistry,
  ModuloDesconocidoError,
  CatalogoInvalidoError,
  rubroCompatible,
} from "./registry";

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

test("registrar / tiene / get / ids / listar", () => {
  const r = new ModuleRegistry().registrar(cap("a")).registrar(cap("b"));
  assert.ok(r.tiene("a"));
  assert.ok(!r.tiene("z"));
  assert.equal(r.get("a").id, "a");
  assert.deepEqual(r.ids(), ["a", "b"]);
  assert.equal(r.listar().length, 2);
});

test("get de id desconocido lanza ModuloDesconocidoError", () => {
  const r = new ModuleRegistry().registrar(cap("a"));
  assert.throws(() => r.get("z"), ModuloDesconocidoError);
  assert.equal(r.buscar("z"), undefined);
});

test("rubroCompatible: todos y listas", () => {
  assert.ok(rubroCompatible("todos", "cualquiera"));
  assert.ok(rubroCompatible("todos", null));
  assert.ok(rubroCompatible(["servicios"], "servicios"));
  assert.ok(!rubroCompatible(["servicios"], "carniceria"));
  assert.ok(!rubroCompatible(["servicios"], null));
});

test("compatiblesConRubro filtra por variante", () => {
  const r = new ModuleRegistry()
    .registrar(cap("catalog"))
    .registrar(cap("commissions", { rubros: ["servicios"] }));
  assert.deepEqual(
    r.compatiblesConRubro("servicios").map((d) => d.id).sort(),
    ["catalog", "commissions"],
  );
  assert.deepEqual(
    r.compatiblesConRubro("carniceria").map((d) => d.id),
    ["catalog"],
  );
});

test("validar: dependencia colgada es error", () => {
  const r = new ModuleRegistry().registrar(cap("waitlist", { dependencias: [{ id: "agenda" }] }));
  const errs = r.validar().filter((p) => p.severidad === "error");
  assert.ok(errs.some((e) => e.mensaje.includes("no está en el catálogo")));
});

test("validar: rango de versión de dependencia no satisfecho es error", () => {
  const r = new ModuleRegistry()
    .registrar(cap("agenda", { version: "2.0.0" }))
    .registrar(cap("waitlist", { dependencias: [{ id: "agenda", rango: "^1.0" }] }));
  const errs = r.validar().filter((p) => p.severidad === "error");
  assert.ok(errs.some((e) => e.mensaje.includes("pero el catálogo tiene 2.0.0")));
});

test("validar: ciclo de dependencias es error", () => {
  const r = new ModuleRegistry()
    .registrar(cap("a", { dependencias: [{ id: "b" }] }))
    .registrar(cap("b", { dependencias: [{ id: "a" }] }));
  const errs = r.validar().filter((p) => p.severidad === "error");
  assert.ok(errs.some((e) => e.mensaje.includes("ciclo de dependencias")));
});

test("validar: dependencia con compat más amplia que el módulo es AVISO", () => {
  // commissions (solo servicios) depende de reports (todos): OK, reports aplica donde
  // aplica commissions. El caso inverso (módulo "todos" dep de uno restringido) avisa.
  const r = new ModuleRegistry()
    .registrar(cap("reports", { rubros: ["servicios"] }))
    .registrar(cap("dashboard", { rubros: "todos", dependencias: [{ id: "reports" }] }));
  const avisos = r.validar().filter((p) => p.severidad === "aviso");
  assert.ok(avisos.some((a) => a.mensaje.includes("más chica que la propia")));
});

test("validarEstricto lanza CatalogoInvalidoError ante un error", () => {
  const r = new ModuleRegistry().registrar(cap("x", { dependencias: [{ id: "falta" }] }));
  assert.throws(() => r.validarEstricto(), CatalogoInvalidoError);
});

test("validarEstricto no lanza por avisos", () => {
  const r = new ModuleRegistry().registrar(cap("p", { kind: "plugin" })); // avisa por superficie
  assert.doesNotThrow(() => r.validarEstricto());
});
