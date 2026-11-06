import { test } from "node:test";
import assert from "node:assert/strict";
import {
  habilitadosRealDesdeEnv,
  modoDelNegocio,
  slugHabilitadoReal,
  type DatosDelModo,
} from "./modo-del-negocio";

const PROD = { entorno: "produccion" as const };
const HOMO = { entorno: "homologacion" as const };
const RARO = { entorno: "desconocido" as const };
const base: DatosDelModo = { techo: "real", arcaHomologacion: false, slug: "almacen", habilitadosReal: ["almacen"], credencial: PROD };
const modo = (d: Partial<DatosDelModo>) => modoDelNegocio({ ...base, ...d });
const error = (d: Partial<DatosDelModo>): string => {
  const r = modo(d);
  assert.ok("error" in r, `esperaba error: ${JSON.stringify(r)}`);
  return r.error;
};

test("ARCA_REAL_TENANTS: lista por coma, sin espacios ni mayúsculas; vacía si no está", () => {
  assert.deepEqual(habilitadosRealDesdeEnv({}), []);
  assert.deepEqual(habilitadosRealDesdeEnv({ ARCA_REAL_TENANTS: " Almacen-Pepe, ,kiosco " }), ["almacen-pepe", "kiosco"]);
  assert.equal(slugHabilitadoReal("ALMACEN-PEPE", ["almacen-pepe"]), true);
  assert.equal(slugHabilitadoReal("", [""]), false);
  assert.equal(slugHabilitadoReal(null, ["x"]), false);
  assert.equal(slugHabilitadoReal("almacen", ["almacen-pepe"]), false, "sin coincidencias parciales");
});

test("techo stub → stub siempre (ni la marca ni el certificado importan)", () => {
  for (const arcaHomologacion of [true, false]) {
    for (const credencial of [null, PROD, HOMO]) {
      assert.deepEqual(modo({ techo: "stub", arcaHomologacion, credencial, habilitadosReal: [] }), { modo: "stub" });
    }
  }
});

test("negocio en pruebas: sin certificado → stub; con certificado → homologación (en techo homologación y real)", () => {
  for (const techo of ["homologacion", "real"] as const) {
    assert.deepEqual(modo({ techo, arcaHomologacion: true, credencial: null }), { modo: "stub" });
    assert.deepEqual(modo({ techo, arcaHomologacion: true, credencial: HOMO }), { modo: "homologacion" });
    assert.deepEqual(modo({ techo, arcaHomologacion: true, credencial: PROD }), { modo: "homologacion" }, "estar en la lista no fuerza real");
  }
});

test("real sólo con las cuatro llaves: techo real, marcado real, en la lista y cert de producción", () => {
  assert.deepEqual(modo({}), { modo: "real" });
});

test("techo homologación: un negocio marcado real es error (nadie es real), aunque tenga todo", () => {
  assert.match(error({ techo: "homologacion" }), /plataforma está en pruebas \(ARCA_MODO=homologacion\)/);
  assert.match(error({ techo: "homologacion", credencial: null }), /plataforma está en pruebas/);
});

test("marcado real con techo real: cada llave que falta se nombra (falla cerrada, nunca cae a pruebas ni a stub)", () => {
  assert.match(error({ habilitadosReal: [] }), /«almacen».*ARCA_REAL_TENANTS/);
  assert.match(error({ slug: null }), /sin nombre/);
  assert.match(error({ credencial: null }), /certificado de producción de ARCA cargado/);
  assert.match(error({ credencial: HOMO }), /el cargado es de pruebas/);
  assert.match(error({ credencial: RARO }), /confirmar como de producción/);
  const todo = error({ habilitadosReal: [], credencial: null });
  assert.match(todo, /ARCA_REAL_TENANTS/);
  assert.match(todo, /certificado/);
});
