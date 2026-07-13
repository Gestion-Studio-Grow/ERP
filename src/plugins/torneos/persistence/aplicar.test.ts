// Tests de la ORQUESTACIÓN de persistencia (ADR-097, FASE 2). Ejercitan la regla dura
// "persiste solo si ok" sobre un `MemoriaTorneoStore` (sin tocar Neon). Los inputs
// válidos/ inválidos replican los que ya validan los 76 tests del motor (torneo.gestion).
import { test } from "node:test";
import assert from "node:assert/strict";

import motor, { type Config, type Pareja } from "../engine";
import { MemoriaTorneoStore } from "./memoria-store";
import { cargarResultado, marcarWO, crearYGuardar, aplicarMutacion } from "./aplicar";
import { TorneoNoEncontradoError } from "./store";

// ── Fixtures mínimos (espejo tipado de engine/tests/_fixtures.mjs) ────────────

const SEDES = [
  { id: "granwilly", nombre: "Gran Willy", canchas: 6, complejoSede: true },
  { id: "breakpoint", nombre: "Break Point", canchas: 5 },
];
const DIAS = [
  { fecha: "2026-08-01", desde: "08:00", hasta: "23:30" },
  { fecha: "2026-08-02", desde: "08:00", hasta: "23:30" },
  { fecha: "2026-08-08", desde: "08:00", hasta: "23:30" },
  { fecha: "2026-08-09", desde: "08:00", hasta: "23:30" },
];

function parejasCat(cat: string, n: number): Pareja[] {
  const arr: Pareja[] = [];
  for (let i = 1; i <= n; i++) {
    arr.push({
      id: cat.replace(/\s+/g, "") + "-" + i,
      categoria: cat,
      j1: { nombre: "J" + i + "a", apellido: "Ap" + i + "a" },
      j2: { nombre: "J" + i + "b", apellido: "Ap" + i + "b" },
      ranking: i,
    });
  }
  return arr;
}

const CAT = "Caballeros 7ma";
function configChica(): Config {
  return {
    categorias: { [CAT]: parejasCat(CAT, 8) },
    sedes: SEDES,
    dias: DIAS,
    slotMin: 90,
    descansoMin: 90,
    clasificanPorZona: 2,
    zonaDias: [0, 1],
    llaveDias: [2, 3],
    modo: "patron",
    semilla: 42,
  };
}

/** Torneo chico recién creado + el id de un partido de zona sin jugar. */
function torneoChicoSembrado() {
  const torneo = motor.crearTorneo(configChica());
  const midZona = torneo.zonas[CAT][0].partidos[0];
  return { torneo, midZona };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test("cargarResultado válido → ok y PERSISTE el snapshot", async () => {
  const store = new MemoriaTorneoStore();
  const { torneo, midZona } = torneoChicoSembrado();
  await store.guardar("t1", torneo);

  const r = await cargarResultado(store, "t1", midZona, { sets: [[6, 4], [3, 6], [7, 6]] });

  assert.equal(r.ok, true, JSON.stringify(r.errores));
  assert.equal(r.persistido, true);
  // Re-cargar del store: la mutación quedó guardada (no fue solo en memoria).
  const recargado = await store.cargar("t1");
  assert.ok(recargado);
  assert.ok(recargado.partidos[midZona].resultado, "el resultado quedó persistido");
  assert.equal(recargado.partidos[midZona].resultado?.ganador, "A");
});

test("cargarResultado inválido (partido inexistente) → NO persiste, snapshot intacto", async () => {
  const store = new MemoriaTorneoStore();
  const { torneo } = torneoChicoSembrado();
  await store.guardar("t1", torneo);
  const antes = store.snapshotCrudo("t1");

  const r = await cargarResultado(store, "t1", 99999, { sets: [[6, 2], [6, 3]] });

  assert.equal(r.ok, false);
  assert.equal(r.persistido, false);
  assert.ok(r.errores.length > 0, "reporta el error del motor");
  // El snapshot guardado NO cambió: el rechazo no escribió nada.
  assert.equal(store.snapshotCrudo("t1"), antes, "el snapshot rechazado quedó idéntico");
});

test("mutación sobre torneo inexistente → TorneoNoEncontradoError", async () => {
  const store = new MemoriaTorneoStore();
  await assert.rejects(
    () => cargarResultado(store, "no-existe", 1, { sets: [[6, 0], [6, 0]] }),
    TorneoNoEncontradoError,
  );
});

test("marcarWO válido → ok y persiste", async () => {
  const store = new MemoriaTorneoStore();
  const { torneo, midZona } = torneoChicoSembrado();
  await store.guardar("t1", torneo);

  const r = await marcarWO(store, "t1", midZona, "B");

  assert.equal(r.ok, true, JSON.stringify(r.errores));
  assert.equal(r.persistido, true);
  const recargado = await store.cargar("t1");
  assert.equal(recargado?.partidos[midZona].resultado?.wo, true);
});

test("crearYGuardar siembra el store y hace round-trip serializar/deserializar", async () => {
  const store = new MemoriaTorneoStore();
  const torneo = await crearYGuardar(store, "t1", configChica());

  assert.equal(store.tamano, 1);
  const recargado = await store.cargar("t1");
  assert.ok(recargado);
  // Round-trip fiel: misma cantidad de partidos y misma config esencial.
  assert.equal(
    Object.keys(recargado.partidos).length,
    Object.keys(torneo.partidos).length,
  );
  assert.equal(recargado.config.semilla, 42);
  assert.deepEqual(Object.keys(recargado.zonas), [CAT]);
});

test("aplicarMutacion es agnóstico del tipo de mutación (contrato genérico)", async () => {
  const store = new MemoriaTorneoStore();
  const { torneo } = torneoChicoSembrado();
  await store.guardar("t1", torneo);

  // Una mutación que el motor rechaza no persiste; una que acepta, sí. Acá probamos
  // el contrato genérico con una mutación identidad "rechazada" simulada.
  const rechazo = await aplicarMutacion(store, "t1", (t) => ({
    ok: false,
    errores: ["simulado"],
    advertencias: [],
    torneo: t,
  }));
  assert.equal(rechazo.persistido, false);
});
