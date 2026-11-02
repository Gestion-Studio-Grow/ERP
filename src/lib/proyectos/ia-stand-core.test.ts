import assert from "node:assert/strict";
import test from "node:test";
import { describirStand, ENFOQUES_STAND, ESQUEMA_STAND, INSTRUCCIONES_STAND, leerStandPropuesto, metricasStand } from "./ia-stand-core";
import { LIMITES, PIEZAS } from "./stand";

const buena = {
  tipo: "ESQUINA",
  ancho: 6,
  fondo: 4,
  altoPared: 3,
  colorPared: "#E3E1D4",
  colorAcento: "#0049D5",
  piso: "ALFOMBRA",
  tarimaPiso: false,
  textoMarca: "Adidas",
  piezas: [
    { tipo: "MOSTRADOR", x: 0, z: 1, giro: 0 },
    { tipo: "PANTALLA", x: 0, z: -1.8, giro: 0 },
  ],
  notas: "Medidas a confirmar con el cliente.",
};

test("un borrador válido vuelve como diseño del armador, con sus notas", () => {
  const r = leerStandPropuesto(JSON.stringify(buena));
  assert.ok(r);
  assert.equal(r.diseno.tipo, "ESQUINA");
  assert.equal(r.diseno.piezas.length, 2);
  assert.equal(r.diseno.textoMarca, "Adidas");
  assert.equal(r.notas, "Medidas a confirmar con el cliente.");
});

test("lo que la IA manda fuera de rango se corrige en vez de llegar a la base", () => {
  const r = leerStandPropuesto(JSON.stringify({ ...buena, ancho: 500, fondo: 0.1, altoPared: 99, colorPared: "rojo", piso: "ORO", piezas: [{ tipo: "MOSTRADOR", x: 90, z: -90, giro: 7 }] }));
  assert.ok(r);
  assert.equal(r.diseno.ancho, LIMITES.max);
  assert.equal(r.diseno.fondo, LIMITES.min);
  assert.equal(r.diseno.altoPared, LIMITES.altoMax);
  assert.equal(r.diseno.colorPared, "#E3E1D4");
  assert.equal(r.diseno.piso, "ALFOMBRA");
  const p = r.diseno.piezas[0];
  assert.ok(Math.abs(p.x) <= r.diseno.ancho / 2 && Math.abs(p.z) <= r.diseno.fondo / 2);
  assert.ok(p.giro >= 0 && p.giro <= 3);
});

test("las piezas que no existen se descartan y un borrador sin piezas no sirve", () => {
  const r = leerStandPropuesto(JSON.stringify({ ...buena, piezas: [{ tipo: "HELICOPTERO", x: 0, z: 0, giro: 0 }, { tipo: "TOTEM", x: 1, z: 0, giro: 0 }] }));
  assert.ok(r);
  assert.deepEqual(r.diseno.piezas.map((p) => p.tipo), ["TOTEM"]);
  assert.equal(leerStandPropuesto(JSON.stringify({ ...buena, piezas: [{ tipo: "HELICOPTERO", x: 0, z: 0, giro: 0 }] })), null);
});

test("una respuesta que no es JSON, o es otra cosa, se rechaza", () => {
  assert.equal(leerStandPropuesto("Acá va tu stand: ..."), null);
  assert.equal(leerStandPropuesto("null"), null);
  assert.equal(leerStandPropuesto(JSON.stringify({ ...buena, tipo: "CASTILLO" })), null);
});

test("el esquema y las instrucciones nombran todas las piezas y todos los tipos", () => {
  for (const k of Object.keys(PIEZAS)) {
    assert.ok(INSTRUCCIONES_STAND.includes(k), k);
    assert.ok((ESQUEMA_STAND.properties.piezas.items.properties.tipo.enum as readonly string[]).includes(k));
  }
  for (const t of ["LINEAL", "ESQUINA", "PENINSULA", "ISLA"]) assert.ok(INSTRUCCIONES_STAND.includes(t), t);
  assert.equal(ESQUEMA_STAND.additionalProperties, false);
});

test("el stand se describe en una línea con medidas, piezas y controles, sin costos", () => {
  const r = leerStandPropuesto(JSON.stringify({ ...buena, piezas: [...buena.piezas, { tipo: "POUF", x: -2, z: 1, giro: 0 }, { tipo: "POUF", x: 2, z: 1, giro: 0 }] }));
  assert.ok(r);
  const t = describirStand("Opción 1", r.diseno);
  assert.match(t, /Opción 1 · Esquina/);
  assert.match(t, /lote de 6 × 4 m/);
  assert.match(t, /2 × Pouf/);
  assert.match(t, /marca «Adidas»/);
  assert.match(t, /sin superposiciones/);
  assert.doesNotMatch(t, /\$|costo|precio/i);
});

test("las métricas cuentan piezas, ocupación y errores de control", () => {
  const r = leerStandPropuesto(JSON.stringify({ ...buena, piezas: [{ tipo: "MOSTRADOR", x: 0, z: 0, giro: 0 }, { tipo: "MOSTRADOR", x: 0.5, z: 0, giro: 0 }] }));
  assert.ok(r);
  const mt = metricasStand(r.diseno);
  assert.equal(mt.piezas, 2);
  assert.equal(mt.errores, 1);
  assert.equal(mt.ocupacion, Math.round(((1.5 * 0.6 * 2) / 24) * 100));
});

test("hay tres enfoques distintos para las alternativas", () => {
  assert.equal(ENFOQUES_STAND.length, 3);
  assert.equal(new Set(ENFOQUES_STAND.map((e) => e.clave)).size, 3);
});
