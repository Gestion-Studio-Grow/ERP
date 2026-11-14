// Ficha técnica de color (paquete Peluquerías, T4): reglas puras + cableado que no se corre sin base.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { esMigracionPendiente, rubroConFichaDeColor, validarFichaColor } from "./ficha-color-core";

test("sólo peluquería y barbería ven la ficha de color", () => {
  assert.equal(rubroConFichaDeColor("peluqueria"), true);
  assert.equal(rubroConFichaDeColor("barberia"), true);
});

test("no-cambio CH: blueprint null (y cualquier otro rubro) no ve la ficha de color", () => {
  for (const b of [null, undefined, "", "estetica", "facturita", "servicios", "veterinaria", "consultorio", "PELUQUERIA"]) {
    assert.equal(rubroConFichaDeColor(b), false, String(b));
  }
});

const BASE = { tono: " 7.1 rubio ceniza ", formula: "30 g 7.1 + 10 g 8.0", oxidante: "20", tiempoPose: "35", profesional: "Leo", notas: "" };

test("una ficha válida se normaliza: recorta espacios y vacíos a null", () => {
  const r = validarFichaColor(BASE);
  assert.deepEqual(r, {
    ok: true,
    datos: { tono: "7.1 rubio ceniza", formula: "30 g 7.1 + 10 g 8.0", oxidante: 20, tiempoPose: 35, profesional: "Leo", notas: null },
  });
  const minima = validarFichaColor({ tono: "5", formula: "x" });
  assert.ok(minima.ok && minima.datos.oxidante === null && minima.datos.tiempoPose === null);
});

test("tono y fórmula son obligatorios", () => {
  assert.equal(validarFichaColor({ ...BASE, tono: "  " }).ok, false);
  assert.equal(validarFichaColor({ ...BASE, formula: "" }).ok, false);
});

test("oxidante sólo 10/20/30/40 y pose de 1 a 240 (mismo CHECK que la base)", () => {
  for (const ox of ["15", "0", "-20", "20.5", "abc", "50"]) assert.equal(validarFichaColor({ ...BASE, oxidante: ox }).ok, false, ox);
  for (const t of ["0", "241", "-5", "3.5", "x"]) assert.equal(validarFichaColor({ ...BASE, tiempoPose: t }).ok, false, t);
  assert.equal(validarFichaColor({ ...BASE, oxidante: "40", tiempoPose: "240" }).ok, true);
});

test("topes de largo", () => {
  assert.equal(validarFichaColor({ ...BASE, tono: "a".repeat(81) }).ok, false);
  assert.equal(validarFichaColor({ ...BASE, formula: "a".repeat(501) }).ok, false);
  assert.equal(validarFichaColor({ ...BASE, notas: "a".repeat(501) }).ok, false);
});

test("campos extra (p. ej. alergias) se ignoran: no llegan a los datos", () => {
  const r = validarFichaColor({ ...BASE, alergias: "x", salud: "y", tenantId: "otro", clientId: "otra" });
  assert.ok(r.ok);
  assert.deepEqual(Object.keys(r.datos).sort(), ["formula", "notas", "oxidante", "profesional", "tiempoPose", "tono"]);
});

test("migración pendiente: P2021, P2022 y 42P01; otro error no", () => {
  assert.equal(esMigracionPendiente({ code: "P2021" }), true);
  assert.equal(esMigracionPendiente({ code: "P2022" }), true);
  assert.equal(esMigracionPendiente({ code: "P2010", meta: { code: "42P01" } }), true);
  assert.equal(esMigracionPendiente({ code: "P2002" }), false);
  assert.equal(esMigracionPendiente(null), false);
});

// ── Forma: lo que no se puede correr sin base ────────────────────────────────
const leer = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

test("el modelo FichaColor no tiene campos de salud ni alergias", () => {
  const schema = leer("../../../prisma/schema.prisma");
  const i = schema.indexOf("model FichaColor {");
  assert.ok(i !== -1);
  const cuerpo = schema.slice(i, schema.indexOf("\n}", i));
  assert.doesNotMatch(cuerpo.replace(/\/\/.*$/gm, ""), /alerg|salud|medic|embaraz|patolog/i);
});

test("la migración es aditiva y trae RLS con tenant_isolation", () => {
  const sql = leer("../../../prisma/migrations/20261110120000_ficha_color/migration.sql").replace(/--.*$/gm, "");
  assert.doesNotMatch(sql, /\bDROP\s+(TABLE|COLUMN)\b|ALTER\s+TABLE\s+"(?!FichaColor")/i);
  assert.match(sql, /ALTER TABLE "FichaColor" ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /CREATE POLICY tenant_isolation ON "FichaColor"/);
});

test("el alta exige clients:manage, filtra por tenantId y verifica que la clienta sea del negocio", () => {
  const src = leer("./ficha-color-actions.ts");
  assert.match(src, /requireCapability\("clients:manage"\)/);
  assert.match(src, /tx\.client\.findFirst\(\{ where: \{ id: clientId, tenantId \}/);
  assert.match(src, /rubroConFichaDeColor\(marca\.blueprintId\)/);
  const lectura = leer("./ficha-color.server.ts");
  assert.match(lectura, /where: \{ tenantId, clientId \}/);
  assert.match(lectura, /if \(!rubroConFichaDeColor\(marca\.blueprintId\)\) return \{ estado: "apagado" \}/);
});
