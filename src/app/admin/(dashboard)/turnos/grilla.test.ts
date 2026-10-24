import { test } from "node:test";
import assert from "node:assert/strict";
import { horasDeLaGrilla } from "./grilla";
import { hrefTurnoEnHueco, leerHuecoDelAlta, leerNuevoTurno } from "./pasos";

const h = (hh: number, mm = 0) => hh * 60 + mm;

test("grilla: sin turnos fuera de hora, de 9 a 19 como siempre", () => {
  assert.deepEqual(horasDeLaGrilla([]), { desde: 9, hasta: 19 });
  assert.deepEqual(horasDeLaGrilla([{ desde: h(10), hasta: h(11) }]), { desde: 9, hasta: 19 });
});

test("grilla: un turno de las 8:15 o que termina 20:30 se ve (antes quedaba afuera)", () => {
  assert.deepEqual(horasDeLaGrilla([{ desde: h(8, 15), hasta: h(9, 15) }]), { desde: 8, hasta: 19 });
  assert.deepEqual(horasDeLaGrilla([{ desde: h(19, 30), hasta: h(20, 30) }]), { desde: 9, hasta: 21 });
});

test("grilla: un turno que cruza la medianoche se corta a las 24", () => {
  assert.deepEqual(horasDeLaGrilla([{ desde: h(23), hasta: h(0, 30) }]), { desde: 9, hasta: 24 });
});

// ── Tanda 2 · 2-C: huecos tocables, columnas por box, choques, raya ──────────
import {
  bloqueosDelDia,
  carrilesDeLaColumna,
  columnaDelTurno,
  columnasDeLaGrilla,
  enMinutos,
  estadoDeLaCelda,
  hrefNuevoTurnoEnHueco,
  bloqueosPorHorario,
  ausenciaDeLaColumna,
  NO_TRABAJA_ESE_DIA,
  leerVerPor,
  rayaDeAhora,
  LEYENDA_DE_LA_GRILLA,
  type ColumnaDeLaGrilla,
} from "./grilla";

// Buenos Aires = UTC−3: 14:00 de pared el jueves 24/10/2030 es 17:00 UTC.
const DIA = "2030-10-24";
const iso = (hhmm: string, dia = DIA) => new Date(`${dia}T${hhmm}:00-03:00`).toISOString();
const PROFES = [
  { id: "caro", nombre: "Caro", box: "Box 1" },
  { id: "vero", nombre: "Vero", box: "Box 2" },
  { id: "lu", nombre: "Lu", box: "Box 3" },
];
const colDe = (cols: ColumnaDeLaGrilla[], clave: string) => cols.find((c) => c.clave === clave)!;

test("CH-029 · el hueco «jue 14:00 · Lu» lleva a Dar turno con Lu, el jueves y las 14:00", () => {
  const cols = columnasDeLaGrilla("profesional", PROFES);
  const celda = estadoDeLaCelda({
    dia: DIA,
    hoy: "2030-10-23",
    ahoraMin: h(11),
    minuto: h(14),
    columna: colDe(cols, "lu"),
    ocupados: [],
    bloqueos: [],
    puedeDarTurno: true,
    nombreDe: (id) => PROFES.find((p) => p.id === id)?.nombre,
  });
  assert.equal(celda.tipo, "hueco");
  if (celda.tipo !== "hueco") return;
  assert.equal(celda.href, "/admin/turnos/lista?nuevo=1&fecha=2030-10-24&profesional=lu&hora=14:00");
  assert.equal(new URL(celda.href, "https://x.test").searchParams.get("hora"), "14:00");
  assert.equal(celda.etiqueta, "Dar un turno a las 14:00 con Lu");
});

test("hrefNuevoTurnoEnHueco: contrato ?profesional=&hora= — el mismo armado que hrefTurnoEnHueco (pasos.ts) y lo que lee el alta", () => {
  assert.equal(hrefNuevoTurnoEnHueco(DIA, "lu", h(14)), hrefTurnoEnHueco(DIA, "lu", "14:00"));
  const q = new URL(hrefNuevoTurnoEnHueco(DIA, "lu", h(14)), "http://x").searchParams;
  assert.deepEqual(leerHuecoDelAlta({ nuevo: q.get("nuevo"), profesional: q.get("profesional"), hora: q.get("hora"), ahora: q.get("ahora") }), { profesional: "lu", hora: "14:00", ahora: false });
  assert.deepEqual(leerNuevoTurno({ nuevo: q.get("nuevo") ?? undefined, fecha: q.get("fecha") ?? undefined }, "2030-10-20"), { abrir: true, fecha: DIA });
  assert.equal(hrefNuevoTurnoEnHueco(DIA, "caro", h(9, 30)), "/admin/turnos/lista?nuevo=1&fecha=2030-10-24&profesional=caro&hora=09:30");
  // Por box con dos profesionales: sin profesional (el alta pregunta con quién).
  assert.equal(hrefNuevoTurnoEnHueco(DIA, null, h(16)), "/admin/turnos/lista?nuevo=1&fecha=2030-10-24&hora=16:00");
  // Un id raro no viaja; una fecha inválida no precarga nada.
  assert.equal(hrefNuevoTurnoEnHueco(DIA, "x&y=1", h(16)), "/admin/turnos/lista?nuevo=1&fecha=2030-10-24&hora=16:00");
  assert.equal(hrefNuevoTurnoEnHueco("2030-02-31", "caro", h(16)), "/admin/turnos/lista?nuevo=1");
});

