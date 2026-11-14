import { test } from "node:test";
import assert from "node:assert/strict";
import { barrasDeModulos, datosDeEtiquetaDePaquete, modulosEan13, LEYENDA_CONSERVACION } from "./etiqueta-paquete";
import { FORMATO_BALANZA_POR_DEFECTO, leerEtiquetaDeBalanza, type FormatoBalanza } from "@/lib/supermercado/balanza";

// Decodificador independiente (tablas escritas a mano acá, no importadas) para la ida y vuelta.
const L = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"];
const PAR = ["LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL"];
const inv = (s: string) => [...s].map((c) => (c === "1" ? "0" : "1")).join("");
const rev = (s: string) => [...s].reverse().join("");
function decodificar(m: string): string {
  assert.equal(m.length, 95);
  assert.equal(m.slice(0, 3), "101");
  assert.equal(m.slice(45, 50), "01010");
  assert.equal(m.slice(92), "101");
  let izq = "";
  let paridad = "";
  for (let i = 0; i < 6; i++) {
    const t = m.slice(3 + i * 7, 10 + i * 7);
    const l = L.indexOf(t);
    const g = L.map((x) => rev(inv(x))).indexOf(t);
    if (l >= 0) { izq += l; paridad += "L"; } else { assert.ok(g >= 0); izq += g; paridad += "G"; }
  }
  let der = "";
  for (let i = 0; i < 6; i++) der += L.map(inv).indexOf(m.slice(50 + i * 7, 57 + i * 7));
  return `${PAR.indexOf(paridad)}${izq}${der}`;
}

test("EAN-13 conocido: 4006381333931 ida y vuelta", () => {
  const m = modulosEan13("4006381333931");
  assert.equal(m.slice(0, 10), "1010001101"); // guarda + 0 en L (4 → LGLLGG, 2.º dígito L)
  assert.equal(decodificar(m), "4006381333931");
});

test("UPC-A se codifica como EAN-13 con 0 adelante", () => {
  assert.equal(modulosEan13("036000291452"), modulosEan13("0036000291452"));
  assert.equal(decodificar(modulosEan13("036000291452")), "0036000291452");
});

test("EAN inválido tira RangeError", () => {
  assert.throws(() => modulosEan13("4006381333932"), RangeError);
  assert.throws(() => modulosEan13("123"), RangeError);
});

test("barras: corridas de 1 que suman los módulos negros", () => {
  const m = modulosEan13("4006381333931");
  const b = barrasDeModulos(m);
  assert.equal(b.reduce((s, x) => s + x.ancho, 0), [...m].filter((c) => c === "1").length);
  assert.deepEqual(b[0], { x: 0, ancho: 1 });
});

const lote = { code: "L-0042", packedAt: new Date("2026-11-01T12:00:00Z"), expiresAt: new Date("2026-11-20T00:00:00Z") };

test("etiqueta con peso (formato por defecto) se lee en la caja con el mismo PLU y peso", () => {
  const e = datosDeEtiquetaDePaquete({ producto: { nombre: "Vacío", codigo: "123", precioPorKilo: 12990 }, lote, pesoKg: 1.235, formato: FORMATO_BALANZA_POR_DEFECTO, negocio: "Magra" });
  assert.equal(e.total, 16042.65);
  assert.equal(e.envasado, "01/11/2026");
  assert.equal(e.vence, "20/11/2026");
  assert.equal(e.leyenda, LEYENDA_CONSERVACION);
  assert.ok(e.codigo);
  const l = leerEtiquetaDeBalanza(e.codigo!, FORMATO_BALANZA_POR_DEFECTO);
  assert.deepEqual(l, { ok: true, plu: "00123", contenido: "peso", peso: 1.235 });
  assert.equal(decodificar(modulosEan13(e.codigo!)), e.codigo);
});

test("etiqueta con importe: el total impreso es el que cobra la caja", () => {
  const f: FormatoBalanza = { prefijos: ["21"], digitosProducto: 4, contenido: "importe", decimales: 0 };
  const e = datosDeEtiquetaDePaquete({ producto: { nombre: "Matambre", codigo: "77", precioPorKilo: 9999.5 }, lote, pesoKg: 0.873, formato: f, negocio: "Magra" });
  assert.equal(e.total, 8730);
  const l = leerEtiquetaDeBalanza(e.codigo!, f);
  assert.deepEqual(l, { ok: true, plu: "0077", contenido: "importe", importe: 8730 });
});

test("UPC-A (largo 12) también se lee", () => {
  const f: FormatoBalanza = { prefijos: ["2"], digitosProducto: 5, contenido: "peso", decimales: 3, largo: 12 };
  const e = datosDeEtiquetaDePaquete({ producto: { nombre: "Bife", codigo: "456", precioPorKilo: 1000 }, lote, pesoKg: 0.5, formato: f, negocio: "" });
  assert.equal(e.codigo!.length, 12);
  assert.deepEqual(leerEtiquetaDeBalanza(e.codigo!, f), { ok: true, plu: "00456", contenido: "peso", peso: 0.5 });
  assert.equal(modulosEan13(e.codigo!).length, 95);
});

test("sin código utilizable: null con motivo", () => {
  const base = { lote, pesoKg: 1, formato: FORMATO_BALANZA_POR_DEFECTO, negocio: "" };
  for (const codigo of [null, "", "ABC12", "1234567", "0123"]) {
    const e = datosDeEtiquetaDePaquete({ ...base, producto: { nombre: "X", codigo, precioPorKilo: 100 } });
    assert.equal(e.codigo, null, String(codigo));
    assert.ok(e.motivoSinCodigo);
  }
  // Valor que no entra (100 kg en 5 dígitos de gramos) → atrapa el RangeError.
  const grande = datosDeEtiquetaDePaquete({ ...base, pesoKg: 100, producto: { nombre: "X", codigo: "1", precioPorKilo: 100 } });
  assert.equal(grande.codigo, null);
  assert.match(grande.motivoSinCodigo!, /no entra/);
});
