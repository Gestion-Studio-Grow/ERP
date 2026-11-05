import { test } from "node:test";
import assert from "node:assert/strict";
import { interpretarCondicionIva } from "./condicion-iva-emisor";

test("acepta las tres condiciones que emiten", () => {
  for (const c of ["RESPONSABLE_INSCRIPTO", "MONOTRIBUTO", "EXENTO"]) {
    assert.deepEqual(interpretarCondicionIva(c, false), { accion: "set", condicion: c });
  }
});

test("vacío borra; consumidor final y basura no", () => {
  assert.deepEqual(interpretarCondicionIva("", false), { accion: "clear" });
  assert.equal(interpretarCondicionIva("CONSUMIDOR_FINAL", false).accion, "error");
  assert.equal(interpretarCondicionIva("toString", false).accion, "error");
  assert.equal(interpretarCondicionIva(undefined, false).accion, "clear");
});

test("con el negocio en real no se cambia desde acá", () => {
  assert.equal(interpretarCondicionIva("MONOTRIBUTO", true).accion, "error");
});
