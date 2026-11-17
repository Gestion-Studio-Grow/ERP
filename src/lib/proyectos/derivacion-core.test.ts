import { test } from "node:test";
import assert from "node:assert/strict";
import { derivarConsulta, derivarProyecto, derivarStand, PIEZAS_EXPERIENCIA, REGLAS_TALLER } from "./derivacion-core";
import { PIEZAS, type TipoPieza } from "./stand";

const stand = (ancho: number, fondo: number, piezas: TipoPieza[] = ["MOSTRADOR", "TOTEM"], altoPared = 3) => ({
  version: 1,
  tipo: "LINEAL",
  ancho,
  fondo,
  altoPared,
  piezas: piezas.map((tipo, i) => ({ id: `p${i}`, tipo, x: 0, z: 0, giro: 0 })),
});

test("reglas del Taller: todas las piezas menos las de experiencia", () => {
  assert.equal(REGLAS_TALLER.m2Max, 18);
  assert.equal(REGLAS_TALLER.altoMax, 3);
  for (const p of PIEZAS_EXPERIENCIA) assert.ok(!REGLAS_TALLER.piezasTaller.includes(p), p);
  assert.equal(REGLAS_TALLER.piezasTaller.length, Object.keys(PIEZAS).length - PIEZAS_EXPERIENCIA.length);
});

test("3x3 con mostrador y tótem va al Taller", () => {
  const r = derivarStand(stand(3, 3));
  assert.equal(r.destino, "TALLER");
  assert.ok(r.motivos.length > 0);
});

test("6x3 = 18 m² va al Taller (borde incluido)", () => {
  assert.equal(derivarStand(stand(6, 3)).destino, "TALLER");
});

test("6x4 va a la Agencia y dice por qué", () => {
  const r = derivarStand(stand(6, 4));
  assert.equal(r.destino, "AGENCIA");
  assert.match(r.motivos.join(" "), /24 m²/);
});

test("pared de 4 m va a la Agencia", () => {
  const r = derivarStand(stand(3, 3, ["MOSTRADOR"], 4));
  assert.equal(r.destino, "AGENCIA");
  assert.match(r.motivos.join(" "), /doble altura/);
});

test("con photocall va a la Agencia", () => {
  const r = derivarStand(stand(3, 3, ["MOSTRADOR", "PHOTOCALL"]));
  assert.equal(r.destino, "AGENCIA");
  assert.match(r.motivos.join(" "), /Photocall/);
});

test("cada regla que falla aparece en los motivos", () => {
  const r = derivarStand(stand(6, 4, ["ARCO"], 4));
  assert.equal(r.destino, "AGENCIA");
  assert.equal(r.motivos.length, 3);
});

test("diseño basura o null va a la Agencia", () => {
  for (const basura of [null, undefined, "hola", 42, {}, { tipo: "CIRCULAR", ancho: 3, fondo: 3 }]) {
    assert.equal(derivarStand(basura).destino, "AGENCIA", String(basura));
  }
});

test("EXPERIENCIAS va todo a la Agencia aunque el stand sea de Taller", () => {
  const r = derivarProyecto({ servicio: "EXPERIENCIAS", stands: [stand(3, 3)] });
  assert.equal(r.destino, "AGENCIA");
  assert.equal(r.partes[0].destino, "AGENCIA");
});

test("ARQUITECTURA sin stands queda en la Agencia: falta el diseño", () => {
  const r = derivarProyecto({ servicio: "ARQUITECTURA", stands: [] });
  assert.equal(r.destino, "AGENCIA");
  assert.match(r.partes[0].motivos.join(" "), /[Ff]alta el diseño/);
});

test("ARQUITECTURA con un stand de Taller va al Taller", () => {
  assert.equal(derivarProyecto({ servicio: "ARQUITECTURA", stands: [stand(3, 3)] }).destino, "TALLER");
});

test("dos stands mixtos: PARTIDO", () => {
  const r = derivarProyecto({ servicio: "ARQUITECTURA", stands: [stand(3, 3), stand(10, 10)] });
  assert.equal(r.destino, "PARTIDO");
  assert.deepEqual(r.partes.map((p) => [p.indice, p.destino]), [[0, "TALLER"], [1, "AGENCIA"]]);
});

test("reglas propias pisan las provisionales", () => {
  assert.equal(derivarStand(stand(6, 4), { ...REGLAS_TALLER, m2Max: 30 }).destino, "TALLER");
});

test("consulta de activación con sampling va a la Agencia", () => {
  assert.equal(derivarConsulta("Activación con sampling en Lollapalooza").destino, "AGENCIA");
});

test("consulta «stand 3x3 para Expoagro» es candidato al Taller", () => {
  const r = derivarConsulta("stand 3x3 para Expoagro");
  assert.equal(r.destino, "CANDIDATO_TALLER");
  assert.match(r.motivos.join(" "), /diseño/);
});

test("consulta «stand 10x10 doble altura» va a la Agencia", () => {
  assert.equal(derivarConsulta("stand 10x10 doble altura").destino, "AGENCIA");
});

test("consulta sin stand, sin medidas o con lanzamiento va a la Agencia", () => {
  assert.equal(derivarConsulta("necesitamos ayuda con la marca").destino, "AGENCIA");
  assert.equal(derivarConsulta("un stand para la feria").destino, "AGENCIA");
  assert.equal(derivarConsulta("STAND 3x3 para el LANZAMIENTO").destino, "AGENCIA");
  assert.equal(derivarConsulta("Evento deportivo con stand 3x3").destino, "AGENCIA");
  assert.equal(derivarConsulta("").destino, "AGENCIA");
});
