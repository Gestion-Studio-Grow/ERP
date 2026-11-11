// FC-01 · lógica pura de las pantallas de Plan de cuentas y Ejercicio. Datos sintéticos.

import { test } from "node:test";
import assert from "node:assert/strict";
import { cuentasParaRol, duracionValida, ejercicioSugerido, filasDelArbol, leerDia, mensajeResultado } from "./plan-vista";
import type { CuentaDelPlan } from "./repo-plan";

const c = (id: string, codigo: string, padreId: string | null, imputable: boolean, tipo = "ACTIVO", activa = true): CuentaDelPlan => ({
  id, codigo, nombre: id, tipo, padreId, imputable, activa, nombreDueno: null,
});

const PLAN = [
  c("activo", "1", null, false),
  c("corriente", "1.1", "activo", false),
  c("caja-y-bancos", "1.1.1", "corriente", false),
  c("caja", "1.1.1.01", "caja-y-bancos", true),
  c("banco-viejo", "1.1.1.02", "caja-y-bancos", true, "ACTIVO", false),
  c("pasivo", "2", null, false, "PASIVO"),
  c("proveedores", "2.1.1.01", "pasivo", true, "PASIVO"),
];

test("árbol: nivel por el código y sólo los agrupadores de detalle aceptan cuentas nuevas", () => {
  const filas = new Map(filasDelArbol(PLAN).map((f) => [f.cuenta.id, f]));
  assert.equal(filas.get("activo")!.nivel, 0);
  assert.equal(filas.get("caja")!.nivel, 3);
  assert.equal(filas.get("activo")!.aceptaHojas, false, "una gran rama no");
  assert.equal(filas.get("corriente")!.aceptaHojas, false, "agrupa otro agrupador");
  assert.equal(filas.get("caja-y-bancos")!.aceptaHojas, true);
  assert.equal(filas.get("caja")!.aceptaHojas, false, "una hoja no");
});

test("cuentas para un rol: de detalle, activas y del tipo del rol", () => {
  assert.deepEqual(cuentasParaRol(PLAN, "CAJA").map((x) => x.id), ["caja"]);
  assert.deepEqual(cuentasParaRol(PLAN, "PROVEEDORES").map((x) => x.id), ["proveedores"]);
});

test("resultado: sólo códigos conocidos, nunca texto de la URL", () => {
  assert.equal(mensajeResultado("hoja")?.tono, "exito");
  assert.equal(mensajeResultado("CUENTA_EN_USO")?.tono, "error");
  assert.equal(mensajeResultado("<script>"), null);
  assert.equal(mensajeResultado("toString"), null);
  assert.equal(mensajeResultado(undefined), null);
});

test("fechas: día exacto y ejercicio de hasta un año", () => {
  assert.equal(leerDia("2026-02-30"), null);
  assert.equal(leerDia("2026-2-3"), null);
  assert.equal(leerDia(null), null);
  assert.equal(leerDia("2026-07-01")!.toISOString(), "2026-07-01T00:00:00.000Z");
  assert.equal(duracionValida(leerDia("2026-01-01")!, leerDia("2026-12-31")!), true);
  assert.equal(duracionValida(leerDia("2026-07-01")!, leerDia("2026-12-31")!), true, "un primer ejercicio irregular");
  assert.equal(duracionValida(leerDia("2026-01-01")!, leerDia("2027-01-01")!), false);
  assert.equal(duracionValida(leerDia("2026-03-01")!, leerDia("2026-02-28")!), false);
});

test("ejercicio sugerido: el año calendario o el día siguiente al último cierre", () => {
  assert.deepEqual(ejercicioSugerido([], leerDia("2026-11-11")!), { inicio: "2026-01-01", cierre: "2026-12-31" });
  assert.deepEqual(
    ejercicioSugerido([{ fechaCierre: leerDia("2026-06-30")! }, { fechaCierre: leerDia("2025-06-30")! }], leerDia("2026-11-11")!),
    { inicio: "2026-07-01", cierre: "2027-06-30" },
  );
  assert.deepEqual(ejercicioSugerido([{ fechaCierre: leerDia("2028-02-28")! }], leerDia("2026-11-11")!), { inicio: "2028-02-29", cierre: "2029-02-28" });
});
