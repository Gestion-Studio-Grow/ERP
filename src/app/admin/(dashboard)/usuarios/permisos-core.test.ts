import { test } from "node:test";
import assert from "node:assert/strict";
import { roleHasCapability } from "@/lib/capabilities";
import { resumenDelRol, tablaDePermisos } from "./permisos-core";

test("en un mostrador hay dos columnas: Dueño/a y Mostrador, sin filas de agenda", () => {
  const t = tablaDePermisos(true);
  assert.deepEqual(t.roles.map((r) => r.nombre), ["Dueño/a", "Mostrador"]);
  assert.ok(t.filas.every((f) => !/agenda|turnos|espera|comisiones/i.test(f.texto)));
});

test("en un negocio de servicios aparecen Recepción y Profesional, y la agenda", () => {
  const t = tablaDePermisos(false);
  assert.deepEqual(t.roles.map((r) => r.nombre), ["Dueño/a", "Recepción", "Profesional"]);
  assert.ok(t.filas.some((f) => f.texto === "Dar turnos, moverlos y cancelarlos"));
});

test("el dueño puede todo lo de la tabla, sin matices", () => {
  for (const esMostrador of [true, false]) {
    const t = tablaDePermisos(esMostrador);
    assert.ok(t.filas.every((f) => f.celdas[0].puede && !f.celdas[0].matiz));
  }
});

test("el mostrador anula sólo lo de hoy y con motivo, y no ve costos ni reportes", () => {
  const t = tablaDePermisos(true);
  const fila = (texto: string) => t.filas.find((f) => f.texto === texto)!;
  assert.deepEqual(fila("Anular una venta").celdas[1], { puede: true, matiz: "Sólo lo de hoy, con motivo" });
  assert.equal(fila("Ver costos, compras y proveedores").celdas[1].puede, false);
  assert.equal(fila("Ver reportes y el resultado del mes").celdas[1].puede, false);
  assert.equal(fila("Recibir mercadería, contar y cargar mermas").celdas[1].puede, true);
});

test("el profesional ve y cobra sólo lo suyo y no da turnos", () => {
  const t = tablaDePermisos(false);
  const fila = (texto: string) => t.filas.find((f) => f.texto === texto)!;
  assert.deepEqual(fila("Cerrar y cobrar turnos").celdas[2], { puede: true, matiz: "Sólo lo suyo" });
  assert.equal(fila("Dar turnos, moverlos y cancelarlos").celdas[2].puede, false);
  assert.equal(fila("Vender y cobrar en el mostrador").celdas[2].puede, false);
});

test("cada celda dice lo mismo que el sistema de permisos", () => {
  for (const esMostrador of [true, false]) {
    const t = tablaDePermisos(esMostrador);
    for (const f of t.filas) {
      t.roles.forEach((r, i) => assert.equal(f.celdas[i].puede, roleHasCapability(r.valor, f.capacidad), `${r.nombre} · ${f.texto}`));
    }
  }
});

test("el resumen del rol para el alta sale de la misma tabla", () => {
  assert.equal(resumenDelRol("OWNER", true), "Todo, incluso precios, reportes y usuarios.");
  const mostrador = resumenDelRol("RECEPTION", true);
  assert.match(mostrador, /^vender y cobrar en el mostrador · anular una venta \(sólo lo de hoy, con motivo\)/);
  assert.doesNotMatch(mostrador, /costos|reportes/);
  assert.equal(resumenDelRol("PROFESSIONAL", true), "");
});