test("estadoDeLaCelda: ocupada, bloqueada, pasada y sin permiso no son hueco", () => {
  const col = colDe(columnasDeLaGrilla("profesional", PROFES), "caro");
  const base = { dia: DIA, hoy: DIA, ahoraMin: h(11, 42), columna: col, ocupados: [], bloqueos: [], puedeDarTurno: true };
  // Un turno 12:00-12:15 pisa la media hora 12:00 (y sólo esa).
  const ocupados = [{ desde: h(12), hasta: h(12, 15) }];
  assert.equal(estadoDeLaCelda({ ...base, ocupados, minuto: h(12) }).tipo, "ocupada");
  assert.equal(estadoDeLaCelda({ ...base, ocupados, minuto: h(12, 30) }).tipo, "hueco");
  // Hoy a las 11:42: la media hora de las 11:30 ya empezó.
  assert.equal(estadoDeLaCelda({ ...base, minuto: h(11, 30) }).tipo, "pasada");
  assert.equal(estadoDeLaCelda({ ...base, minuto: h(12) }).tipo, "hueco");
  // Un día pasado: nada es hueco.
  assert.equal(estadoDeLaCelda({ ...base, dia: "2030-10-23", minuto: h(15) }).tipo, "pasada");
  // La profesional (rol PROFESSIONAL) no da turnos.
  assert.equal(estadoDeLaCelda({ ...base, minuto: h(15), puedeDarTurno: false }).tipo, "sin-permiso");
  // Bloqueo de 15 a 17 «médico».
  const bloqueos = [{ profesionalId: "caro", desde: iso("15:00"), hasta: iso("17:00"), motivo: "médico" }];
  assert.deepEqual(estadoDeLaCelda({ ...base, bloqueos, minuto: h(15, 30) }), { tipo: "bloqueada", motivo: "médico" });
  assert.equal(estadoDeLaCelda({ ...base, bloqueos, minuto: h(17) }).tipo, "hueco");
  // Un franco de varios días cubre el día entero.
  const franco = [{ profesionalId: "caro", desde: iso("00:00", "2030-10-22"), hasta: iso("00:00", "2030-10-26"), motivo: "vacaciones" }];
  assert.equal(estadoDeLaCelda({ ...base, bloqueos: franco, minuto: h(18) }).tipo, "bloqueada");
});

test("por box: una columna por box con quiénes atienden; el hueco va con la única profesional", () => {
  const profes = [...PROFES, { id: "ana", nombre: "Ana", box: "Box 1" }];
  const cols = columnasDeLaGrilla("box", profes, [{ box: "Box 9" }]);
  assert.deepEqual(
    cols.map((c) => [c.clave, c.detalle, c.profesionalId]),
    [
      ["Box 1", "Caro · Ana", null],
      ["Box 2", "Vero", "vero"],
      ["Box 3", "Lu", "lu"],
      ["Box 9", null, null],
    ],
  );
  const box1 = colDe(cols, "Box 1");
  const celda = estadoDeLaCelda({ dia: DIA, hoy: "2030-10-01", ahoraMin: 0, minuto: h(10), columna: box1, ocupados: [], bloqueos: [], puedeDarTurno: true });
  assert.ok(celda.tipo === "hueco" && !celda.href.includes("profesional="));
  // Con una de las dos bloqueada, el box sigue sirviendo; con las dos, no.
  const unaBloqueada = [{ profesionalId: "caro", desde: iso("09:00"), hasta: iso("19:00"), motivo: "médico" }];
  assert.equal(estadoDeLaCelda({ dia: DIA, hoy: "2030-10-01", ahoraMin: 0, minuto: h(10), columna: box1, ocupados: [], bloqueos: unaBloqueada, puedeDarTurno: true }).tipo, "hueco");
  const dos = [...unaBloqueada, { profesionalId: "ana", desde: iso("09:00"), hasta: iso("19:00"), motivo: "curso" }];
  assert.equal(estadoDeLaCelda({ dia: DIA, hoy: "2030-10-01", ahoraMin: 0, minuto: h(10), columna: box1, ocupados: [], bloqueos: dos, puedeDarTurno: true }).tipo, "bloqueada");
  assert.equal(columnaDelTurno("box", { profesionalId: "caro", box: "Box 1" }), "Box 1");
  assert.equal(columnaDelTurno("box", { profesionalId: "caro", box: "" }), "Sin box");
  assert.equal(columnaDelTurno("profesional", { profesionalId: "caro", box: "Box 1" }), "caro");
  assert.equal(leerVerPor("box"), "box");
  assert.equal(leerVerPor("cualquiera"), "profesional");
  assert.equal(leerVerPor(null), "profesional");
});

