import { test } from "node:test";
import assert from "node:assert/strict";
import { decidirVinculoProfesional } from "./vinculo-profesional";

const fichas = [
  { id: "laura", usuarioId: null },
  { id: "carla", usuarioId: "u-carla" },
];

test("vincular: una profesional queda atada a una ficha libre (y ve su agenda)", () => {
  assert.deepEqual(decidirVinculoProfesional({ usuario: { id: "u-laura", role: "PROFESSIONAL" }, fichaId: "laura", fichas }), {
    ok: true,
    professionalId: "laura",
  });
});

test("vincular: la ficha de otra usuaria no se pisa; la propia sí se puede volver a elegir", () => {
  assert.deepEqual(decidirVinculoProfesional({ usuario: { id: "u-laura", role: "PROFESSIONAL" }, fichaId: "carla", fichas }), {
    ok: false,
    status: "error_vinculo_ocupado",
  });
  assert.equal(decidirVinculoProfesional({ usuario: { id: "u-carla", role: "PROFESSIONAL" }, fichaId: "carla", fichas }).ok, true);
});

test("vincular: sólo el rol Profesional, sólo fichas de este negocio, y vacío desvincula", () => {
  assert.deepEqual(decidirVinculoProfesional({ usuario: { id: "u", role: "RECEPTION" }, fichaId: "laura", fichas }), {
    ok: false,
    status: "error_vinculo_rol",
  });
  assert.deepEqual(decidirVinculoProfesional({ usuario: { id: "u", role: "PROFESSIONAL" }, fichaId: "de-otro-negocio", fichas }), {
    ok: false,
    status: "error_not_found",
  });
  assert.deepEqual(decidirVinculoProfesional({ usuario: { id: "u", role: "PROFESSIONAL" }, fichaId: "", fichas }), {
    ok: true,
    professionalId: null,
  });
});
