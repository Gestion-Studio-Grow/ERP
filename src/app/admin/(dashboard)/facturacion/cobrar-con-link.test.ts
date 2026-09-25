import { test } from "node:test";
import assert from "node:assert/strict";
import { montoParaElLink } from "./cobrar-con-link";

test("la plata escrita como acá viaja como el número que lee la acción", () => {
  assert.equal(montoParaElLink("12.500"), "12500");
  assert.equal(montoParaElLink("12.500,50"), "12500.5");
  assert.equal(montoParaElLink("12,5"), "12.5");
  assert.equal(Number(montoParaElLink("34.000")), 34000, "Number() del lado del servidor da lo que se escribió");
});

test("vacío, cero o algo que no es plata: no se manda", () => {
  assert.equal(montoParaElLink(""), null);
  assert.equal(montoParaElLink("0"), null);
  assert.equal(montoParaElLink("doce"), null);
});
