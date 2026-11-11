// Fichas de scope items (FC-01): el descriptor ampliado y el módulo finanzas-control.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { problemasDeScopeItems } from "./scope-items";
import { finanzasControlModule } from "./descriptors/finanzas-control";
import { construirCatalogo } from "./catalog";

test("finanzas-control: 14 fichas FC-01..FC-14 coherentes y en el catálogo validado", () => {
  const items = finanzasControlModule.scopeItems!;
  assert.deepEqual(items.map((i) => i.codigo), Array.from({ length: 14 }, (_, n) => `FC-${String(n + 1).padStart(2, "0")}`));
  assert.deepEqual(problemasDeScopeItems(items), []);
  assert.ok(items.every((i) => i.referenciaSap && !i.ruta), "toda ficha con referencia SAP y sin ruta propia");
  assert.ok(construirCatalogo().tiene("finanzas-control"), "el catálogo estricto lo acepta");
});

test("finanzas-control: perfiles y guion de FC-01 según el catálogo", () => {
  const de = new Map(finanzasControlModule.scopeItems!.map((i) => [i.codigo, i]));
  for (const c of ["FC-03", "FC-08", "FC-09", "FC-13", "FC-14"]) assert.equal(de.get(c)!.perfilMin, "enterprise", c);
  assert.equal(de.get("FC-03")!.enLite, "Sólo exportar");
  assert.equal(de.get("FC-01")!.perfilMin, undefined, "FC-01 va en lite y enterprise");
  assert.ok(existsSync(de.get("FC-01")!.guion!), "el guion de FC-01 existe");
});

test("problemasDeScopeItems: repetidos, formato, dependencias inexistentes y ciclos", () => {
  assert.deepEqual(problemasDeScopeItems([{ label: "viejo" }, { label: "otro", ruta: "/admin/x" }]), [], "los módulos viejos pasan");
  const p = problemasDeScopeItems([
    { codigo: "FC-01", label: "a", dependencias: ["FC-02"] },
    { codigo: "FC-02", label: "b", dependencias: ["FC-01"] },
    { codigo: "FC-02", label: "c" },
    { codigo: "fc1", label: "d", dependencias: ["FC-99"] },
    { label: "e", referenciaSap: "J58" },
    { codigo: "FC-05", label: "f", enLite: "x" },
    { codigo: "FC-06", label: "g", guion: "../afuera.md" },
  ]);
  for (const esperado of ["FC-02: código repetido", "fc1: código con formato", "fc1: depende de FC-99", "\"e\": tiene ficha pero no código", "FC-05: \"enLite\"", "FC-06: guion", "dependencias en ciclo"]) {
    assert.ok(p.some((x) => x.startsWith(esperado)), `${esperado} en ${JSON.stringify(p)}`);
  }
});
