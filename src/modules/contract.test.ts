// Tests del contrato de módulo (validación pura + adaptador legado). node:test + tsx.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  type ModuleDescriptor,
  validarDescriptor,
  versionSatisface,
  majorDe,
  toLegacyPluginManifest,
} from "./contract";

const base: ModuleDescriptor = {
  id: "demo",
  version: "1.0.0",
  nombre: "Demo",
  descripcion: "Módulo de prueba.",
  kind: "capability",
  rubros: "todos",
};

const errores = (d: ModuleDescriptor) =>
  validarDescriptor(d).filter((p) => p.severidad === "error");
const avisos = (d: ModuleDescriptor) =>
  validarDescriptor(d).filter((p) => p.severidad === "aviso");

test("descriptor válido no tiene errores", () => {
  assert.equal(errores(base).length, 0);
});

test("id no kebab es error", () => {
  assert.ok(errores({ ...base, id: "Demo Módulo" }).length > 0);
  assert.ok(errores({ ...base, id: "-x" }).length > 0);
  assert.equal(errores({ ...base, id: "venta-por-peso" }).length, 0);
});

test("version no semver es error", () => {
  assert.ok(errores({ ...base, version: "1.0" }).length > 0);
  assert.ok(errores({ ...base, version: "v1.0.0" }).length > 0);
  assert.equal(errores({ ...base, version: "12.3.45" }).length, 0);
});

test("rubros lista vacía es error; lista válida no", () => {
  assert.ok(errores({ ...base, rubros: [] }).length > 0);
  assert.equal(errores({ ...base, rubros: ["servicios", "carniceria"] }).length, 0);
  assert.ok(errores({ ...base, rubros: ["Servicios"] }).length > 0); // no kebab
});

test("plugin sin superficie declarada da AVISO, no error", () => {
  const p: ModuleDescriptor = { ...base, kind: "plugin" };
  assert.equal(errores(p).length, 0);
  assert.ok(avisos(p).some((a) => a.mensaje.includes("superficie")));
});

test("plugin con evento o comando no avisa por superficie", () => {
  const p: ModuleDescriptor = { ...base, kind: "plugin", llamaComandos: ["X"] };
  assert.ok(!avisos(p).some((a) => a.mensaje.includes("superficie")));
});

test("auto-dependencia es error", () => {
  assert.ok(errores({ ...base, dependencias: [{ id: "demo" }] }).length > 0);
});

test("migración no aditiva es error", () => {
  const d = {
    ...base,
    migraciones: [{ carpeta: "x", descripcion: "y", aditiva: false }],
  } as unknown as ModuleDescriptor;
  assert.ok(errores(d).length > 0);
});

test("versionSatisface: rangos soportados", () => {
  assert.ok(versionSatisface("1.2.3", undefined));
  assert.ok(versionSatisface("1.2.3", "*"));
  assert.ok(versionSatisface("1.9.0", "^1.0"));
  assert.ok(versionSatisface("1.0.0", "1.x"));
  assert.ok(versionSatisface("1.5.5", "1"));
  assert.ok(!versionSatisface("2.0.0", "^1.0"));
  assert.ok(versionSatisface("1.2.3", "1.2.3"));
  assert.ok(!versionSatisface("1.2.4", "1.2.3"));
});

test("majorDe", () => {
  assert.equal(majorDe("3.4.5"), 3);
  assert.equal(majorDe("nope"), null);
});

test("toLegacyPluginManifest proyecta la forma legada", () => {
  const d: ModuleDescriptor = {
    ...base,
    kind: "plugin",
    consumeEventos: ["E"],
    llamaComandos: ["C"],
    configSchema: {
      token: { tipo: "string", secreto: true, requerido: true, descripcion: "tok" },
      modo: { tipo: "boolean", descripcion: "m" },
    },
  };
  const m = toLegacyPluginManifest(d);
  assert.equal(m.key, "demo");
  assert.deepEqual(m.consumeEventos, ["E"]);
  assert.deepEqual(m.llamaComandos, ["C"]);
  assert.equal(m.configSchema.token.secreto, true);
  // `requerido` no existe en el manifiesto legado: no se filtra.
  assert.ok(!("requerido" in m.configSchema.token));
  assert.ok(!("secreto" in m.configSchema.modo));
});
