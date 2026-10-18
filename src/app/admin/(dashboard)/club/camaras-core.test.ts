// Lo puro de las cámaras simuladas de la demo (camaras-core.ts): una por cancha más las tres generales, lo que dice
// cada una (quién juega y si debe, la luz prendida sin juego) y el dibujo con un lienzo falso (camaras-escena.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import * as M from "@/lib/club/motor.mjs";
import type { Ahora } from "@/lib/club/motor.mjs";
import { armarCamaras, posicionesDeJugadores } from "./camaras-core";
import { dibujarCamara } from "./camaras-escena";

const HOY = "2026-10-17";
const AHORA: Ahora = { fecha: HOY, min: 19 * 60 + 10 };

test("una cámara por cancha (con su id) y después recepción, bar y estacionamiento, numeradas CAM 01…", () => {
  const e = M.generarDemo(HOY, AHORA.min);
  const v = armarCamaras(e, AHORA);
  assert.equal(v.camaras.length, e.canchas.length + 3);
  assert.deepEqual(
    v.camaras.slice(0, e.canchas.length).map((c) => c.id),
    e.canchas.map((c) => c.camara ?? `cam-${c.id}`),
  );
  assert.deepEqual(
    v.camaras.slice(-3).map((c) => [c.nombre, c.escena, c.pie]),
    [
      ["Recepción y caja", "recepcion", "General"],
      ["Delicias (bar)", "bar", "General"],
      ["Estacionamiento", "estacionamiento", "General"],
    ],
  );
  assert.equal(v.camaras[0].rotulo, `CAM 01 · ${e.canchas[0].nombre}`);
  assert.equal(v.camaras[0].numero, "CAM 01");
  assert.equal(v.camaras.at(-1)!.rotulo, `CAM ${String(v.camaras.length).padStart(2, "0")} · Estacionamiento`);
  assert.equal(v.sello, `${HOY} 19:10`);
  for (const c of v.camaras) assert.equal(c.etiqueta, `Cámara ${c.nombre}: ${c.pie}. Ampliar`);
});

test("la cámara de la cancha dice quién juega y si debe; sin juego, si quedó la luz prendida", () => {
  const e = M.generarDemo(HOY, AHORA.min);
  const enCancha = e.reservas.find((r) => r.fecha === HOY && r.estado === "en_cancha");
  assert.ok(enCancha, "la demo de las 19:10 tiene turnos jugándose");
  const v = armarCamaras(e, AHORA);
  const cam = v.camaras.find((c) => c.nombre === M.cancha(e, enCancha.canchaId)!.nombre)!;
  const debe = M.saldo(enCancha);
  assert.equal(cam.pie, `${enCancha.titular} · ${debe > 0 ? `debe ${M.pesos(debe)}` : "al día"}`);
  assert.equal(cam.jugadores, enCancha.jugadores.length);

  // Una cancha sin juego: sin luz, «Sin juego»; con la luz prendida, se dice.
  const libre = e.canchas.find((c) => !e.reservas.some((r) => r.fecha === HOY && r.canchaId === c.id && r.estado === "en_cancha"));
  if (libre) {
    e.luces[libre.id] = false;
    assert.equal(armarCamaras(e, AHORA).camaras.find((c) => c.nombre === libre.nombre)!.pie, "Sin juego");
    e.luces[libre.id] = true;
    const conLuz = armarCamaras(e, AHORA).camaras.find((c) => c.nombre === libre.nombre)!;
    assert.deepEqual([conLuz.pie, conLuz.luz, conLuz.jugadores], ["Sin juego · luz prendida", true, 0]);
  }
  // La firma cambia si cambia lo que se ve (para repintar el cuadro quieto).
  assert.notEqual(armarCamaras(e, AHORA).firma, armarCamaras(e, { ...AHORA, min: AHORA.min + 1 }).firma);
});

test("posiciones de los jugadores: dos de cada lado; con 3 se dibujan 4; nadie, nada", () => {
  assert.equal(posicionesDeJugadores(0).length, 0);
  assert.equal(posicionesDeJugadores(1).length, 2);
  assert.equal(posicionesDeJugadores(3).length, 4);
  assert.equal(posicionesDeJugadores(4).length, 4);
  for (const [x, y] of posicionesDeJugadores(4)) assert.ok(Math.abs(x) < 0.5 && Math.abs(y) < 0.5);
});

test("el dibujo: pinta el fondo del tamaño del lienzo y el sello con los segundos", () => {
  const textos: string[] = [];
  const rects: number[][] = [];
  const canvas = { width: 320, height: 200 };
  /* eslint-disable @typescript-eslint/no-explicit-any -- lienzo falso */
  const ctx: any = new Proxy(
    {},
    {
      get(_, k) {
        if (k === "canvas") return canvas;
        if (k === "fillText") return (t: string) => textos.push(t);
        if (k === "fillRect") return (...a: number[]) => rects.push(a);
        return () => {};
      },
      set: () => true,
    },
  );
  for (const escena of ["cancha", "recepcion", "bar", "estacionamiento"] as const) {
    textos.length = 0;
    rects.length = 0;
    dibujarCamara(ctx, { escena, luz: true, jugadores: 4 }, 61_500, `${HOY} 19:10`);
    assert.deepEqual(rects[0], [0, 0, 320, 200], escena);
    assert.deepEqual(textos, [`${HOY} 19:10:01`], escena);
  }
});
