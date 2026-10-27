// La barra de abajo del profe: qué lugar se marca para cada ruta (M-046).

import { test } from "node:test";
import assert from "node:assert/strict";
import { ITEMS_BARRA, itemActivo, textoBadge } from "./_navegacion";

test("cinco lugares, en el orden del pulgar: Hoy · Semana · ＋ · Alumnos · Plata", () => {
  assert.deepEqual(ITEMS_BARRA.map((i) => i.id), ["hoy", "semana", "agendar", "alumnos", "plata"]);
  assert.equal(ITEMS_BARRA[2].href, "/admin/clases/agendar");
});

test("itemActivo marca la sección de la ruta", () => {
  assert.equal(itemActivo("/admin/clases"), "hoy");
  assert.equal(itemActivo("/admin/clases/"), "hoy");
  assert.equal(itemActivo("/admin/clases?x=1"), "hoy");
  assert.equal(itemActivo("/admin/clases/semana"), "semana");
  assert.equal(itemActivo("/admin/clases/semana?desde=2026-10-20"), "semana");
  assert.equal(itemActivo("/admin/clases/agendar"), "agendar");
  assert.equal(itemActivo("/admin/clases/alumnos"), "alumnos");
  assert.equal(itemActivo("/admin/clases/alumnos/abc123"), "alumnos");
  assert.equal(itemActivo("/admin/clases/plata#mes"), "plata");
});

test("la campana, los ajustes y lo de afuera no marcan ningún lugar", () => {
  assert.equal(itemActivo("/admin/clases/pendientes"), null);
  assert.equal(itemActivo("/admin/clases/config"), null);
  assert.equal(itemActivo("/admin/clases/config/horarios"), null);
  assert.equal(itemActivo("/admin/clasesx"), null);
  assert.equal(itemActivo("/admin/clases-viejas/semana"), null);
  assert.equal(itemActivo("/admin"), null);
  assert.equal(itemActivo(""), null);
  assert.equal(itemActivo(null), null);
});

test("el globito de pendientes", () => {
  assert.equal(textoBadge(0), null);
  assert.equal(textoBadge(-2), null);
  assert.equal(textoBadge(Number.NaN), null);
  assert.equal(textoBadge(3), "3");
  assert.equal(textoBadge(140), "99+");
});
