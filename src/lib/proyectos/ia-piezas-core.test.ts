import assert from "node:assert/strict";
import test from "node:test";
import { ESQUEMA_PIEZAS, leerPiezasPropuestas, MAX_PIEZAS_PROPUESTAS } from "./ia-piezas-core";

const buena = {
  piezas: [
    { nombre: "Render de la entrada", especificacion: "Vista desde el pasillo, 1920 × 1080, con la marca." },
    { nombre: "Plano de distribución", especificacion: "Planta con medidas y ubicación de cada pieza." },
    { nombre: "Presentación para el cliente", especificacion: "Diez láminas con concepto, vistas y materiales." },
  ],
  nota: "Faltan las medidas definitivas del lote.",
};

test("una respuesta válida vuelve con sus piezas y su nota", () => {
  const r = leerPiezasPropuestas(JSON.stringify(buena), []);
  assert.ok(r);
  assert.equal(r.piezas.length, 3);
  assert.equal(r.nota, "Faltan las medidas definitivas del lote.");
});

test("no repite las piezas que ya existen ni las repetidas entre sí, sin importar acentos o mayúsculas", () => {
  const r = leerPiezasPropuestas(JSON.stringify({ ...buena, piezas: [...buena.piezas, { nombre: "RENDER DE LA ENTRADA", especificacion: "otra vez" }, { nombre: "Planos de distribución", especificacion: "x" }] }), ["render de la entrada"]);
  assert.ok(r);
  assert.deepEqual(r.piezas.map((p) => p.nombre), ["Plano de distribución", "Presentación para el cliente", "Planos de distribución"]);
});

test("se recorta lo largo, se descarta lo vacío y hay un tope", () => {
  const muchas = Array.from({ length: 20 }, (_, i) => ({ nombre: `Pieza ${i}`, especificacion: "e".repeat(900) }));
  const r = leerPiezasPropuestas(JSON.stringify({ piezas: [{ nombre: "", especificacion: "sin nombre" }, { nombre: 5, especificacion: 1 }, ...muchas], nota: "n".repeat(900) }), []);
  assert.ok(r);
  assert.equal(r.piezas.length, MAX_PIEZAS_PROPUESTAS);
  assert.ok(r.piezas.every((p) => p.especificacion.length <= 300 && p.nombre.length <= 120));
  assert.ok(r.nota.length <= 300);
});

test("lo que no se puede leer o no trae piezas útiles se rechaza", () => {
  for (const malo of ["no es json", "null", "[]", JSON.stringify({ piezas: "x" }), JSON.stringify({ piezas: [], nota: "" }), JSON.stringify({ piezas: [{ nombre: "Ya existe", especificacion: "" }], nota: "" })]) {
    assert.equal(leerPiezasPropuestas(malo, ["Ya existe"]), null, malo);
  }
});

test("el esquema exige piezas con nombre y especificación y no admite campos de más", () => {
  assert.equal(ESQUEMA_PIEZAS.additionalProperties, false);
  assert.deepEqual(ESQUEMA_PIEZAS.properties.piezas.items.required, ["nombre", "especificacion"]);
});
