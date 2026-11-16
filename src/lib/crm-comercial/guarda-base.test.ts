/**
 * Guarda de base de la prueba del CRM (GSG-CRM-011): pura, no conecta a nada. Por defecto Neon se rechaza; la base
 * publicada sólo con las dos llaves (`--produccion` y `CRM_PRUEBA_CONFIRMO_NEGOCIO` igual al `--negocio`).
 * URLs ficticias.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { guardaDeBase } from "./guarda-base";

const NEON = "postgresql://u:p@ep-ficticio-123.us-east-2.aws.neon.tech/neondb?sslmode=require";
const LOCAL = "postgresql://postgres@localhost:5433/x";

test("sin URL no se sabe a qué base ir; una base local pasa sin llaves", () => {
  assert.equal(guardaDeBase(undefined).ok, false);
  assert.equal(guardaDeBase("  ").ok, false);
  assert.equal(guardaDeBase(LOCAL).ok, true);
  assert.equal(guardaDeBase(LOCAL, { produccion: true }).ok, true, "la bandera no estorba en local");
});

test("Neon por defecto: rechazo (también con sólo una de las dos llaves)", () => {
  const sinNada = guardaDeBase(NEON);
  assert.equal(sinNada.ok, false);
  assert.match(sinNada.ok ? "" : sinNada.motivo, /Neon/);
  assert.equal(guardaDeBase(NEON.toUpperCase()).ok, false, "mayúsculas no esquivan la guarda");
  // Sólo la variable (quedó de otra corrida): no alcanza sin --produccion.
  assert.equal(guardaDeBase(NEON, { negocio: "negocio-demo", confirmo: "negocio-demo" }).ok, false);
  assert.equal(guardaDeBase(NEON, { produccion: false, negocio: "negocio-demo", confirmo: "negocio-demo" }).ok, false);
  // Sólo la bandera: falta la variable.
  const sinVariable = guardaDeBase(NEON, { produccion: true, negocio: "negocio-demo" });
  assert.equal(sinVariable.ok, false);
  assert.match(sinVariable.ok ? "" : sinVariable.motivo, /CRM_PRUEBA_CONFIRMO_NEGOCIO=negocio-demo/);
  assert.equal(guardaDeBase(NEON, { produccion: true, negocio: "negocio-demo", confirmo: "   " }).ok, false);
});

test("Neon con --produccion: la variable tiene que nombrar el MISMO negocio, y el negocio tiene que estar", () => {
  const otro = guardaDeBase(NEON, { produccion: true, negocio: "negocio-demo", confirmo: "otro-negocio" });
  assert.equal(otro.ok, false);
  assert.match(otro.ok ? "" : otro.motivo, /mismo negocio/);
  assert.equal(guardaDeBase(NEON, { produccion: true, negocio: "negocio-demo", confirmo: "negocio-dem" }).ok, false, "un prefijo no es el negocio");
  assert.equal(guardaDeBase(NEON, { produccion: true, negocio: "negocio-demo", confirmo: "Negocio-Demo" }).ok, false, "letra por letra");
  assert.equal(guardaDeBase(NEON, { produccion: true, confirmo: "negocio-demo" }).ok, false, "sin --negocio no se adivina");
  assert.equal(guardaDeBase(NEON, { produccion: true, negocio: "", confirmo: "" }).ok, false, "dos vacíos no son iguales");
  assert.deepEqual(guardaDeBase(NEON, { produccion: true, negocio: "negocio-demo", confirmo: "negocio-demo" }), { ok: true });
});
