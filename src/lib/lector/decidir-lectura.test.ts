// EL CAMPO ÚNICO — `decidirLectura`: etiqueta, código o texto, con etiquetas armadas como las
// imprime la balanza (armarEtiquetaDeBalanza) y precios de prueba de Magra (provisionales a
// confirmar: los del diseño, vacío $28.600/kg).

import { test } from "node:test";
import assert from "node:assert/strict";
import { armarEtiquetaDeBalanza, FORMATO_BALANZA_POR_DEFECTO, type FormatoBalanza } from "@/lib/supermercado/balanza";
import {
  anunciarLectura,
  decidirLectura,
  etiquetaDistintaDelSistema,
  importeDelSistema,
  indiceDelCampo,
  type ProductoDelCampo,
} from "./decidir-lectura";

const VACIO: ProductoDelCampo = { id: "p-vacio", name: "Vacío", codigo: "00201", saleUnit: "WEIGHT", pricePerKg: 28600 };
const CHORIZO: ProductoDelCampo = { id: "p-chori", name: "Chorizo", codigo: "7790000000017", saleUnit: "UNIT", pricePerKg: null };
const SIN_CODIGO: ProductoDelCampo = { id: "p-bondi", name: "Bondiola", codigo: null, saleUnit: "WEIGHT", pricePerKg: 15400 };
const productos = [VACIO, CHORIZO, SIN_CODIGO];
const indice = indiceDelCampo(productos);
const nombreDe = (id: string) => productos.find((p) => p.id === id)?.name;
const PESO = FORMATO_BALANZA_POR_DEFECTO;
const IMPORTE: FormatoBalanza = { ...PESO, contenido: "importe", decimales: 0 };

test("etiqueta con peso → etiqueta: producto del PLU, kilos del papel y precio por kilo del sistema", () => {
  const l = decidirLectura(armarEtiquetaDeBalanza(PESO, "00201", 1.24), indice, PESO);
  assert.deepEqual(l, { tipo: "etiqueta", productId: "p-vacio", kg: 1.24, importeEtiqueta: null, precioSistema: 28600 });
  if (l.tipo !== "etiqueta") return;
  assert.equal(importeDelSistema(l), 35464); // MG-041: 1,240 kg de vacío = $35.464
  assert.equal(etiquetaDistintaDelSistema(l), false);
  assert.match(anunciarLectura(l, nombreDe), /^Entró Vacío: 1,24 kg a \$28\.600,00\/kg, \$35\.464,00\.$/);
});

test("etiqueta con importe → etiqueta: kilos al gramo e importe del papel; avisa si difiere del sistema (MG-023)", () => {
  const l = decidirLectura(armarEtiquetaDeBalanza(IMPORTE, "00201", 12400), indice, IMPORTE);
  assert.equal(l.tipo, "etiqueta");
  if (l.tipo !== "etiqueta") return;
  assert.equal(l.importeEtiqueta, 12400);
  assert.equal(l.kg, 0.434); // 12.400 / 28.600 = 0,4335… → 0,434 kg
  assert.equal(importeDelSistema(l), 12412.4);
  assert.equal(etiquetaDistintaDelSistema(l), true);
  assert.match(anunciarLectura(l, nombreDe), /Etiqueta \$12\.400,00 · Sistema \$12\.412,40/);
});

test("código de barras de un producto por unidad → codigo con 1; con multiplicador, con esa cantidad", () => {
  assert.deepEqual(decidirLectura("7790000000017", indice, PESO), { tipo: "codigo", productId: "p-chori", cantidad: 1 });
  const tres = decidirLectura("3*7790000000017", indice, PESO);
  assert.deepEqual(tres, { tipo: "codigo", productId: "p-chori", cantidad: 3 });
  assert.equal(anunciarLectura(tres, nombreDe), "Entraron 3 de Chorizo.");
});

test("PLU tipeado de un producto por kilo → codigo sin cantidad (falta el peso)", () => {
  const l = decidirLectura("201", indice, PESO);
  assert.deepEqual(l, { tipo: "codigo", productId: "p-vacio", cantidad: null });
  assert.equal(anunciarLectura(l, nombreDe), "Entró Vacío: cargá el peso.");
});

test("un nombre → texto, para el buscador (con o sin acentos, tal cual se escribió)", () => {
  assert.deepEqual(decidirLectura("vacío", indice, PESO), { tipo: "texto", texto: "vacío" });
  assert.deepEqual(decidirLectura("  bondiola  ", indice, PESO), { tipo: "texto", texto: "bondiola" });
  assert.equal(anunciarLectura({ tipo: "texto", texto: "vacío" }, nombreDe), "Buscando «vacío».");
});

test("lo que no se puede leer → desconocida con lo crudo y el porqué, sin cargar nada", () => {
  const plu = decidirLectura(armarEtiquetaDeBalanza(PESO, "00999", 1), indice, PESO);
  assert.equal(plu.tipo, "desconocida");
  assert.match(plu.tipo === "desconocida" ? plu.mensaje : "", /00999.*catálogo/);

  const buena = armarEtiquetaDeBalanza(PESO, "00201", 1.25);
  const mala = buena.slice(0, 12) + String((Number(buena[12]) + 1) % 10);
  const l = decidirLectura(mala, indice, PESO);
  assert.equal(l.tipo === "desconocida" && l.crudo, mala);
  assert.match(l.tipo === "desconocida" ? l.mensaje : "", /se leyó mal/);

  const vacio = decidirLectura("   ", indice, PESO);
  assert.equal(vacio.tipo, "desconocida");
  const mult = decidirLectura("3*", indice, PESO);
  assert.match(mult.tipo === "desconocida" ? mult.mensaje : "", /3\*código/);
  const multEtiqueta = decidirLectura(`2*${buena}`, indice, PESO);
  assert.match(multEtiqueta.tipo === "desconocida" ? multEtiqueta.mensaje : "", /no lleva multiplicador/);
});

test("sin formato de balanza (balanza: null), una etiqueta 2x no es etiqueta: se busca como código común", () => {
  const l = decidirLectura(armarEtiquetaDeBalanza(PESO, "00201", 1.25), indice, null);
  assert.equal(l.tipo, "desconocida");
  assert.match(l.tipo === "desconocida" ? l.mensaje : "", /No hay ningún producto/);
});

test("precio por unidad: sin informar, el campo sólo identifica; informado en null, avisa", () => {
  // Contrato §4.0: `productos` no trae `price`. El campo no juzga el precio (lo pone quien integra).
  assert.equal(decidirLectura("7790000000017", indice, PESO).tipo, "codigo");
  const conPrecioNulo = indiceDelCampo([{ ...CHORIZO, price: null }]);
  const l = decidirLectura("7790000000017", conPrecioNulo, PESO);
  assert.match(l.tipo === "desconocida" ? l.mensaje : "", /no tiene precio cargado/);
});

test("MG-022: el mismo código dos veces son dos lecturas iguales del MISMO producto (quien integra suma 1)", () => {
  const a = decidirLectura("7790000000017", indice, PESO);
  const b = decidirLectura("7790000000017", indice, PESO);
  assert.deepEqual(a, b);
});
