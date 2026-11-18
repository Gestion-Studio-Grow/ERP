// A1 (DIR-007) · La matriz única de permisos de Proyectos, fijada por test (GSG-MIA-091, criterio P1 de GSG-MIA-088).
// Si alguien cambia lo de fábrica, este test se pone rojo y la tabla del PR (docs/qa/mia-088/registro.md) se rehace.
// Preguntas del plan, provisionales a confirmar por el dueño: 1-A (la matriz la cambia sólo Dirección) y 2-A (el módulo
// `direccion` decide Rentabilidad y Configuración). Dirección es la misma fila para una persona y para un agente: ningún
// permiso pregunta si quien actúa es un agente.
import { test } from "node:test";
import assert from "node:assert/strict";
import { cambiaLosPermisos, matrizDePermisos, type RolGestion } from "./gestion-core";

const E = "editar", V = "ver", N = "sin acceso";
const OCULTAS_DE_COSTO = ["costoUnit", "costoTotal", "recargo", "margen"];

// Columnas: pipeline, ficha, costos, proveedores, cotizaciones, diseno, pagos, empresa, liquidaciones, direccion, equipo, ia, rendiciones.
const MODULOS = ["pipeline", "ficha", "costos", "proveedores", "cotizaciones", "diseno", "pagos", "empresa", "liquidaciones", "direccion", "equipo", "ia", "rendiciones"] as const;
const FABRICA: Record<RolGestion, { niveles: string[]; ocultas: string[]; laCambia: string }> = {
  DIRECCION: { niveles: [E, E, E, E, E, E, E, E, E, E, E, E, E], ocultas: [], laCambia: "nadie (fija)" },
  ADMINISTRACION: { niveles: [V, V, V, E, V, N, E, E, E, N, N, N, E], ocultas: [], laCambia: "Dirección" },
  COMERCIAL: { niveles: [E, V, N, N, E, E, N, N, N, N, N, E, V], ocultas: OCULTAS_DE_COSTO, laCambia: "Dirección" },
  DISENO: { niveles: [V, V, N, N, V, E, N, N, N, N, N, E, N], ocultas: OCULTAS_DE_COSTO, laCambia: "Dirección" },
  PRODUCCION: { niveles: [E, E, E, E, E, E, E, N, N, N, N, E, V], ocultas: [], laCambia: "Dirección" },
  SIN_FICHA: { niveles: [N, N, N, N, N, N, N, N, N, N, N, N, N], ocultas: OCULTAS_DE_COSTO, laCambia: "nadie (fija)" },
};

test("A1 · la matriz de fábrica, rol por rol y módulo por módulo, con quién cambia cada fila", () => {
  const m = matrizDePermisos([]);
  assert.deepEqual(m.map((f) => f.rol), ["DIRECCION", "ADMINISTRACION", "COMERCIAL", "DISENO", "PRODUCCION", "SIN_FICHA"]);
  for (const f of m) {
    const esperado = FABRICA[f.rol];
    assert.deepEqual(Object.keys(f.modulos), [...MODULOS], `${f.rol}: los 13 módulos, en orden`);
    assert.deepEqual(Object.values(f.modulos), esperado.niveles, `${f.rol}: niveles de fábrica`);
    assert.deepEqual(f.columnasOcultas, esperado.ocultas, `${f.rol}: columnas ocultas`);
    assert.equal(f.laCambia, esperado.laCambia, `${f.rol}: quién la cambia`);
  }
});

test("A1 · lo guardado por Dirección pisa lo de fábrica, salvo en Dirección, que es fija", () => {
  const m = matrizDePermisos([
    { rol: "COMERCIAL", modulo: "direccion", ver: true, editar: false },
    { rol: "DIRECCION", modulo: "empresa", ver: false, editar: false },
    { rol: "DISENO", modulo: "ficha", ver: true, editar: false, columnasOcultas: ["margen"] },
  ]);
  const fila = (rol: RolGestion) => m.find((f) => f.rol === rol)!;
  assert.equal(fila("COMERCIAL").modulos.direccion, V);
  assert.equal(fila("DIRECCION").modulos.empresa, E, "Dirección no se baja ni con una fila guardada");
  assert.deepEqual(fila("DISENO").columnasOcultas, ["margen"]);
});

test("A1 · quién cambia la matriz (1-A) y quién abre Rentabilidad y Configuración (2-A), leído de la matriz", () => {
  // 1-A: sólo Dirección. Administración con «Equipo» en editar carga personas, no permisos.
  assert.deepEqual(matrizDePermisos([]).filter((f) => f.laCambia === "nadie (fija)").map((f) => f.rol), ["DIRECCION", "SIN_FICHA"]);
  assert.deepEqual((["DIRECCION", "ADMINISTRACION", "COMERCIAL", "DISENO", "PRODUCCION", "SIN_FICHA"] as const).filter(cambiaLosPermisos), ["DIRECCION"]);
  // 2-A: el módulo `direccion` decide; de fábrica sólo Dirección lo tiene.
  assert.deepEqual(matrizDePermisos([]).filter((f) => f.modulos.direccion !== "sin acceso").map((f) => f.rol), ["DIRECCION"]);
});
