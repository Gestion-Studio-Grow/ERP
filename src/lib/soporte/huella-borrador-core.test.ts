// La huella del borrador: cambia con cualquier cambio de contenido, no con nada más. PURO.

import { test } from "node:test";
import assert from "node:assert/strict";
import { huellaDelBorrador } from "./huella-borrador-core";

const base = { tipo: "consulta", prioridad: "P3", respuesta: "Texto que la persona VIO", motivo: "", el: "2026-11-14T12:00:00.000Z" };

test("determinista y en hex de 64", () => {
  assert.equal(huellaDelBorrador(base), huellaDelBorrador({ ...base }));
  assert.match(huellaDelBorrador(base), /^[0-9a-f]{64}$/);
});

test("el agente reescribe con el mismo `el`: otra huella (ataque B de la certificación)", () => {
  assert.notEqual(huellaDelBorrador({ ...base, respuesta: "Texto CAMBIADO que nadie revisó" }), huellaDelBorrador(base));
});

test("cada campo cuenta, y no hay ambigüedad de separadores", () => {
  const h = huellaDelBorrador(base);
  for (const [k, v] of [["tipo", "error"], ["prioridad", "P1"], ["motivo", "m"], ["el", "2026-11-14T12:00:00.001Z"], ["respuesta", "Texto que la persona VIO "]] as const) {
    assert.notEqual(huellaDelBorrador({ ...base, [k]: v }), h, k);
  }
  assert.notEqual(
    huellaDelBorrador({ ...base, respuesta: "a\",\"b", motivo: "" }),
    huellaDelBorrador({ ...base, respuesta: "a", motivo: "b" }),
  );
});
