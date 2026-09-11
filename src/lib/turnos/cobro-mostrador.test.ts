import { test } from "node:test";
import assert from "node:assert/strict";
import { puedeCobrarEsteTurno, elMostradorLeCobra } from "@/lib/turnos/cobro-mostrador";

const UÑAS = { professionalIdDelTurno: "p_uñas", nombreProfesional: "Naiara", cobraEnMostrador: false };
const RESTO = { professionalIdDelTurno: "p_facial", nombreProfesional: "Anto", cobraEnMostrador: true };

test("la recepción cobra a todas las profesionales", () => {
  assert.deepEqual(puedeCobrarEsteTurno({ rol: "RECEPTION", ...RESTO }), { ok: true });
});

test("la recepción NO cobra el turno de la profesional que cobra aparte", () => {
  const v = puedeCobrarEsteTurno({ rol: "RECEPTION", ...UÑAS });
  assert.equal(v.ok, false);
  assert.ok(!v.ok && v.motivo.includes("Naiara"), "el mensaje tiene que decir a quién pasarle el cobro");
});

test("sin nombre, el mensaje sigue diciendo qué hacer", () => {
  const v = puedeCobrarEsteTurno({ rol: "RECEPTION", professionalIdDelTurno: "p", cobraEnMostrador: false });
  assert.ok(!v.ok && v.motivo.includes("cobra sus propios turnos"));
});

// La dueña no tiene excepciones: la regla es del mostrador, no del negocio.
test("la dueña cobra todo, incluida la de uñas", () => {
  assert.deepEqual(puedeCobrarEsteTurno({ rol: "OWNER", ...UÑAS }), { ok: true });
});

test("la profesional cobra los suyos", () => {
  assert.deepEqual(
    puedeCobrarEsteTurno({ rol: "PROFESSIONAL", professionalIdDelUsuario: "p_uñas", ...UÑAS }),
    { ok: true },
  );
});

test("la profesional NO cobra los de una colega, ni siquiera si el mostrador sí puede", () => {
  const v = puedeCobrarEsteTurno({ rol: "PROFESSIONAL", professionalIdDelUsuario: "p_uñas", ...RESTO });
  assert.equal(v.ok, false);
});

// El caso que rompe: una profesional SIN professionalId (usuario mal armado) no puede
// quedar cobrando cualquier cosa por comparar undefined con undefined.
test("una profesional sin professionalId no cobra nada", () => {
  for (const id of [null, undefined, ""]) {
    const v = puedeCobrarEsteTurno({ rol: "PROFESSIONAL", professionalIdDelUsuario: id, ...RESTO });
    assert.equal(v.ok, false, `professionalIdDelUsuario=${JSON.stringify(id)} no puede cobrar`);
  }
});

// Schema-ahead: mientras la migración no esté aplicada, la columna no llega. Un flag
// ausente NO puede frenar un cobro — sería una caja que deja de funcionar por un deploy.
test("si la columna todavía no existe, el mostrador cobra (default de la columna)", () => {
  for (const v of [undefined, null]) {
    assert.deepEqual(
      puedeCobrarEsteTurno({ rol: "RECEPTION", professionalIdDelTurno: "p", cobraEnMostrador: v }),
      { ok: true },
    );
  }
});

test("elMostradorLeCobra: sólo el false explícito la excluye", () => {
  assert.equal(elMostradorLeCobra({ cobraEnMostrador: false }), false);
  assert.equal(elMostradorLeCobra({ cobraEnMostrador: true }), true);
  assert.equal(elMostradorLeCobra({ cobraEnMostrador: null }), true);
  assert.equal(elMostradorLeCobra({}), true);
});
