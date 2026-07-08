import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizarCarrito,
  agregarAlCarrito,
  quitarDelCarrito,
  setCantidad,
  resumirCarrito,
  generarOrdenDemo,
  formatARS,
} from "../src/checkout";
import { BUNDLE, getPlantilla } from "../data/catalogo";

test("normalizarCarrito descarta slugs inválidos y basura", () => {
  const c = normalizarCarrito([
    { slug: "control-monotributo", cantidad: 2 },
    { slug: "no-existe", cantidad: 1 },
    { slug: 123, cantidad: 1 },
    "basura",
    null,
  ]);
  assert.equal(c.length, 1);
  assert.deepEqual(c[0], { slug: "control-monotributo", cantidad: 2 });
});

test("normalizarCarrito fusiona duplicados y piso de cantidad 1", () => {
  const c = normalizarCarrito([
    { slug: "sueldos-simple", cantidad: 1 },
    { slug: "sueldos-simple", cantidad: 3 },
    { slug: "finanzas-personales-ar", cantidad: 0 }, // 0 → descartado
    { slug: "finanzas-personales-ar", cantidad: -5 }, // negativo → descartado
  ]);
  assert.equal(c.find((l) => l.slug === "sueldos-simple")?.cantidad, 4);
  assert.equal(c.find((l) => l.slug === "finanzas-personales-ar"), undefined);
});

test("normalizarCarrito nunca lanza ante entrada no-array", () => {
  assert.deepEqual(normalizarCarrito(null), []);
  assert.deepEqual(normalizarCarrito("x"), []);
  assert.deepEqual(normalizarCarrito(undefined), []);
});

test("agregarAlCarrito suma cantidad si ya existe (inmutable)", () => {
  const c0: { slug: string; cantidad: number }[] = [];
  const c1 = agregarAlCarrito(c0, "caja-stock-kiosco", 1);
  const c2 = agregarAlCarrito(c1, "caja-stock-kiosco", 2);
  assert.equal(c2.find((l) => l.slug === "caja-stock-kiosco")?.cantidad, 3);
  assert.equal(c1.length, 1); // c1 no mutó
});

test("agregarAlCarrito ignora slug inexistente", () => {
  assert.deepEqual(agregarAlCarrito([], "fantasma", 1), []);
});

test("quitarDelCarrito elimina la línea", () => {
  const c = agregarAlCarrito(agregarAlCarrito([], "control-monotributo"), "sueldos-simple");
  const q = quitarDelCarrito(c, "control-monotributo");
  assert.equal(q.length, 1);
  assert.equal(q[0].slug, "sueldos-simple");
});

test("setCantidad a 0 o menos elimina", () => {
  const c = agregarAlCarrito([], "control-monotributo", 3);
  assert.deepEqual(setCantidad(c, "control-monotributo", 0), []);
  assert.equal(setCantidad(c, "control-monotributo", 5)[0].cantidad, 5);
});

test("resumirCarrito calcula totales con precio del catálogo", () => {
  const mono = getPlantilla("control-monotributo")!;
  const sueldos = getPlantilla("sueldos-simple")!;
  const c = setCantidad(agregarAlCarrito([], "control-monotributo"), "control-monotributo", 2);
  const c2 = agregarAlCarrito(c, "sueldos-simple", 1);
  const r = resumirCarrito(c2);
  assert.equal(r.totalItems, 3);
  assert.equal(r.totalUSD, mono.precioUSD * 2 + sueldos.precioUSD);
  assert.equal(r.totalARSref, mono.precioARSref * 2 + sueldos.precioARSref);
  assert.equal(r.vacio, false);
});

test("resumirCarrito soporta el bundle", () => {
  const r = resumirCarrito(agregarAlCarrito([], BUNDLE.slug));
  assert.equal(r.totalUSD, BUNDLE.precioUSD);
  assert.equal(r.lineas[0].nombre, BUNDLE.nombre);
});

test("resumirCarrito vacío", () => {
  const r = resumirCarrito([]);
  assert.equal(r.vacio, true);
  assert.equal(r.totalUSD, 0);
  assert.equal(r.totalItems, 0);
});

test("el cliente no puede inflar el precio desde el storage", () => {
  // aunque el storage traiga un 'precioUSD' falso, se ignora: sólo cuenta slug+cantidad.
  const r = resumirCarrito(
    normalizarCarrito([{ slug: "finanzas-personales-ar", cantidad: 1, precioUSD: 9999 } as unknown]),
  );
  assert.equal(r.totalUSD, getPlantilla("finanzas-personales-ar")!.precioUSD);
});

test("generarOrdenDemo es determinista y lleva prefijo DEMO", () => {
  const a = generarOrdenDemo(1_700_000_000_000);
  const b = generarOrdenDemo(1_700_000_000_000);
  assert.equal(a, b);
  assert.match(a, /^DEMO-[0-9A-Z]{8}$/);
  assert.notEqual(a, generarOrdenDemo(1_700_000_000_001));
});

test("formatARS agrupa en formato es-AR", () => {
  assert.equal(formatARS(32000), "$32.000");
  assert.equal(formatARS(99000.4), "$99.000");
});
