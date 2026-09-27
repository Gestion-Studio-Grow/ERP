import { test } from "node:test";
import assert from "node:assert/strict";
import { buscarPorNombre, indexarPorCodigo, interpretarEntrada, resolverCodigo, type ProductoDeCaja } from "./lectura";
import { FORMATO_BALANZA_POR_DEFECTO, armarEtiquetaDeBalanza, type FormatoBalanza } from "./balanza";
import { conVerificador } from "./ean";

const COCA = conVerificador("779110000013");
const productos: ProductoDeCaja[] = [
  { id: "coca", name: "Gaseosa Coca-Cola 2,25 L", codigo: COCA, saleUnit: "UNIT", price: 4600, pricePerKg: null, seccion: "bebidas", presentacion: "2,25 L" },
  { id: "queso", name: "Queso cremoso", codigo: "00201", saleUnit: "WEIGHT", price: null, pricePerKg: 12990, seccion: "fiambreria", presentacion: "kg" },
  { id: "sinprecio", name: "Yerba sin precio", codigo: conVerificador("779110000020"), saleUnit: "UNIT", price: null, pricePerKg: null, seccion: "almacen", presentacion: "1 kg" },
  { id: "papa", name: "Papa", codigo: "00101", saleUnit: "WEIGHT", price: null, pricePerKg: 1490, seccion: "verduleria", presentacion: "kg" },
];
const indice = indexarPorCodigo(productos);

test("el Enter del lector con un EAN es un código; con letras, una búsqueda", () => {
  assert.deepEqual(interpretarEntrada(` ${COCA}\r`), { tipo: "codigo", codigo: COCA, multiplicador: null });
  assert.deepEqual(interpretarEntrada("coca cola"), { tipo: "busqueda", texto: "coca cola", multiplicador: null });
  assert.deepEqual(interpretarEntrada(""), { tipo: "vacia" });
});

test("multiplicador: '3*código', '3x código', '3 × código' y '3*' solo para el próximo", () => {
  assert.deepEqual(interpretarEntrada(`3*${COCA}`), { tipo: "codigo", codigo: COCA, multiplicador: 3 });
  assert.deepEqual(interpretarEntrada(`3x ${COCA}`), { tipo: "codigo", codigo: COCA, multiplicador: 3 });
  assert.deepEqual(interpretarEntrada(`3 × ${COCA}`), { tipo: "codigo", codigo: COCA, multiplicador: 3 });
  assert.deepEqual(interpretarEntrada("12*"), { tipo: "multiplicador", cantidad: 12 });
  assert.deepEqual(interpretarEntrada("2 x yogur"), { tipo: "busqueda", texto: "yogur", multiplicador: 2 });
  assert.equal(interpretarEntrada("0*").tipo, "invalida");
  assert.equal(interpretarEntrada("1000*").tipo, "invalida");
});

test("un EAN del catálogo entra por 1, o por lo que diga el multiplicador", () => {
  const r = resolverCodigo(COCA, indice, FORMATO_BALANZA_POR_DEFECTO);
  assert.ok(r.ok && r.producto.id === "coca" && r.cantidad === 1 && r.importe === null);
  const r3 = resolverCodigo(COCA, indice, FORMATO_BALANZA_POR_DEFECTO, 3);
  assert.ok(r3.ok && r3.cantidad === 3);
});

test("una etiqueta de balanza con peso trae el producto del PLU y su peso", () => {
  const etiqueta = armarEtiquetaDeBalanza(FORMATO_BALANZA_POR_DEFECTO, "201", 0.348);
  const r = resolverCodigo(etiqueta, indice, FORMATO_BALANZA_POR_DEFECTO);
  assert.ok(r.ok);
  if (r.ok) assert.deepEqual([r.producto.id, r.cantidad, r.importe, r.porBalanza], ["queso", 0.348, null, true]);
});

