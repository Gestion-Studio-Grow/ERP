// «Cierre del mes» en la barra del dueño con tienda (QA 26/09 vuelta 4 y refutador): se ejecuta la
// decisión con los descriptores REALES del registro y la barra real que arma proyectarMenuDeHoy.

import { test } from "node:test";
import assert from "node:assert/strict";
import { REGISTRO_APPS } from "./registro";
import { conCierreDelMesEnLaBarra, proyectarMenuDeHoy } from "./visibles";

const deIds = (ids: readonly string[]) => REGISTRO_APPS.filter((a) => ids.includes(a.id));
const DUENIO = ["caja-del-dia", "cierre-del-dia", "libro-de-caja", "facturacion", "cierre-del-mes"];

test("con tienda (Comerciante): «Cierre del mes» va detrás de «Cierre del día», en su grupo, una sola vez", () => {
  const visibles = deIds(DUENIO);
  const barra = proyectarMenuDeHoy(visibles);
  assert.ok(!barra.some((i) => i.label === "Cierre del mes"), "la barra de hoy no lo trae (por eso no llegaba)");
  const conCierre = conCierreDelMesEnLaBarra(barra, visibles, true);
  const i = conCierre.findIndex((x) => x.label === "Cierre del día");
  assert.ok(i >= 0);
  assert.deepEqual(conCierre[i + 1] && [conCierre[i + 1].label, conCierre[i + 1].href], ["Cierre del mes", "/admin/cierre-mes"]);
  assert.equal(conCierre[i + 1].grupo, conCierre[i].grupo);
  assert.equal(conCierre.length, barra.length + 1);
  assert.deepEqual(conCierreDelMesEnLaBarra(conCierre, visibles, true), conCierre, "no se duplica");
});

test("sin tienda (ERP vertical, CH): la barra queda IDÉNTICA", () => {
  const visibles = deIds(DUENIO);
  const barra = proyectarMenuDeHoy(visibles);
  assert.deepEqual(conCierreDelMesEnLaBarra(barra, visibles, false), barra);
});

test("quien no ve la app (sin permiso de reportes, como recepción) no la recibe en la barra", () => {
  const visibles = deIds(DUENIO.filter((id) => id !== "cierre-del-mes"));
  const barra = proyectarMenuDeHoy(visibles);
  assert.deepEqual(conCierreDelMesEnLaBarra(barra, visibles, true), barra);
});
