import { test } from "node:test";
import assert from "node:assert/strict";
import { aplicarTecla, teclaDesdeTeclado, valorDe, visorDe, type Tecla } from "./teclado-core";

const tipear = (teclas: Tecla[], modo: "peso" | "plata") => teclas.reduce((d, t) => aplicarTecla(d, t, modo), "");

test("la tecla de peso: los dígitos de la etiqueta, la coma la pone el sistema", () => {
  assert.equal(visorDe(tipear(["1"], "peso"), "peso").texto, "0,001 kg");
  assert.equal(visorDe(tipear(["1", "2", "8"], "peso"), "peso").texto, "0,128 kg");
  const d = tipear(["1", "2", "8", "0"], "peso");
  assert.equal(visorDe(d, "peso").texto, "1,280 kg");
  assert.equal(valorDe(d, "peso"), 1.28);
});

test("el visor separa lo que falta tipear (apagado) de lo tipeado", () => {
  assert.deepEqual(visorDe("12", "peso"), { relleno: "0,0", cargado: "12", unidad: "kg", texto: "0,012 kg" });
  assert.deepEqual(visorDe("1280", "peso"), { relleno: "", cargado: "1,280", unidad: "kg", texto: "1,280 kg" });
  assert.deepEqual(visorDe("", "peso"), { relleno: "0,000", cargado: "", unidad: "kg", texto: "0,000 kg" });
});

test("ceros a la izquierda no cuentan; el máximo se respeta; borrar y limpiar", () => {
  assert.equal(tipear(["0", "0", "5"], "peso"), "5");
  assert.equal(tipear(["9", "9", "9", "9", "9", "1"], "peso"), "99999", "99,999 kg y no más");
  assert.equal(aplicarTecla("1280", "borrar", "peso"), "128");
  assert.equal(aplicarTecla("1280", "limpiar", "peso"), "");
  assert.equal(aplicarTecla("", "borrar", "peso"), "");
});

test("en plata: pesos sin centavos, «00» agrega dos ceros, punto de miles", () => {
  const d = tipear(["7", "00", "0"], "plata");
  assert.equal(d, "7000");
  assert.equal(visorDe(d, "plata").texto, "$7.000");
  assert.equal(valorDe(d, "plata"), 7000);
  assert.equal(visorDe("", "plata").texto, "$0");
});

test("el teclado físico de la PC", () => {
  assert.equal(teclaDesdeTeclado("7"), "7");
  assert.equal(teclaDesdeTeclado("Backspace"), "borrar");
  assert.equal(teclaDesdeTeclado("Escape"), "limpiar");
  assert.equal(teclaDesdeTeclado(","), null, "la coma no se tipea");
});
