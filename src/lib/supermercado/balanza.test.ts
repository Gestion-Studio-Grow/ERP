import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FORMATO_BALANZA_POR_DEFECTO,
  MENSAJE_VERIFICADOR_BALANZA,
  MENSAJE_VERIFICADOR_DE_PRECIO,
  armarEtiquetaDeBalanza,
  describirFormato,
  digitosDeValor,
  esCodigoDeBalanza,
  formatoDesdeAfuera,
  leerEtiquetaDeBalanza,
  pesoDeUnImporte,
  problemaDelFormato,
  renglonDeBalanza,
  verificadorDePrecio,
  type FormatoBalanza,
} from "./balanza";
import { conVerificador, esEan13Valido } from "./ean";

const PESO_5: FormatoBalanza = FORMATO_BALANZA_POR_DEFECTO;
const IMPORTE_4_PESOS: FormatoBalanza = { prefijos: ["20"], digitosProducto: 4, contenido: "importe", decimales: 0 };
const IMPORTE_5_CENTAVOS: FormatoBalanza = { prefijos: ["21", "22"], digitosProducto: 5, contenido: "importe", decimales: 2 };
const PESO_6_DECENAS: FormatoBalanza = { prefijos: ["28"], digitosProducto: 6, contenido: "peso", decimales: 2 };

const queso = { name: "Queso cremoso", saleUnit: "WEIGHT", pricePerKg: 12990 };

test("formato por defecto: 20 + PLU de 5 + peso en gramos; 1,250 kg del PLU 123", () => {
  // Cuerpo 20 00123 01250 → verificador calculado.
  const codigo = armarEtiquetaDeBalanza(PESO_5, "123", 1.25);
  assert.equal(codigo.slice(0, 12), "200012301250");
  assert.ok(esEan13Valido(codigo));
  const l = leerEtiquetaDeBalanza(codigo, PESO_5);
  assert.deepEqual(l, { ok: true, plu: "00123", contenido: "peso", peso: 1.25 });
});

test("etiqueta con importe en pesos enteros (PLU de 4): el importe es el de la etiqueta", () => {
  const codigo = armarEtiquetaDeBalanza(IMPORTE_4_PESOS, "0042", 4520);
  assert.equal(codigo.slice(0, 12), "200042004520");
  const l = leerEtiquetaDeBalanza(codigo, IMPORTE_4_PESOS);
  assert.deepEqual(l, { ok: true, plu: "0042", contenido: "importe", importe: 4520 });
});

test("etiqueta con importe con centavos (PLU de 5, prefijo 22)", () => {
  const codigo = armarEtiquetaDeBalanza(IMPORTE_5_CENTAVOS, "777", 452.35, "22");
  assert.equal(codigo.slice(0, 12), "220077745235");
  const l = leerEtiquetaDeBalanza(codigo, IMPORTE_5_CENTAVOS);
  assert.deepEqual(l, { ok: true, plu: "00777", contenido: "importe", importe: 452.35 });
});

test("etiqueta con peso en decenas de gramos (PLU de 6)", () => {
  const codigo = armarEtiquetaDeBalanza(PESO_6_DECENAS, "123456", 0.75, "28");
  assert.equal(codigo.slice(0, 12), "281234560075");
  const l = leerEtiquetaDeBalanza(codigo, PESO_6_DECENAS);
  assert.deepEqual(l, { ok: true, plu: "123456", contenido: "peso", peso: 0.75 });
});

test("una etiqueta con el verificador mal NO se cobra: el peso podría ser otro", () => {
  const bien = armarEtiquetaDeBalanza(PESO_5, "123", 1.25);
  const mal = bien.slice(0, 12) + String((Number(bien[12]) + 1) % 10);
  assert.deepEqual(leerEtiquetaDeBalanza(mal, PESO_5), { ok: false, mensaje: MENSAJE_VERIFICADOR_BALANZA });
});

