import { test } from "node:test";
import assert from "node:assert/strict";
import { codigoDelFormulario, esChoqueDeUnico, mensajeCodigoOcupado } from "./codigo-producto";

function form(o: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(o)) fd.set(k, v);
  return fd;
}

test("sin el campo (catálogo de CH) no se toca el código guardado", () => {
  assert.equal(codigoDelFormulario(form({ name: "Crema" })), undefined);
});

test("el código se guarda sin espacios en los bordes; vacío es sin código (null)", () => {
  assert.equal(codigoDelFormulario(form({ codigo: "  00201 " })), "00201");
  assert.equal(codigoDelFormulario(form({ codigo: "   " })), null);
  assert.equal(codigoDelFormulario(form({ codigo: "" })), null);
});

test("código ocupado: nombra al producto que lo tiene, y si está eliminado dice que lo conserva", () => {
  assert.match(mensajeCodigoOcupado("00201", { name: "Vacío", eliminado: false }), /Ese código lo tiene "Vacío"/);
  const borrado = mensajeCodigoOcupado("00201", { name: "Matambre", eliminado: true });
  assert.match(borrado, /"Matambre", que está eliminado/);
  assert.match(borrado, /conserva su código/);
});

test("sólo un P2002 cuenta como choque de único", () => {
  assert.equal(esChoqueDeUnico({ code: "P2002" }), true);
  assert.equal(esChoqueDeUnico({ code: "P2025" }), false);
  assert.equal(esChoqueDeUnico(new Error("x")), false);
  assert.equal(esChoqueDeUnico(null), false);
});
