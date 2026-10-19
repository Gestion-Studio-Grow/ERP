// VENDER — el campo «Etiqueta de la balanza o código», con etiquetas armadas como las imprime la
// balanza (armarEtiquetaDeBalanza) y los precios de prueba de una carnicería.

import { test } from "node:test";
import assert from "node:assert/strict";
import { armarEtiquetaDeBalanza, FORMATO_BALANZA_POR_DEFECTO, type FormatoBalanza } from "@/lib/supermercado/balanza";
import { indiceDeVender, lineaDesdeLectura, type ProductoDeVender } from "./lectura-vender";

const VACIO: ProductoDeVender = { id: "p-vacio", name: "Vacío", codigo: "00201", saleUnit: "WEIGHT", price: null, pricePerKg: 12500 };
const CARBON: ProductoDeVender = { id: "p-carbon", name: "Carbón 4 kg", codigo: "7790000000017", saleUnit: "UNIT", price: 3000, pricePerKg: null };
const SIN_CODIGO: ProductoDeVender = { id: "p-chori", name: "Chorizo", codigo: null, saleUnit: "WEIGHT", price: null, pricePerKg: 9000 };
const indice = indiceDeVender([VACIO, CARBON, SIN_CODIGO]);
const PESO = FORMATO_BALANZA_POR_DEFECTO;
const IMPORTE: FormatoBalanza = { ...PESO, contenido: "importe", decimales: 0 };

test("etiqueta con peso: carga el producto del PLU con el peso de la etiqueta y dice la regla del precio", () => {
  const r = lineaDesdeLectura(armarEtiquetaDeBalanza(PESO, "00201", 1.25), indice, PESO);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.productId, "p-vacio");
  assert.equal(r.qtyText, "1,25");
  assert.match(r.aviso ?? "", /precio cargado/);
  assert.match(r.aviso ?? "", /\$12\.500,00\/kg/);
});

test("etiqueta con importe: carga el peso equivalente al gramo y avisa que puede diferir centavos", () => {
  const r = lineaDesdeLectura(armarEtiquetaDeBalanza(IMPORTE, "00201", 6250), indice, IMPORTE);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.qtyText, "0,5");
  assert.match(r.aviso ?? "", /\$6\.250,00/);
  assert.match(r.aviso ?? "", /centavos/);
});

test("código de producto por unidad: entra con 1; con multiplicador, con esa cantidad", () => {
  const uno = lineaDesdeLectura("7790000000017", indice, PESO);
  assert.deepEqual(uno, { ok: true, productId: "p-carbon", qtyText: "1", aviso: null });
  const tres = lineaDesdeLectura("3*7790000000017", indice, PESO);
  assert.equal(tres.ok && tres.qtyText, "3");
});

test("PLU tipeado de un producto por kilo: carga el producto y pide el peso", () => {
  const r = lineaDesdeLectura("201", indice, PESO);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.productId, "p-vacio");
  assert.equal(r.qtyText, "");
  assert.match(r.aviso ?? "", /cargá el peso/);
});

test("PLU que no está en el catálogo: avisa sin cargar nada", () => {
  const r = lineaDesdeLectura(armarEtiquetaDeBalanza(PESO, "00999", 1), indice, PESO);
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.match(r.mensaje, /00999/);
  assert.match(r.mensaje, /catálogo/);
});

test("etiqueta mal leída (verificador que no cierra): no carga un peso equivocado", () => {
  const buena = armarEtiquetaDeBalanza(PESO, "00201", 1.25);
  const mala = buena.slice(0, 12) + String((Number(buena[12]) + 1) % 10);
  const r = lineaDesdeLectura(mala, indice, PESO);
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.match(r.mensaje, /se leyó mal/);
});

test("texto que no es código, vacío o sólo multiplicador: cada uno con su mensaje", () => {
  const busqueda = lineaDesdeLectura("vacio", indice, PESO);
  assert.equal(busqueda.ok, false);
  assert.match(!busqueda.ok ? busqueda.mensaje : "", /buscador/);
  assert.equal(lineaDesdeLectura("  ", indice, PESO).ok, false);
  const mult = lineaDesdeLectura("3*", indice, PESO);
  assert.match(!mult.ok ? mult.mensaje : "", /3\*código/);
});

test("sin formato de balanza, un código 2x de 13 dígitos se busca como código común", () => {
  const r = lineaDesdeLectura(armarEtiquetaDeBalanza(PESO, "00201", 1.25), indice, null);
  assert.equal(r.ok, false);
  assert.match(!r.ok ? r.mensaje : "", /No hay ningún producto/);
});