test("un prefijo 2x que la balanza no usa no es etiqueta de balanza", () => {
  const codigo = armarEtiquetaDeBalanza(IMPORTE_5_CENTAVOS, "777", 10, "21");
  assert.ok(esCodigoDeBalanza(codigo, IMPORTE_5_CENTAVOS));
  assert.equal(esCodigoDeBalanza(codigo, IMPORTE_4_PESOS), false);
  // Un EAN argentino común (779…) nunca es de balanza.
  assert.equal(esCodigoDeBalanza("7790895000997", PESO_5), false);
});

test("peso o importe en cero se rechaza con qué hacer", () => {
  const codigo = armarEtiquetaDeBalanza(PESO_5, "123", 0);
  const l = leerEtiquetaDeBalanza(codigo, PESO_5);
  assert.equal(l.ok, false);
  assert.match((l as { mensaje: string }).mensaje, /volvé a pesar/);
});

test("con peso, el renglón es el peso de la etiqueta y el importe lo calcula la venta", () => {
  const l = leerEtiquetaDeBalanza(armarEtiquetaDeBalanza(PESO_5, "123", 0.348), PESO_5);
  assert.ok(l.ok);
  assert.deepEqual(renglonDeBalanza(l as Extract<typeof l, { ok: true }>, queso), { ok: true, cantidad: 0.348, importe: null });
});

test("con importe, se cobra el importe exacto y el peso se deduce al gramo", () => {
  const l = leerEtiquetaDeBalanza(armarEtiquetaDeBalanza(IMPORTE_4_PESOS, "42", 4520), IMPORTE_4_PESOS);
  assert.ok(l.ok);
  // 4520 / 12990 = 0,34796… → 0,348 kg.
  assert.deepEqual(renglonDeBalanza(l as Extract<typeof l, { ok: true }>, queso), { ok: true, cantidad: 0.348, importe: 4520 });
});

test("una etiqueta de balanza sobre un producto por unidad se rechaza", () => {
  const l = leerEtiquetaDeBalanza(armarEtiquetaDeBalanza(PESO_5, "123", 1), PESO_5);
  assert.ok(l.ok);
  const r = renglonDeBalanza(l as Extract<typeof l, { ok: true }>, { name: "Yerba 1 kg", saleUnit: "UNIT", pricePerKg: null });
  assert.equal(r.ok, false);
});

test("el peso de un importe se calcula en enteros y redondea medio gramo hacia arriba", () => {
  assert.equal(pesoDeUnImporte(4520, 12990), 0.348);
  assert.equal(pesoDeUnImporte(5, 10000), 0.001); // 0,5 g → 1 g
  assert.equal(pesoDeUnImporte(4.99, 10000), 0); // 0,499 g → 0
  assert.equal(pesoDeUnImporte(12990, 12990), 1);
});

test("la configuración se valida campo por campo", () => {
  assert.equal(problemaDelFormato(PESO_5), null);
  assert.equal(problemaDelFormato(IMPORTE_4_PESOS), null);
  assert.match(problemaDelFormato({ ...PESO_5, prefijos: ["19"] }) ?? "", /20 al 29/);
  assert.match(problemaDelFormato({ ...PESO_5, digitosProducto: 7 }) ?? "", /4, 5 o 6/);
  assert.match(problemaDelFormato({ ...PESO_5, decimales: 1 }) ?? "", /gramos/);
  assert.match(problemaDelFormato({ ...IMPORTE_4_PESOS, decimales: 3 }) ?? "", /centavos/);
  assert.equal(formatoDesdeAfuera({ ...PESO_5, prefijos: ["21", "20", "20"] })?.prefijos.join(","), "20,21");
  assert.equal(formatoDesdeAfuera(null), null);
  assert.equal(digitosDeValor(PESO_5), 5);
  assert.match(describirFormato(PESO_5), /del 20 al 29, 5 dígitos del producto y 5 para el peso en gramos/);
});

// ── Formatos que antes no entraban: prefijo de 1 dígito, control del precio y UPC-A ─────────

