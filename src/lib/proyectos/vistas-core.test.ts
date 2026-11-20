// Vistas guardadas (MIA T03, O46): columnas, filtros, agrupación y orden; el permiso del rol se aplica al leer.

import { test } from "node:test";
import assert from "node:assert/strict";
import { agrupar, columnasDeLaVista, ordenAplicable, proyectarLiquidacion, type FilaLiquidacion, normalizarVista, ordenar, pasaFiltros, proyectarFila, vistasDelSistema, vistasVisibles, FILTROS_BASE, type FilaCuenta } from "./vistas-core";

const hoy = new Date("2026-11-17T12:00:00Z");
const dia = (n: number) => new Date(hoy.getTime() + n * 86_400_000);
const fila = (o: Partial<FilaCuenta>): FilaCuenta => ({ id: "c1", vence: dia(3), evento: "EV-1 Stand", contraparte: "Proveedor Z (ficticio)", concepto: "Anticipo", monto: 1000, moneda: "ARS", enPesos: 1000, factura: null, estado: "PENDIENTE", deEmpresa: false, comentario: null, ...o });

test("C-O46: con «costo» oculto, una vista que pide el monto de A pagar no lo trae; en A cobrar sí", () => {
  const pide = { columnas: ["evento", "monto", "enPesos", "concepto"] };
  const ocultas = ["costoUnit", "costoTotal", "recargo", "margen"];
  const pagar = columnasDeLaVista("a-pagar", pide, ocultas).map((c) => c.id);
  assert.deepEqual(pagar, ["vence", "evento", "concepto", "accion"]);
  const proyectada = proyectarFila(fila({}), columnasDeLaVista("a-pagar", pide, ocultas));
  assert.equal("monto" in proyectada, false);
  assert.equal("enPesos" in proyectada, false);
  assert.equal("moneda" in proyectada, false);
  assert.deepEqual(Object.keys(proyectada).sort(), ["concepto", "evento", "id", "vence"]);
  // Sin la columna oculta, el monto sí viaja.
  assert.deepEqual(columnasDeLaVista("a-pagar", pide, []).map((c) => c.id), ["vence", "evento", "concepto", "monto", "enPesos", "accion"]);
  assert.ok("monto" in proyectarFila(fila({}), columnasDeLaVista("a-cobrar", pide, ocultas)));
});

test("una vista guardada se valida: columnas que existen, siempre con las fijas, filtros y orden conocidos", () => {
  assert.equal(normalizarVista("a-pagar", { columnas: ["costoSecreto"] }).ok, false);
  assert.equal(normalizarVista("a-pagar", { columnas: [] }).ok, false);
  assert.equal(normalizarVista("a-pagar", { columnas: ["concepto"], agrupacion: "por-color" }).ok, false);
  assert.equal(normalizarVista("a-pagar", { columnas: ["concepto"], orden: "azar" }).ok, false);
  const n = normalizarVista("a-pagar", { columnas: ["comentario", "concepto"], filtros: { estado: "vencidos", venceEnDias: "7", moneda: "XXX" }, agrupacion: "mes" });
  assert.equal(n.ok, true);
  if (n.ok) {
    assert.deepEqual(n.vista.columnas, ["vence", "concepto", "accion", "comentario"]);
    assert.deepEqual(n.vista.filtros, { ...FILTROS_BASE, estado: "vencidos", venceEnDias: 7 });
    assert.equal(n.vista.orden, "vence:asc");
  }
  for (const l of ["a-cobrar", "a-pagar"] as const) for (const v of vistasDelSistema(l)) assert.equal(normalizarVista(l, v).ok, true);
});

test("una vista personal no la ve otro usuario; la de un rol, sólo ese rol", () => {
  const guardadas = [
    { id: "1", alcance: "PERSONA", propietario: "u-ana" },
    { id: "2", alcance: "PERSONA", propietario: "u-beto" },
    { id: "3", alcance: "ROL", propietario: "ADMINISTRACION" },
    { id: "4", alcance: "ROL", propietario: "COMERCIAL" },
  ];
  assert.deepEqual(vistasVisibles(guardadas, "u-ana", "ADMINISTRACION").map((v) => v.id), ["1", "3"]);
  assert.deepEqual(vistasVisibles(guardadas, "u-beto", "COMERCIAL").map((v) => v.id), ["2", "4"]);
});

