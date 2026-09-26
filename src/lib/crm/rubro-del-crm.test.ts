// QA vuelta 1: una ferretería sin agenda le decía «Nunca vino · 0 visitas» a quien compró 35 veces.
import { test } from "node:test";
import assert from "node:assert/strict";
import { rubroDelCrm } from "./personas";

test("un comercio que no da turnos cuenta compras, aunque su rubro no sea uno de mostrador conocido", () => {
  assert.equal(rubroDelCrm({ esMostrador: false, daTurnos: false }), "mostrador");
});

test("CH (da turnos, no es de mostrador) sigue contando visitas; una carnicería, compras", () => {
  assert.equal(rubroDelCrm({ esMostrador: false, daTurnos: true }), "servicios");
  assert.equal(rubroDelCrm({ esMostrador: true, daTurnos: true }), "mostrador");
  assert.equal(rubroDelCrm({ esMostrador: true, daTurnos: false }), "mostrador");
});
