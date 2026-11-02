import assert from "node:assert/strict";
import test from "node:test";
import { COSTO_LABEL, COSTOS_REFERENCIA, computar, normalizarDiseno, PIEZAS, type DisenoStand, type Pieza, type TipoPieza } from "./stand";

const NUEVAS: TipoPieza[] = ["PHOTOCALL", "ZONA_PRUEBA", "DESAFIO", "MURO_EXHIBICION", "MONITOR_55", "CINTA", "ARCO", "SILLON", "POUF", "ISLA_PRODUCTO", "BARRA"];

// Lote de 6 × 4 m con pared al fondo (península), como el del brief de la activación de Adidas.
const ADIDAS: DisenoStand = {
  version: 1,
  tipo: "PENINSULA",
  ancho: 6,
  fondo: 4,
  altoPared: 3,
  colorPared: "#FFFFFF",
  colorAcento: "#000000",
  piso: "VINILO",
  tarimaPiso: false,
  textoMarca: "Adidas",
  piezas: [
    { id: "a1", tipo: "MURO_EXHIBICION", x: -1.5, z: -1.75, giro: 0 },
    { id: "a2", tipo: "MONITOR_55", x: 1.25, z: -1.75, giro: 0 },
    { id: "a3", tipo: "PHOTOCALL", x: 2.75, z: -0.5, giro: 1 },
    { id: "a4", tipo: "ZONA_PRUEBA", x: -1.5, z: 0.25, giro: 0 },
    { id: "a5", tipo: "DESAFIO", x: 0.75, z: 0.5, giro: 0 },
    { id: "a6", tipo: "MOSTRADOR", x: -1.5, z: 1.5, giro: 0 },
    { id: "a7", tipo: "TOTEM", x: 0, z: 1.75, giro: 0 },
    { id: "a8", tipo: "DEPOSITO", x: 2.25, z: 1.5, giro: 0 },
  ],
};

const caja = (p: Pieza) => {
  const b = PIEZAS[p.tipo];
  const [w, f] = p.giro % 2 === 0 ? [b.ancho, b.fondo] : [b.fondo, b.ancho];
  return { x0: p.x - w / 2, x1: p.x + w / 2, z0: p.z - f / 2, z1: p.z + f / 2 };
};
const seSuperponen = (a: Pieza, b: Pieza) => {
  const p = caja(a);
  const q = caja(b);
  return p.x0 < q.x1 - 1e-9 && q.x0 < p.x1 - 1e-9 && p.z0 < q.z1 - 1e-9 && q.z0 < p.z1 - 1e-9;
};

test("cada pieza nueva tiene costo, rótulo y entra en un lote de 6 × 4", () => {
  for (const t of NUEVAS) {
    assert.ok(COSTOS_REFERENCIA[t] > 0, `costo de ${t}`);
    assert.equal(COSTO_LABEL[t], PIEZAS[t].label);
    assert.ok(PIEZAS[t].ancho <= 6 && PIEZAS[t].fondo <= 4 && PIEZAS[t].alto <= 3, `medidas de ${t}`);
  }
});

test("el armado de ejemplo del brief de Adidas queda como se lo armó: nada se mueve ni se descarta", () => {
  const d = normalizarDiseno(ADIDAS);
  assert.ok(d);
  assert.equal(d.piezas.length, ADIDAS.piezas.length);
  for (const [i, p] of d.piezas.entries()) {
    assert.equal(p.x, ADIDAS.piezas[i].x, `x de ${p.tipo}`);
    assert.equal(p.z, ADIDAS.piezas[i].z, `z de ${p.tipo}`);
  }
});

test("el armado de ejemplo no superpone piezas", () => {
  const d = normalizarDiseno(ADIDAS);
  assert.ok(d);
  for (let i = 0; i < d.piezas.length; i++) for (let j = i + 1; j < d.piezas.length; j++) assert.equal(seSuperponen(d.piezas[i], d.piezas[j]), false, `${d.piezas[i].tipo} con ${d.piezas[j].tipo}`);
});

test("el cómputo cuenta las piezas nuevas con su rubro y su unidad", () => {
  const d = normalizarDiseno({ ...ADIDAS, piezas: NUEVAS.map((tipo, i) => ({ id: `n${i}`, tipo, x: 0, z: 0, giro: 0 })) });
  assert.ok(d);
  assert.equal(d.piezas.length, NUEVAS.length);
  const lineas = computar(d);
  for (const t of NUEVAS) {
    const l = lineas.find((x) => x.clave === t);
    assert.ok(l, t);
    assert.equal(l.cantidad, 1);
    assert.equal(l.rubro, "Equipamiento");
  }
});
