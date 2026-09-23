// Movimientos de un producto: los filtros que llegan por URL y quién hizo cada movimiento.

import { test } from "node:test";
import assert from "node:assert/strict";
import { ANULACION_VENTA_ACTOR_PREFIX, EDICION_ACTOR_PREFIX } from "@/lib/order-anulacion";
import { TRASLADO_ACTOR_PREFIX } from "@/lib/multilocal/traslado-core";
import { hrefMovimientos, leerFiltros, nombreDelTipo, quienHizo, usuarioDe } from "./movimientos";

test("filtros: sólo tipos y días que existen; un rango al revés se da vuelta", () => {
  assert.deepEqual(leerFiltros({ producto: "cmx123", tipo: "venta", desde: "2026-09-20", hasta: "2026-09-01" }), {
    producto: "cmx123",
    tipo: "VENTA",
    desde: "2026-09-01",
    hasta: "2026-09-20",
  });
  assert.deepEqual(leerFiltros({ tipo: "TRASPASO", desde: "2026-02-30", hasta: "ayer" }), {
    producto: null,
    tipo: null,
    desde: null,
    hasta: null,
  });
  assert.equal(leerFiltros({ producto: "'; drop" }).producto, null, "un id raro no llega a la consulta");
  assert.equal(leerFiltros({ producto: ["a1", "b2"] }).producto, "a1");
});

test("el enlace de vuelta lleva sólo los filtros que hay", () => {
  assert.equal(hrefMovimientos({}), "/admin/inventario/movimientos");
  assert.equal(hrefMovimientos({ producto: "p1", tipo: "AJUSTE" }), "/admin/inventario/movimientos?producto=p1&tipo=AJUSTE");
});

test("quién: el nombre del usuario, el sistema, o la anulación/edición con su responsable", () => {
  const nombres = new Map([["u1", "Carla"]]);
  assert.equal(usuarioDe("user:u1"), "u1");
  assert.equal(usuarioDe("system"), null);
  assert.equal(usuarioDe("user"), null, "el 'user' pelado del despiece no es un usuario");
  assert.equal(quienHizo("user:u1", nombres), "Carla");
  assert.equal(quienHizo("system", nombres), "el sistema");
  assert.equal(quienHizo("user:u9", nombres), "un usuario dado de baja");
  assert.equal(quienHizo(`${ANULACION_VENTA_ACTOR_PREFIX}user:u1`, nombres), "Carla (anulación de venta)");
  assert.equal(quienHizo(`${EDICION_ACTOR_PREFIX}user:u1`, nombres), "Carla (pedido reajustado)");
  // Un traslado lo firma la casa: en el local ese usuario no existe, y no fue "el sistema".
  assert.equal(quienHizo(`${TRASLADO_ACTOR_PREFIX}user:u1`, nombres), "traslado de la casa");
  assert.equal(nombreDelTipo("DEVOLUCION_PROVEEDOR"), "Devolución a proveedor");
});