test("el control del precio GS1 da los ejemplos de GS1: 2875 → 9 (4 dígitos) y 14685 → 6 (5 dígitos)", () => {
  assert.equal(verificadorDePrecio("2875"), 9);
  assert.equal(verificadorDePrecio("14685"), 6);
  assert.throws(() => verificadorDePrecio("123"));
});

test("prefijo de un dígito: 2 + producto de 5 + peso de 6 en gramos, ida y vuelta", () => {
  const f: FormatoBalanza = { prefijos: ["2"], digitosProducto: 5, contenido: "peso", decimales: 3 };
  assert.equal(problemaDelFormato(f), null);
  const etiqueta = armarEtiquetaDeBalanza(f, "00123", 1.25);
  assert.equal(etiqueta.length, 13);
  assert.equal(etiqueta.slice(0, 7), "2001230");
  assert.deepEqual(leerEtiquetaDeBalanza(etiqueta, f), { ok: true, plu: "00123", contenido: "peso", peso: 1.25 });
});

test("el 2 solo no se mezcla con prefijos de dos dígitos", () => {
  assert.match(problemaDelFormato({ prefijos: ["2", "20"], digitosProducto: 5, contenido: "peso", decimales: 3 }) ?? "", /no se mezcla/);
});

test("con control del precio: la etiqueta buena se lee; si el lector cambia un dígito del importe y se recalcula el verificador final, el control lo frena", () => {
  const f: FormatoBalanza = { prefijos: ["20"], digitosProducto: 5, contenido: "importe", decimales: 0, verificadorDePrecio: true };
  assert.equal(problemaDelFormato(f), null);
  assert.equal(digitosDeValor(f), 4);
  const etiqueta = armarEtiquetaDeBalanza(f, "00123", 2875);
  assert.equal(etiqueta.slice(7, 8), "9", "el control va antes del valor");
  assert.deepEqual(leerEtiquetaDeBalanza(etiqueta, f), { ok: true, plu: "00123", contenido: "importe", importe: 2875 });
  // Mismo código con otro importe y un verificador final que SÍ cierra: sólo el control lo nota.
  const trucha = conVerificador(`${etiqueta.slice(0, 8)}2876`);
  const r = leerEtiquetaDeBalanza(trucha, f);
  assert.equal(r.ok, false);
  assert.equal(!r.ok && r.mensaje, MENSAJE_VERIFICADOR_DE_PRECIO);
});

test("el control del precio sólo vale con 4 o 5 dígitos de valor", () => {
  assert.match(
    problemaDelFormato({ prefijos: ["20"], digitosProducto: 6, contenido: "importe", decimales: 0, verificadorDePrecio: true }) ?? "",
    /4 o 5 dígitos/,
  );
});

test("UPC-A de 12 dígitos (2 + producto de 5 + control + importe de 4), también si el lector lo manda con un 0 adelante", () => {
  const f: FormatoBalanza = { prefijos: ["2"], digitosProducto: 5, contenido: "importe", decimales: 2, largo: 12, verificadorDePrecio: true };
  assert.equal(problemaDelFormato(f), null);
  const etiqueta = armarEtiquetaDeBalanza(f, "01234", 12.5);
  assert.equal(etiqueta.length, 12);
  const esperado = { ok: true, plu: "01234", contenido: "importe", importe: 12.5 };
  assert.deepEqual(leerEtiquetaDeBalanza(etiqueta, f), esperado);
  assert.deepEqual(leerEtiquetaDeBalanza(`0${etiqueta}`, f), esperado);
  assert.equal(esCodigoDeBalanza(`0${etiqueta}`, f), true);
});

test("un formato guardado antes (sin largo ni control) se normaliza igual que siempre", () => {
  const viejo = { prefijos: ["21", "20"], digitosProducto: 5, contenido: "peso", decimales: 3 };
  assert.deepEqual(formatoDesdeAfuera(viejo), { prefijos: ["20", "21"], digitosProducto: 5, contenido: "peso", decimales: 3 });
});
