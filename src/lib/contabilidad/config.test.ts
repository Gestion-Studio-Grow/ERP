// Configuración del módulo (T0): nivel Pyme/Corporativo, capacidades, estado del módulo y rubro sugerido.

import { test } from "node:test";
import assert from "node:assert/strict";
import { CAPACIDADES_CONTABLES, ETIQUETA_NIVEL, capacidadesDesde, estadoModuloContable, nivelDesde, rubroContableSugerido } from "./config";

test("nivel: PYME por defecto; «Corporativo» es el nombre de la versión grande", () => {
  assert.equal(nivelDesde(undefined), "PYME");
  assert.equal(nivelDesde("EMPRESA"), "PYME", "Empresa es el perfil del ERP, no un nivel del módulo");
  assert.equal(nivelDesde("CORPORATIVO"), "CORPORATIVO");
  assert.equal(ETIQUETA_NIVEL.CORPORATIVO, "Control de gestión · Corporativo");
  assert.equal(ETIQUETA_NIVEL.PYME, "Control de gestión · Pyme");
});

test("capacidades: sólo `true` literal de una clave conocida prende", () => {
  const todasApagadas = Object.fromEntries(CAPACIDADES_CONTABLES.map((c) => [c, false]));
  for (const raro of [null, undefined, "x", 3, [], ["jerarquia"]]) assert.deepEqual(capacidadesDesde(raro), todasApagadas);
  const c = capacidadesDesde({ jerarquia: true, multimoneda: "true", api: 1, inventada: true });
  assert.equal(c.jerarquia, true);
  assert.equal(c.multimoneda, false);
  assert.equal(c.api, false);
  assert.equal("inventada" in c, false);
});

test("estado del módulo: apagado no muestra nada; prendido sin migración avisa; prendido y migrado anda", () => {
  assert.equal(estadoModuloContable({ prendido: false, migracionAplicada: true }), "OCULTO");
  assert.equal(estadoModuloContable({ prendido: false, migracionAplicada: false }), "OCULTO");
  assert.equal(estadoModuloContable({ prendido: true, migracionAplicada: false }), "MIGRACION_PENDIENTE");
  assert.equal(estadoModuloContable({ prendido: true, migracionAplicada: true }), "LISTO");
});

test("rubro sugerido: adosmanos es comercio; blueprint servicios → servicios; desconocido → null", () => {
  assert.equal(rubroContableSugerido({ slug: "adosmanos", blueprintId: "servicios" }), "comercio");
  assert.equal(rubroContableSugerido({ slug: "beauty-spa", blueprintId: "servicios" }), "servicios");
  assert.equal(rubroContableSugerido({ slug: "carniceria-x", blueprintId: "carniceria" }), "comercio");
  assert.equal(rubroContableSugerido({ slug: "otro", blueprintId: "generico" }), null);
  assert.equal(rubroContableSugerido({ slug: "otro" }), null);
});
