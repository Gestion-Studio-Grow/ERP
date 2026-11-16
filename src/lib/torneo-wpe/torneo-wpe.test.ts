// El torneo WPE sin base: el motor sale del sitio sin tocarlo, permisos por rol, validación de comandos, poda y la
// proyección de la pantalla (GSG-PLAT-016).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { aplicarComando, leerComando, permisoQuePide } from "./comandos";
import { comprimirTorneo, descomprimirTorneo, idsParaPodar, versionDeAccion } from "./estado-repo";
import { ARCHIVO_DEL_SITIO, evaluarMotor, extraerMotor, motorDelTorneo } from "./motor.server";
import { EXCEPCION_RESULTADOS, nivelEnElTorneo, puedeEnElTorneo } from "./permisos";
import { vistaDelTorneo } from "./vista";

const motor = motorDelTorneo();
const demo = () => motor.generarTorneoEnCurso(motor.CONFIG_DEMO, 0.6, 2026);

test("el motor del servidor es el del sitio: se extrae del <script id=wpeEngine> y publica la gestión", () => {
  const html = readFileSync(join(process.cwd(), ARCHIVO_DEL_SITIO), "utf8");
  const codigo = extraerMotor(html);
  assert.ok(codigo.includes("WPETorneo"));
  assert.ok(html.includes(codigo), "el texto del motor es un trozo literal del sitio (no hay copia aparte)");
  assert.throws(() => extraerMotor("<html></html>"), /No se encontró el motor/);
  assert.throws(() => evaluarMotor("module.exports = {}"), /no publica/);
});

test("el motor del servidor arma el mismo torneo que el sitio (determinístico con la semilla 2026)", () => {
  const a = motor.serializar(demo());
  const b = motor.serializar(demo());
  assert.equal(a, b);
  const t = motor.deserializar(a);
  assert.equal(Object.keys(t.config.categorias).length, 17);
  assert.equal(t.config.sedes.length, 13);
});

test("permisos: el dueño y el organizador gestionan, el jugador sólo ve, el agente carga resultados", () => {
  assert.equal(nivelEnElTorneo({ role: "OWNER", overrides: [] }), "gestionar");
  assert.equal(nivelEnElTorneo({ role: "RECEPTION", overrides: [] }), "gestionar");
  assert.equal(nivelEnElTorneo({ role: "PROFESSIONAL", overrides: [] }), "ver");
  const agente = { role: "PROFESSIONAL" as const, overrides: [{ capability: EXCEPCION_RESULTADOS, allowed: true }] };
  assert.equal(nivelEnElTorneo(agente), "resultados");
  assert.equal(puedeEnElTorneo(agente, "resultados"), true);
  assert.equal(puedeEnElTorneo(agente, "gestionar"), false);
  // Una excepción apagada no le saca nada al organizador, y ninguna otra excepción sube al jugador.
  assert.equal(nivelEnElTorneo({ role: "RECEPTION", overrides: [{ capability: EXCEPCION_RESULTADOS, allowed: false }] }), "gestionar");
  assert.equal(nivelEnElTorneo({ role: "PROFESSIONAL", overrides: [{ capability: "torneo:gestionar", allowed: true }, { capability: "agenda:manage", allowed: true }] }), "ver");
  assert.equal(nivelEnElTorneo({ role: "PROFESSIONAL", overrides: [{ capability: EXCEPCION_RESULTADOS, allowed: false }] }), "ver");
});

test("comandos: qué permiso pide cada uno", () => {
  assert.equal(permisoQuePide("resultado"), "resultados");
  assert.equal(permisoQuePide("wo"), "resultados");
  assert.equal(permisoQuePide("borrar"), "gestionar");
  assert.equal(permisoQuePide("reprogramar"), "gestionar");
});