test("una etiqueta con importe cobra el importe y deduce el peso", () => {
  const f: FormatoBalanza = { prefijos: ["20"], digitosProducto: 5, contenido: "importe", decimales: 0 };
  const r = resolverCodigo(armarEtiquetaDeBalanza(f, "201", 4520), indice, f);
  assert.ok(r.ok);
  if (r.ok) assert.deepEqual([r.producto.id, r.cantidad, r.importe], ["queso", 0.348, 4520]);
});

test("etiqueta con PLU desconocido, verificador roto o multiplicador: se dice qué pasa", () => {
  const desconocido = resolverCodigo(armarEtiquetaDeBalanza(FORMATO_BALANZA_POR_DEFECTO, "999", 1), indice, FORMATO_BALANZA_POR_DEFECTO);
  assert.ok(!desconocido.ok && /00999/.test(desconocido.mensaje));
  const bien = armarEtiquetaDeBalanza(FORMATO_BALANZA_POR_DEFECTO, "201", 1);
  const roto = bien.slice(0, 12) + String((Number(bien[12]) + 3) % 10);
  assert.ok(!resolverCodigo(roto, indice, FORMATO_BALANZA_POR_DEFECTO).ok);
  assert.ok(!resolverCodigo(bien, indice, FORMATO_BALANZA_POR_DEFECTO, 2).ok);
});

test("un producto por peso leído por su PLU pide el peso; no acepta multiplicador", () => {
  const r = resolverCodigo("00201", indice, FORMATO_BALANZA_POR_DEFECTO);
  assert.ok(r.ok && r.cantidad === null && !r.porBalanza);
  assert.ok(!resolverCodigo("00201", indice, FORMATO_BALANZA_POR_DEFECTO, 2).ok);
  // El PLU también se encuentra tipeado sin los ceros.
  const corto = resolverCodigo("201", indice, FORMATO_BALANZA_POR_DEFECTO);
  assert.ok(corto.ok && corto.producto.id === "queso");
});

test("código desconocido: si el verificador no cierra, se leyó mal; si cierra, no está cargado", () => {
  const malLeido = COCA.slice(0, 12) + String((Number(COCA[12]) + 1) % 10);
  const r1 = resolverCodigo(malLeido, indice, FORMATO_BALANZA_POR_DEFECTO);
  assert.ok(!r1.ok && /se leyó mal/.test(r1.mensaje));
  const otro = conVerificador("779999999999");
  const r2 = resolverCodigo(otro, indice, FORMATO_BALANZA_POR_DEFECTO);
  assert.ok(!r2.ok && /cargalo en el catálogo/.test(r2.mensaje));
});

test("un producto sin precio no entra al ticket y dice dónde cargarlo", () => {
  const r = resolverCodigo(conVerificador("779110000020"), indice, FORMATO_BALANZA_POR_DEFECTO);
  assert.ok(!r.ok && /no tiene precio/.test(r.mensaje));
});

test("sin balanza configurada, un código 2x es un código más", () => {
  const etiqueta = armarEtiquetaDeBalanza(FORMATO_BALANZA_POR_DEFECTO, "201", 1);
  assert.ok(!resolverCodigo(etiqueta, indice, null).ok);
});

test("la búsqueda por nombre exige todas las palabras, sin acentos ni mayúsculas", () => {
  assert.deepEqual(buscarPorNombre(productos, "coca 2,25").map((p) => p.id), ["coca"]);
  assert.deepEqual(buscarPorNombre(productos, "QUESO").map((p) => p.id), ["queso"]);
  assert.deepEqual(buscarPorNombre(productos, "  "), []);
});

test("buscar por nombre no mira acentos ni el orden de las palabras (la usan la caja y Ofertas)", () => {
  const productos = [
    { id: "a", name: "Detergente Magistral limón 500 ml" },
    { id: "b", name: "Detergente Magistral 300 ml" },
  ];
  assert.deepEqual(buscarPorNombre(productos, "magistral limon").map((p) => p.id), ["a"]);
  assert.deepEqual(buscarPorNombre(productos, "limón detergente").map((p) => p.id), ["a"]);
  assert.deepEqual(buscarPorNombre(productos, "MAGISTRAL").map((p) => p.id), ["a", "b"]);
});
