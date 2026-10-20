// El selector de rubro por texto: una frase de varias palabras le gana a una palabra suelta.
// Nació el 20/10/2026 al dar de alta a un profe de pádel: el alta lo mandaba a la TIENDA de pádel
// porque "padel" (retail) figuraba antes que "profe de padel" (oficios).
import test from "node:test";
import assert from "node:assert/strict";
import { resolveBlueprint } from "./index";

test("«profe de pádel» y sus variantes van al blueprint del profe, no a la tienda", () => {
  for (const t of ["Profe de pádel", "profesor de padel", "clases de padel", "entrenador de padel", "escuelita de padel"]) {
    assert.equal(resolveBlueprint(t).blueprintId, "profe-padel", t);
  }
});

test("«pádel» solo, o la tienda, sigue siendo la tienda de pádel", () => {
  for (const t of ["padel", "tienda de padel", "palas de padel"]) {
    assert.equal(resolveBlueprint(t).blueprintId, "padel", t);
  }
});

test("entre palabras sueltas se mantiene el orden de siempre (no se mide por letras)", () => {
  assert.equal(resolveBlueprint("spa y masajes").blueprintId, "estetica");
  assert.equal(resolveBlueprint("peluqueria y estetica").blueprintId, "estetica");
  assert.equal(resolveBlueprint("empanadas").blueprintId, "panaderia");
});

test("sin coincidencia cae al comodín", () => {
  const r = resolveBlueprint("zzz nada que ver");
  assert.equal(r.matched, false);
});