test("comandos: se valida la forma antes de tocar el motor", () => {
  assert.equal(leerComando({ tipo: "resultado", partidoId: "12", sets: [[6, 3], [6, 4]] }).ok, true);
  assert.equal(leerComando({ tipo: "resultado", partidoId: 12, sets: [[6, 3], [4, 6], [7, 6]] }).ok, true);
  for (const malo of [
    null,
    { tipo: "resultado", partidoId: "12", sets: [[6, 3]] },
    { tipo: "resultado", partidoId: "12", sets: [[6, 3], [6, 9]] },
    { tipo: "resultado", partidoId: "12", sets: [[6, 3], [6, "4"]] },
    { tipo: "resultado", partidoId: "abc", sets: [[6, 3], [6, 4]] },
    { tipo: "resultado", partidoId: "__proto__", sets: [[6, 3], [6, 4]] },
    { tipo: "wo", partidoId: "12", perdedor: "C" },
    { tipo: "reprogramar", partidoId: "12", destino: { sede: "x y", cancha: 1, dia: "2026-08-01", hora: "08:00" } },
    { tipo: "reprogramar", partidoId: "12", destino: { sede: "kuro", cancha: 0, dia: "2026-08-01", hora: "08:00" } },
    { tipo: "generar", partidoId: "12" },
    { tipo: "borrarTodo", partidoId: "12" },
  ]) {
    assert.equal(leerComando(malo).ok, false, JSON.stringify(malo));
  }
});

test("aplicar: cargar, W.O. y borrar dejan el rastro antes → después; el motor rechaza lo imposible", () => {
  const t = demo();
  const libre = Object.values(t.partidos).find((p) => !p.resultado && !p._esBye && p._resueltoA && p._resueltoB && p._resueltoA !== "BYE" && p._resueltoB !== "BYE")!;
  const id = String(libre.id);
  const r = aplicarComando(motor, t, { tipo: "resultado", partidoId: id, sets: [[6, 3], [6, 4]] });
  assert.ok(r.ok);
  assert.deepEqual(r.rastro.antes, null);
  assert.deepEqual(r.rastro.despues, { sets: [[6, 3], [6, 4]], ganador: "A" });
  const b = aplicarComando(motor, r.torneo, { tipo: "borrar", partidoId: id });
  assert.ok(b.ok);
  assert.deepEqual(b.rastro.despues, null);
  const w = aplicarComando(motor, b.torneo, { tipo: "wo", partidoId: id, perdedor: "A" });
  assert.ok(w.ok && (w.rastro.despues as { wo: boolean }).wo === true);
  const imposible = aplicarComando(motor, demo(), { tipo: "resultado", partidoId: id, sets: [[6, 3], [3, 6]] });
  assert.equal(imposible.ok, false);
  assert.equal(aplicarComando(motor, demo(), { tipo: "borrar", partidoId: "999999" }).ok, false);
});

test("la foto viaja comprimida y vuelve igual", () => {
  const t = demo();
  const gz = comprimirTorneo(motor, t);
  assert.ok(gz.length < 200_000, `la foto pesa ${gz.length} bytes en base64`);
  assert.equal(motor.serializar(descomprimirTorneo(motor, gz)), motor.serializar(t));
});

test("versión por action y poda: quedan la vigente, 10 anteriores y la de generación", () => {
  assert.equal(versionDeAccion("resultado:7"), 7);
  assert.equal(versionDeAccion("generar:1"), 1);
  assert.equal(versionDeAccion("torneo.resultado"), null);
  const metas = Array.from({ length: 15 }, (_, i) => ({ id: `f${i + 1}`, version: i + 1 }));
  const borrar = idsParaPodar(metas);
  assert.deepEqual(borrar.sort(), ["f2", "f3", "f4"].sort());
  assert.deepEqual(idsParaPodar(metas.slice(0, 11)), []);
});

test("la vista de una categoría: nombres, lugar y resultado, sin los BYE", () => {
  const v = vistaDelTorneo(demo(), "Damas 4ta");
  assert.equal(v.categoria, "Damas 4ta");
  assert.ok(v.partidos.length > 0);
  assert.ok(v.partidos.every((p) => p.codigo && p.parejaA && p.parejaB));
  assert.ok(v.partidos.some((p) => p.resultado !== null));
  assert.equal(vistaDelTorneo(demo(), "no-existe").categoria, v.categorias[0]);
});
