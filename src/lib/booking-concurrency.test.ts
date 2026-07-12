import { test } from "node:test";
import assert from "node:assert/strict";
import { hasOverlap, withBuffer, type Interval } from "./booking-slots";
import { BUFFER_MIN } from "./business-config";

// ============================================================================
// TEST DE CONCURRENCIA — overbooking de turnos (DB-4 / ADR-004 / ADR-023 F2).
// ============================================================================
//
// Cierra el hueco de cobertura del motor de turnos: no había un test que modelara
// la carrera de dos reservas del MISMO hueco (doble-click / dos clientes a la vez).
// Mismo enfoque probado en `settlement/collection-concurrency.test.ts`: se modela
// la frontera transaccional en memoria reusando las guardas REALES de choque
// (`withBuffer` + `hasOverlap` + `BUFFER_MIN`, las mismas que usa
// `assertSlotAvailable` dentro de `bookingTransaction`); lo ÚNICO simulado es el
// control de concurrencia que en prod da `bookingTransaction({isolationLevel:
// 'Serializable'})` + su reintento ante conflicto de serialización (40001/P2034).
//
// La regla real (booking-core.ts:assertSlotAvailable): al reservar [s,e) se expande
// con el buffer de limpieza y se busca choque contra los turnos vivos; si hay
// choque, se rechaza. Bajo Serializable, si otra tx commitea un turno en conflicto
// entre la lectura y la escritura, la nuestra aborta y REINTENTA re-leyendo — y en
// el reintento ya ve el turno ajeno y rechaza. Sin Serializable, ambas escriben
// contra su lectura vieja → dos turnos pisados (overbooking, el bug de DB-4).

const at = (hhmm: string): Date => new Date(`2026-07-13T${hhmm}:00.000Z`);
const slot = (start: string, end: string): Interval => ({ startsAt: at(start), endsAt: at(end) });

interface Schedule {
  committed: Interval[]; // turnos ya escritos (fuente de verdad de la ocupación)
  version: number; // se incrementa en cada commit (proxy del snapshot serializable)
}

interface AttemptResult {
  ok: boolean;
  error?: string;
}

// Un intento de reserva: aplica el MISMO chequeo de choque que assertSlotAvailable
// (buffer + hasOverlap) sobre la lista de turnos LEÍDA. Al commitear, si el modelo
// es serializable y la versión cambió desde la lectura, REINTENTA re-leyendo el
// estado ya commiteado (lo que hace el retry de bookingTransaction). Si no es
// serializable, escribe con la lectura vieja (el bug de overbooking).
function commit(
  store: Schedule,
  want: Interval,
  readCommitted: Interval[],
  readVersion: number,
  serializable: boolean,
  depth = 0,
): AttemptResult {
  const buffered = withBuffer(want.startsAt, want.endsAt, BUFFER_MIN);
  if (hasOverlap(buffered.startsAt, buffered.endsAt, readCommitted)) {
    return { ok: false, error: "SLOT_TAKEN" };
  }
  if (serializable && store.version !== readVersion) {
    if (depth > 10) return { ok: false, error: "MAX_RETRIES" };
    return commit(store, want, [...store.committed], store.version, serializable, depth + 1);
  }
  store.committed.push(want);
  store.version += 1;
  return { ok: true };
}

// Dos reservas que LEEN AMBAS el mismo snapshot inicial (la carrera): A commitea
// primero; B arrastra su lectura vieja.
function raceTwo(store: Schedule, a: Interval, b: Interval, serializable: boolean) {
  const readVersion = store.version;
  const readA = [...store.committed];
  const readB = [...store.committed];
  const resA = commit(store, a, readA, readVersion, serializable);
  const resB = commit(store, b, readB, readVersion, serializable);
  return { resA, resB };
}

test("BUG (sin serializable): dos reservas del MISMO hueco → ambas entran → overbooking", () => {
  const store: Schedule = { committed: [], version: 0 };
  const { resA, resB } = raceTwo(store, slot("10:00", "10:30"), slot("10:00", "10:30"), false);
  assert.ok(resA.ok);
  assert.ok(resB.ok);
  assert.equal(store.committed.length, 2, "el bug DEJA dos turnos pisados en el mismo hueco");
});

test("FIX (serializable): dos reservas del MISMO hueco → una gana, la otra se rechaza, nunca overbooking", () => {
  const store: Schedule = { committed: [], version: 0 };
  const { resA, resB } = raceTwo(store, slot("10:00", "10:30"), slot("10:00", "10:30"), true);
  const oks = [resA, resB].filter((r) => r.ok);
  const rejected = [resA, resB].filter((r) => !r.ok);
  assert.equal(oks.length, 1, "exactamente una reserva debe entrar");
  assert.equal(rejected.length, 1, "la otra debe rechazarse");
  assert.equal(rejected[0].error, "SLOT_TAKEN");
  assert.equal(store.committed.length, 1, "solo UN turno en la agenda");
});

test("FIX (serializable): dos huecos que NO se pisan → ambos entran (sin falso conflicto)", () => {
  const store: Schedule = { committed: [], version: 0 };
  const { resA, resB } = raceTwo(store, slot("10:00", "10:30"), slot("15:00", "15:30"), true);
  assert.ok(resA.ok);
  assert.ok(resB.ok);
  assert.equal(store.committed.length, 2);
});

test("FIX (serializable): buffer de limpieza — un hueco pegado con menos de BUFFER_MIN de aire se rechaza", () => {
  // Primer turno 10:00–10:30; segundo 10:35–11:05 → sólo 5 min de aire (< 10) → choca por buffer.
  assert.equal(BUFFER_MIN, 10, "este test asume BUFFER_MIN=10 (business-config)");
  const store: Schedule = { committed: [], version: 0 };
  const { resA, resB } = raceTwo(store, slot("10:00", "10:30"), slot("10:35", "11:05"), true);
  assert.ok(resA.ok);
  assert.equal(resB.ok, false);
  assert.equal(resB.error, "SLOT_TAKEN");
  assert.equal(store.committed.length, 1);
});

test("FIX (serializable): buffer respetado — con exactamente BUFFER_MIN de aire, el segundo entra", () => {
  // 10:00–10:30 y 10:40–11:10 → 10 min de aire = BUFFER_MIN → NO choca.
  const store: Schedule = { committed: [], version: 0 };
  const { resA, resB } = raceTwo(store, slot("10:00", "10:30"), slot("10:40", "11:10"), true);
  assert.ok(resA.ok);
  assert.ok(resB.ok, "con el aire justo de buffer, el segundo turno es válido");
  assert.equal(store.committed.length, 2);
});

test("FIX (serializable): dos turnos ADYACENTES exactos (bordes estrictos) — el buffer los separa igual", () => {
  // 10:00–10:30 y 10:30–11:00 pegados: sin buffer no se solapan (bordes estrictos),
  // pero con BUFFER_MIN sí necesitan aire → el segundo se rechaza. Verifica que el
  // buffer se aplica de verdad y no queda un turno sin margen de limpieza.
  const store: Schedule = { committed: [], version: 0 };
  const { resA, resB } = raceTwo(store, slot("10:00", "10:30"), slot("10:30", "11:00"), true);
  assert.ok(resA.ok);
  assert.equal(resB.ok, false, "pegados sin aire → rechazado por buffer");
  assert.equal(store.committed.length, 1);
});
