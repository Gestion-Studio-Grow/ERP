// E1 de la certificación de GSG-MIA-080 (GSG-MIA-082): la alerta de la consola distingue los dos casos del techo.
// Al usuario OWNER de un agente lo frena la guardia (no entra al panel) y G5 (no se reanuda a nadie). A «Dirección en
// Proyectos» no lo frena nada de eso (medido por el certificador: entra y la dueña reanuda): el aviso no lo promete.
import { test } from "node:test";
import assert from "node:assert/strict";
import { alertaDelTecho } from "./accesos";

const TEXTO_DUENIO =
  "Su usuario es Dueño/a, y un agente nunca lo es: no entra al panel (tampoco a Usuarios) y no se puede reanudar a ningún agente. Igualalo con alguien del puesto.";
const TEXTO_DIRECCION =
  "Su usuario es Dirección en Proyectos, y un agente nunca lo es. Para este caso no hay freno: entra al panel con lo que Dirección puede en Proyectos y no impide reanudar agentes. Igualalo con alguien del puesto cuanto antes.";

test("alerta del techo: el usuario OWNER promete el freno que existe (guardia y G5)", () => {
  assert.equal(alertaDelTecho({ role: "OWNER", rolProyectos: null }), TEXTO_DUENIO);
  // OWNER y además Dirección: manda OWNER, porque a ese sí lo frena la guardia.
  assert.equal(alertaDelTecho({ role: "OWNER", rolProyectos: "DIRECCION" }), TEXTO_DUENIO);
});

test("alerta del techo: Dirección en Proyectos no promete un freno que no existe", () => {
  const alerta = alertaDelTecho({ role: "RECEPTION", rolProyectos: "DIRECCION" });
  assert.equal(alerta, TEXTO_DIRECCION);
  assert.doesNotMatch(alerta ?? "", /no entra al panel/);
  assert.doesNotMatch(alerta ?? "", /no se puede reanudar/);
});

test("alerta del techo: un usuario del puesto no es alerta", () => {
  assert.equal(alertaDelTecho({ role: "RECEPTION", rolProyectos: null }), null);
  assert.equal(alertaDelTecho({ role: "RECEPTION", rolProyectos: "PRODUCCION" }), null);
});