test("choques: dos vivos que se pisan en el mismo box van lado a lado y marcados; uno resuelto no choca", () => {
  const t = (id: string, de: string, a: string, estado = "CONFIRMED") => ({ id, inicio: iso(de), fin: iso(a), estado });
  const { carriles, choques } = carrilesDeLaColumna([t("a", "10:00", "11:00"), t("b", "10:30", "11:30"), t("c", "11:30", "12:00"), t("d", "11:45", "12:15", "NO_SHOW")]);
  assert.deepEqual(carriles.get("a"), { carril: 0, de: 2 });
  assert.deepEqual(carriles.get("b"), { carril: 1, de: 2 });
  assert.deepEqual(carriles.get("c"), { carril: 0, de: 2 });
  assert.deepEqual(carriles.get("d"), { carril: 1, de: 2 });
  assert.deepEqual([...choques].sort(), ["a", "b"]);
  // Pegados (uno termina cuando empieza el otro) no se pisan.
  const pegados = carrilesDeLaColumna([t("x", "10:00", "10:30"), t("y", "10:30", "11:00")]);
  assert.equal(pegados.choques.size, 0);
  assert.deepEqual(pegados.carriles.get("y"), { carril: 0, de: 1 });
});

test("raya de ahora: sólo hoy y dentro del tramo; enMinutos corta en la medianoche", () => {
  assert.equal(rayaDeAhora({ dia: DIA, hoy: DIA, ahoraMin: h(11, 42), desde: h(9), hasta: h(19) }), 162);
  assert.equal(rayaDeAhora({ dia: DIA, hoy: "2030-10-25", ahoraMin: h(11), desde: h(9), hasta: h(19) }), null);
  assert.equal(rayaDeAhora({ dia: DIA, hoy: DIA, ahoraMin: h(20), desde: h(9), hasta: h(19) }), null);
  assert.deepEqual(enMinutos({ inicio: iso("14:00"), fin: iso("15:10") }), { desde: h(14), hasta: h(15, 10) });
  assert.deepEqual(enMinutos({ inicio: iso("23:30"), fin: iso("00:30", "2030-10-25") }), { desde: h(23, 30), hasta: 24 * 60 });
});

test("bloqueosDelDia descarta los de la demo (sin horario) y la leyenda tiene 5 marcas con «No vino»", () => {
  assert.deepEqual(bloqueosDelDia([{ reason: "franco" }]), []);
  const b = bloqueosDelDia([{ professionalId: "lu", startsAt: new Date(iso("15:00")), endsAt: new Date(iso("17:00")), reason: "médico" }]);
  assert.deepEqual(b, [{ profesionalId: "lu", desde: iso("15:00"), hasta: iso("17:00"), motivo: "médico" }]);
  assert.equal(LEYENDA_DE_LA_GRILLA.length, 5);
  assert.deepEqual(new Set(LEYENDA_DE_LA_GRILLA.map((e) => e.tipo)).size, 5);
  assert.ok(LEYENDA_DE_LA_GRILLA.some((e) => /No vino/.test(e.palabra)));
});

test("horario de trabajo: fuera de su horario no hay hueco; sin horario ese día, no trabaja (Tanda 2)", () => {
  const horarios = [{ profesionalId: "caro", desde: "09:00", hasta: "13:00" }];
  const bloqueos = bloqueosPorHorario(DIA, ["caro", "lu"], horarios);
  const col = (id: string) => colDe(columnasDeLaGrilla("profesional", PROFES), id);
  const celda = (id: string, minuto: number) =>
    estadoDeLaCelda({ dia: DIA, hoy: "2030-10-23", ahoraMin: 0, minuto, columna: col(id), ocupados: [], bloqueos, puedeDarTurno: true }).tipo;
  assert.equal(celda("caro", h(8, 30)), "bloqueada");
  assert.equal(celda("caro", h(9)), "hueco");
  assert.equal(celda("caro", h(12, 30)), "hueco");
  assert.equal(celda("caro", h(13)), "bloqueada");
  assert.equal(celda("lu", h(10)), "bloqueada");
  // La cabecera: sólo «no trabaja ese día», no el fuera de horario de la mañana o la noche.
  assert.equal(ausenciaDeLaColumna(["caro"], bloqueos), undefined);
  assert.equal(ausenciaDeLaColumna(["lu"], bloqueos)?.motivo, NO_TRABAJA_ESE_DIA);
  // Una ausencia cargada manda sobre el horario.
  const conMedico = [...bloqueos, { profesionalId: "lu", desde: "x", hasta: "y", motivo: "médico" }];
  assert.equal(ausenciaDeLaColumna(["lu"], conMedico)?.motivo, "médico");
  // Sin lectura (null) no se marca nada: el alta valida igual.
  assert.deepEqual(bloqueosPorHorario(DIA, ["caro"], null), []);
});
