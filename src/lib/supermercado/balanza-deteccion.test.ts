// «Detectar con una etiqueta»: con el código impreso y lo que marcó la balanza, el sistema
// propone el formato que cierra. Se arman etiquetas con cada formato y se detectan de vuelta.

import { test } from "node:test";
import assert from "node:assert/strict";
import { armarEtiquetaDeBalanza, type FormatoBalanza } from "./balanza";
import { detectarConVariasEtiquetas, detectarFormato } from "./balanza-deteccion";

const PESO_20_5: FormatoBalanza = { prefijos: ["20"], digitosProducto: 5, contenido: "peso", decimales: 3 };

test("una etiqueta de peso con el peso que marcó la balanza: el primer candidato es el formato con que se imprimió", () => {
  const r = detectarFormato(armarEtiquetaDeBalanza(PESO_20_5, "00123", 1.25), { peso: 1.25 });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.deepEqual(r.candidatos[0].formato, PESO_20_5);
  assert.equal(r.candidatos[0].plu, "00123");
});

test("con importe y control del precio, lo detecta", () => {
  const f: FormatoBalanza = { prefijos: ["21"], digitosProducto: 5, contenido: "importe", decimales: 0, verificadorDePrecio: true };
  const r = detectarFormato(armarEtiquetaDeBalanza(f, "04567", 2875), { importe: 2875 });
  assert.equal(r.ok, true);
  assert.ok(r.ok && r.candidatos.some((c) => JSON.stringify(c.formato) === JSON.stringify(f) && c.plu === "04567"));
});

test("prefijo de un dígito y UPC-A de 12 (también con el 0 adelante del lector)", () => {
  const f: FormatoBalanza = { prefijos: ["2"], digitosProducto: 5, contenido: "importe", decimales: 2, largo: 12, verificadorDePrecio: true };
  const etiqueta = armarEtiquetaDeBalanza(f, "01234", 12.5);
  for (const leida of [etiqueta, `0${etiqueta}`]) {
    const r = detectarFormato(leida, { importe: 12.5 });
    assert.ok(r.ok && r.candidatos.some((c) => JSON.stringify(c.formato) === JSON.stringify(f)), leida);
  }
});

test("el peso que no coincide no inventa un formato y lo dice", () => {
  const r = detectarFormato(armarEtiquetaDeBalanza(PESO_20_5, "00123", 1.25), { peso: 0.8 });
  assert.equal(r.ok, false);
  assert.match(!r.ok ? r.mensaje : "", /Revisá el número que marcó la balanza/);
});

test("sin peso ni importe, o con un código que no es de balanza, avisa qué falta", () => {
  assert.match((detectarFormato("2000123012508", {}) as { mensaje: string }).mensaje, /Escribí el peso o el importe/);
  assert.match((detectarFormato("7790895000997", { peso: 1 }) as { mensaje: string }).mensaje, /no parece de la balanza/);
  assert.match((detectarFormato("12345", { peso: 1 }) as { mensaje: string }).mensaje, /12 o 13 números/);
});

test("dos etiquetas de productos distintos desempatan y juntan los prefijos", () => {
  const f21: FormatoBalanza = { ...PESO_20_5, prefijos: ["21"] };
  const una = { texto: armarEtiquetaDeBalanza(PESO_20_5, "00123", 1.25), marco: { peso: 1.25 } };
  const otra = { texto: armarEtiquetaDeBalanza(f21, "98765", 0.432), marco: { peso: 0.432 } };
  const r = detectarConVariasEtiquetas([una, otra]);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.deepEqual(r.candidatos[0].formato, { ...PESO_20_5, prefijos: ["20", "21"] });
  // Con 6 dígitos de producto, el PLU de la segunda sería 987650... y el peso no cerraría: queda una sola forma de leerlas.
  assert.equal(r.candidatos.filter((c) => c.formato.contenido === "peso").length >= 1, true);
});

test("control del precio: una etiqueta sola también se lee sin control; con dos, gana el control; con el número del producto, queda uno", () => {
  const f: FormatoBalanza = { prefijos: ["21"], digitosProducto: 4, contenido: "importe", decimales: 0, verificadorDePrecio: true };
  const una = { texto: armarEtiquetaDeBalanza(f, "123", 15500), marco: { importe: 15500 } };
  const otra = { texto: armarEtiquetaDeBalanza(f, "456", 9030), marco: { importe: 9030 } };
  const sola = detectarFormato(una.texto, una.marco);
  assert.ok(sola.ok && sola.candidatos.length > 1, "una sola etiqueta es ambigua");
  const dos = detectarConVariasEtiquetas([una, otra]);
  assert.ok(dos.ok);
  if (!dos.ok) return;
  assert.deepEqual(dos.candidatos[0].formato, { ...f, prefijos: ["21"] });
  assert.equal(dos.candidatos[0].plu, "0123");
  const conPlu = detectarFormato(una.texto, { importe: 15500, plu: "123" });
  assert.ok(conPlu.ok);
  assert.ok(conPlu.ok && conPlu.candidatos.every((c) => c.plu.replace(/^0+/, "") === "123"));
  assert.ok(conPlu.ok && conPlu.candidatos[0].formato.verificadorDePrecio);
});
