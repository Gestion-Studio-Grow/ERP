// La franja del modo simple vuelve a la ruta ACTUAL con su consulta (QA 06/11: el layout no se redibuja
// al navegar y «Ver todo» desde Caja volvía a la Agenda; volver de corregir perdía el día y el turno).
import { test } from "node:test";
import assert from "node:assert/strict";
import { hrefDeLaFranja, rutaConConsulta } from "./EnlaceDeLaFranja";

test("la ruta lleva la consulta (día y turno abierto) y se codifica en `volver`", () => {
  const ruta = rutaConConsulta("/admin/turnos", "date=2026-11-07&turno=abc");
  assert.equal(ruta, "/admin/turnos?date=2026-11-07&turno=abc");
  assert.equal(hrefDeLaFranja("ver-todo", ruta), "/admin/modo-completo?volver=%2Fadmin%2Fturnos%3Fdate%3D2026-11-07%26turno%3Dabc");
  assert.equal(hrefDeLaFranja("volver", "/admin/caja"), "/admin/modo-completo?simple=1&volver=%2Fadmin%2Fcaja");
  assert.equal(rutaConConsulta("/admin/caja", ""), "/admin/caja");
});

test("fuera del panel, la franja manda al Inicio (destinoSeguro)", () => {
  assert.equal(hrefDeLaFranja("ver-todo", "//otro.com"), "/admin/modo-completo?volver=%2Fadmin");
});
