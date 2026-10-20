import { test } from "node:test";
import assert from "node:assert/strict";
import { armarTira } from "./tira-de-solapas-core";

const s = (...ids: string[]) => ids.map((id) => ({ id }));
const ids = (xs: { id: string }[]) => xs.map((x) => x.id);

test("dueño: Tablero primero, 5 a la vista y el resto en «Más», como el club de hoy", () => {
  const t = armarTira(s("agenda", "fijos", "canchas", "buffet", "tienda", "caja", "clientes", "tablero", "stock", "proveedores", "novedades", "configuracion"), "agenda");
  assert.deepEqual(ids(t.principales), ["tablero", "agenda", "buffet", "caja", "clientes"]);
  assert.deepEqual(ids(t.mas), ["fijos", "canchas", "tienda", "stock", "proveedores", "novedades", "configuracion"]);
  assert.equal(t.elegidaDeMas, null);
});

test("la elegida desde «Más» queda a la vista y sale del menú", () => {
  const t = armarTira(s("agenda", "buffet", "caja", "clientes", "tablero", "stock", "configuracion"), "configuracion");
  assert.equal(t.elegidaDeMas?.id, "configuracion");
  assert.deepEqual(ids(t.mas), ["stock"]);
});

test("con una sola de más no hay menú: se ven todas", () => {
  const t = armarTira(s("agenda", "fijos", "canchas", "buffet", "tienda", "caja"), "agenda");
  assert.equal(t.mas.length, 0);
  assert.equal(t.principales.length, 6);
});
