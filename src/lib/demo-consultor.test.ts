import { test } from "node:test";
import assert from "node:assert/strict";

// El CONSULTOR es un mapeo determinista rubro→blueprint→familia→config, sin IA ni
// DB. Estos tests verifican que clasifica bien las familias que importan para este
// incremento (Agenda&Servicios y Retail/Mostrador), que reusa la taxonomía de
// blueprints existente y que el default de entorno cae al rubro piloto.
import {
  recommendForRubro,
  familyForBlueprint,
  activeDemoRubro,
  activeDemoRecommendation,
  DEFAULT_DEMO_RUBRO,
} from "./demo-consultor";

test("recommendForRubro(estetica): familia Agenda&Servicios, pantalla agenda", () => {
  const rec = recommendForRubro("estetica");
  assert.equal(rec.family, "agenda-servicios");
  assert.equal(rec.blueprintId, "estetica");
  assert.equal(rec.matchedRubro, true);
  assert.equal(rec.primaryScreen, "agenda");
  assert.equal(rec.itemKind, "servicio");
  assert.ok(rec.modules.includes("agenda"));
  assert.ok(rec.reports.includes("panelDueno"));
});

test("recommendForRubro(carnicería): familia Retail/Mostrador, pantalla vidriera", () => {
  const rec = recommendForRubro("carnicería"); // con acento — se normaliza
  assert.equal(rec.family, "retail-mostrador");
  assert.equal(rec.blueprintId, "carniceria");
  assert.equal(rec.matchedRubro, true);
  assert.equal(rec.primaryScreen, "vidriera");
  assert.equal(rec.itemKind, "producto");
  assert.ok(rec.modules.includes("pos"));
  assert.ok(!rec.modules.includes("agenda")); // el mostrador no usa agenda
});

test("recommendForRubro(rubro no modelado): cae al comodín genérico, justificado", () => {
  const rec = recommendForRubro("taller de robótica cuántica");
  assert.equal(rec.family, "generico");
  assert.equal(rec.matchedRubro, false); // se justifica que cayó al comodín
  assert.ok(rec.modules.length > 0);
});

test("familyForBlueprint: agrupa los ids de blueprint por familia", () => {
  assert.equal(familyForBlueprint("peluqueria"), "agenda-servicios");
  assert.equal(familyForBlueprint("servicios"), "agenda-servicios"); // default del ERP
  assert.equal(familyForBlueprint("verduleria"), "retail-mostrador");
  assert.equal(familyForBlueprint("restaurante"), "gastronomia");
  assert.equal(familyForBlueprint("plomeria"), "servicios-oficios");
  assert.equal(familyForBlueprint("generico"), "generico");
});

test("activeDemoRubro: default al rubro piloto sin DEMO_RUBRO seteado", () => {
  const prev = process.env.DEMO_RUBRO;
  delete process.env.DEMO_RUBRO;
  assert.equal(activeDemoRubro(), DEFAULT_DEMO_RUBRO);
  assert.equal(activeDemoRecommendation().family, "agenda-servicios");
  if (prev !== undefined) process.env.DEMO_RUBRO = prev;
});

test("activeDemoRubro: respeta DEMO_RUBRO del deploy de demo", () => {
  const prev = process.env.DEMO_RUBRO;
  process.env.DEMO_RUBRO = "carniceria";
  assert.equal(activeDemoRubro(), "carniceria");
  assert.equal(activeDemoRecommendation().family, "retail-mostrador");
  if (prev === undefined) delete process.env.DEMO_RUBRO;
  else process.env.DEMO_RUBRO = prev;
});