test("filtros, orden y agrupación", () => {
  const filas = [
    fila({ id: "a", vence: dia(10), contraparte: "Beta", enPesos: 500, estado: "PENDIENTE" }),
    fila({ id: "b", vence: dia(-2), contraparte: "alfa", enPesos: 900, estado: "VENCIDA", evento: null, deEmpresa: true }),
    fila({ id: "c", vence: dia(1), contraparte: "Gama", enPesos: 100, estado: "PAGADA", moneda: "USD" }),
  ];
  const ids = (xs: readonly FilaCuenta[]) => xs.map((x) => x.id);
  assert.deepEqual(ids(filas.filter((f) => pasaFiltros(f, FILTROS_BASE, hoy))), ["a", "b"]);
  assert.deepEqual(ids(filas.filter((f) => pasaFiltros(f, { ...FILTROS_BASE, venceEnDias: 7 }, hoy))), ["b"], "vence esta semana, con lo vencido");
  assert.deepEqual(ids(filas.filter((f) => pasaFiltros(f, { ...FILTROS_BASE, estado: "todos", origen: "empresa" }, hoy))), ["b"]);
  assert.deepEqual(ids(filas.filter((f) => pasaFiltros(f, { ...FILTROS_BASE, estado: "pagados", moneda: "USD" }, hoy))), ["c"]);
  assert.deepEqual(ids(ordenar(filas, "vence:asc")), ["b", "c", "a"]);
  assert.deepEqual(ids(ordenar(filas, "monto:desc")), ["b", "a", "c"]);
  assert.deepEqual(ids(ordenar(filas, "contraparte:asc")), ["b", "a", "c"]);
  assert.deepEqual(agrupar(ordenar(filas, "vence:asc"), "estado").map((g) => [g.titulo, ids(g.filas)]), [["Vencidas", ["b"]], ["Pagadas", ["c"]], ["Pendientes", ["a"]]]);
  assert.deepEqual(agrupar(filas, "evento").map((g) => g.titulo), ["EV-1 Stand", "Empresa"]);
  assert.deepEqual(agrupar(filas, "").length, 1);
});

test("T12 · C-O46 · liquidaciones: con «costo» oculto la vista no trae base, extras ni total, ni en las acciones, ni ordena por total", () => {
  const ocultas = ["costoUnit", "costoTotal", "recargo", "margen"];
  const pide = { columnas: ["facturaA", "base", "extras", "total", "estado"] };
  const cols = columnasDeLaVista("liquidaciones", pide, ocultas);
  assert.deepEqual(cols.map((c) => c.id), ["persona", "facturaA", "estado", "accion"]);
  const l: FilaLiquidacion = { id: "l1", persona: "Productora (ficticia)", puesto: null, personaId: "p1", userId: "u1", facturaA: "MIA", base: 777_001, extras: [{ nombre: "Plus", monto: 33_003, manual: true }], total: 810_004, estado: "PUBLICADA", publicadaEl: null, vistaEl: null };
  const sale = proyectarLiquidacion(l, cols, false);
  assert.doesNotMatch(JSON.stringify(sale), /777001|33003|810004/, "ningún importe viaja");
  assert.equal(ordenAplicable("liquidaciones", "monto:desc", ocultas), "contraparte:asc", "ordenar por total dejaría adivinarlo");
  assert.equal(ordenAplicable("a-pagar", "monto:desc", ocultas), "vence:asc");
  assert.equal(ordenAplicable("a-cobrar", "monto:desc", ocultas), "monto:desc");
  // Sin la columna oculta, sí.
  assert.deepEqual(columnasDeLaVista("liquidaciones", pide, []).map((c) => c.id), ["persona", "facturaA", "base", "extras", "total", "estado", "accion"]);
  assert.match(JSON.stringify(proyectarLiquidacion(l, columnasDeLaVista("liquidaciones", pide, []), true)), /810004/);
  for (const v of vistasDelSistema("liquidaciones")) assert.equal(normalizarVista("liquidaciones", v).ok, true);
});
