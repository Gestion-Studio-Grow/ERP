// La semana (CH-036): ocupación descontando el horario de trabajo y los bloqueos, huecos de 30′ o más,
// celda → Dar turno con la profesional y el día, día → la agenda de ese día.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  armarSemana,
  celdaDeLaSemana,
  diasDeLaSemana,
  etiquetaDeLaCelda,
  hrefDeLaSemana,
  leerSemana,
  lunesDe,
  restar,
  tituloDeLaSemana,
  unir,
  type AgendaDeLaSemana,
  type HorarioSemanal,
  type TurnoDeLaSemana,
} from "./semana-core";

const LUNES = "2030-10-21"; // lunes; el jueves es el 24
const iso = (dia: string, hhmm: string) => new Date(`${dia}T${hhmm}:00-03:00`).toISOString();

function turno(id: string, profesionalId: string, dia: string, desde: string, hasta: string, estado = "CONFIRMED", precio = 14000): TurnoDeLaSemana {
  return { id, profesionalId, inicio: iso(dia, desde), fin: iso(dia, hasta), estado, precio };
}

/** Caro y Lu trabajan lunes a sábado de 9 a 19; Lu el jueves no (sin fila). */
function horarios(): HorarioSemanal[] {
  const out: HorarioSemanal[] = [];
  for (const d of [1, 2, 3, 4, 5, 6]) {
    out.push({ profesionalId: "caro", diaSemana: d, desde: "09:00", hasta: "19:00" });
    if (d !== 4) out.push({ profesionalId: "lu", diaSemana: d, desde: "09:00", hasta: "19:00" });
  }
  return out;
}

function agenda(extra: Partial<AgendaDeLaSemana> = {}): AgendaDeLaSemana {
  return {
    lunes: LUNES,
    profesionales: [
      { id: "caro", nombre: "Caro", box: "Box 1" },
      { id: "lu", nombre: "Lu", box: "Box 3" },
    ],
    turnos: [],
    ausencias: [],
    horarios: horarios(),
    ...extra,
  };
}

const ANTES = { hoy: "2030-10-01", ahoraMin: 0, puedeDarTurno: true };

test("lunes de la semana, ?desde= raro → esta semana", () => {
  assert.equal(lunesDe("2030-10-24"), LUNES);
  assert.equal(lunesDe("2030-10-27"), LUNES, "el domingo es el último día de su semana");
  assert.equal(lunesDe(LUNES), LUNES);
  assert.equal(leerSemana("2030-10-25", "2030-01-01"), LUNES);
  assert.equal(leerSemana("2030-02-31", "2030-10-24"), LUNES);
  assert.equal(leerSemana(undefined, "2030-10-24"), LUNES);
  assert.equal(tituloDeLaSemana(diasDeLaSemana(agenda())), "Semana del 21 al 26 de octubre");
  assert.equal(tituloDeLaSemana(diasDeLaSemana({ lunes: "2030-10-28", turnos: [], horarios: [] })), "Semana del 28 de octubre al 2 de noviembre");
  assert.equal(hrefDeLaSemana(LUNES, "2030-10-24"), "/admin/turnos/semana");
  assert.equal(hrefDeLaSemana("2030-10-28", "2030-10-24"), "/admin/turnos/semana?desde=2030-10-28");
});

test("lunes a sábado; el domingo sólo si alguien trabaja o hay turnos", () => {
  assert.equal(diasDeLaSemana(agenda()).length, 6);
  const conDomingo = agenda({ horarios: [...horarios(), { profesionalId: "caro", diaSemana: 0, desde: "10:00", hasta: "14:00" }] });
  assert.deepEqual(diasDeLaSemana(conDomingo).at(-1), "2030-10-27");
  assert.equal(diasDeLaSemana(agenda({ turnos: [turno("d", "caro", "2030-10-27", "10:00", "11:00")] })).length, 7);
});

test("tramos: unir y restar", () => {
  assert.deepEqual(unir([{ desde: 60, hasta: 120 }, { desde: 100, hasta: 150 }, { desde: 150, hasta: 160 }, { desde: 300, hasta: 330 }]), [
    { desde: 60, hasta: 160 },
    { desde: 300, hasta: 330 },
  ]);
  assert.deepEqual(restar([{ desde: 0, hasta: 100 }], [{ desde: 20, hasta: 30 }, { desde: 90, hasta: 200 }]), [
    { desde: 0, hasta: 20 },
    { desde: 30, hasta: 90 },
  ]);
});

test("CH-036 · ocupación = minutos con turno ÷ horario de trabajo", () => {
  // 9 a 19 = 600′. Dos turnos de 2 h = 240′ → 40 %.
  const a = agenda({ turnos: [turno("1", "caro", "2030-10-22", "09:00", "11:00"), turno("2", "caro", "2030-10-22", "14:00", "16:00")] });
  const c = celdaDeLaSemana(a, "2030-10-22", "caro", ANTES);
  assert.equal(c.minutosDeTrabajo, 600);
  assert.equal(c.minutosOcupados, 240);
  assert.equal(c.porcentaje, 40);
  assert.equal(c.turnos, 2);
  // Huecos ≥ 30′: 11-14 y 16-19.
  assert.deepEqual(c.huecos, [
    { desde: 11 * 60, hasta: 14 * 60 },
    { desde: 16 * 60, hasta: 19 * 60 },
  ]);
});

test("CH-036 · los bloqueos se descuentan del horario (no son ocupación)", () => {
  // Médico de 15 a 17 el martes: trabaja 480′; un turno de 4 h → 50 %.
  const a = agenda({
    turnos: [turno("1", "caro", "2030-10-22", "09:00", "13:00")],
    ausencias: [{ profesionalId: "caro", desde: iso("2030-10-22", "15:00"), hasta: iso("2030-10-22", "17:00"), motivo: "médico" }],
  });
  const c = celdaDeLaSemana(a, "2030-10-22", "caro", ANTES);
  assert.equal(c.minutosDeTrabajo, 480);
  assert.equal(c.porcentaje, 50);
  assert.deepEqual(c.huecos, [
    { desde: 13 * 60, hasta: 15 * 60 },
    { desde: 17 * 60, hasta: 19 * 60 },
  ]);
  assert.equal(c.motivo, null);
});

test("CH-036 · franco de varios días: «médico», 0 minutos, sin % ni Dar turno", () => {
  const a = agenda({
    ausencias: [{ profesionalId: "lu", desde: iso("2030-10-21", "00:00"), hasta: iso("2030-10-23", "00:00"), motivo: "médico" }],
  });
  const lunes = celdaDeLaSemana(a, "2030-10-21", "lu", ANTES);
  const martes = celdaDeLaSemana(a, "2030-10-22", "lu", ANTES);
  for (const c of [lunes, martes]) {
    assert.equal(c.minutosDeTrabajo, 0);
    assert.equal(c.porcentaje, null);
    assert.equal(c.motivo, "médico");
    assert.equal(c.hrefDarTurno, null);
    assert.deepEqual(c.huecos, []);
  }
  assert.equal(celdaDeLaSemana(a, "2030-10-23", "lu", ANTES).porcentaje, 0, "el miércoles vuelve");
});

test("CH-036 · sin horario ese día → «no trabaja ese día»", () => {
  const c = celdaDeLaSemana(agenda(), "2030-10-24", "lu", ANTES);
  assert.equal(c.motivo, "no trabaja ese día");
  assert.equal(c.hrefDarTurno, null);
  assert.match(etiquetaDeLaCelda(c, "Lu"), /^Lu, jueves 24: no trabaja ese día$/);
});

test("un turno fuera de horario no empuja la ocupación por encima del 100 %", () => {
  const a = agenda({ turnos: [turno("1", "caro", "2030-10-22", "08:00", "20:00")] });
  const c = celdaDeLaSemana(a, "2030-10-22", "caro", ANTES);
  assert.equal(c.porcentaje, 100);
  assert.deepEqual(c.huecos, []);
});

test("huecos menores a 30′ no cuentan; hoy, sólo desde ahora; un día pasado, ninguno", () => {
  const a = agenda({ turnos: [turno("1", "caro", "2030-10-22", "09:20", "18:50")] });
  assert.deepEqual(celdaDeLaSemana(a, "2030-10-22", "caro", ANTES).huecos, [], "20′ y 10′ no son huecos");
  const hoy = { hoy: "2030-10-23", ahoraMin: 17 * 60, puedeDarTurno: true };
  assert.deepEqual(celdaDeLaSemana(agenda(), "2030-10-23", "caro", hoy).huecos, [{ desde: 17 * 60, hasta: 19 * 60 }]);
  const pasado = celdaDeLaSemana(agenda(), "2030-10-22", "caro", hoy);
  assert.deepEqual(pasado.huecos, []);
  assert.equal(pasado.hrefDarTurno, null, "un día pasado no ofrece dar turno");
  assert.equal(pasado.porcentaje, 0, "la ocupación del día pasado se calcula igual");
});

test("CH-036 · celda → Dar turno con esa profesional y ese día; sin permiso, nada", () => {
  const c = celdaDeLaSemana(agenda(), "2030-10-25", "caro", ANTES);
  assert.equal(c.hrefDarTurno, "/admin/turnos/lista?nuevo=1&fecha=2030-10-25&profesional=caro");
  assert.equal(celdaDeLaSemana(agenda(), "2030-10-25", "caro", { ...ANTES, puedeDarTurno: false }).hrefDarTurno, null);
  assert.match(etiquetaDeLaCelda(c, "Caro"), /^Caro, viernes 25: 0 % ocupado, 1 hueco de 30 minutos o más\. Dar turno$/);
});

test("los cancelados no ocupan; los «no vino» sí (el lugar estuvo tomado)", () => {
  const a = agenda({
    turnos: [turno("1", "caro", "2030-10-22", "09:00", "11:00", "CANCELLED"), turno("2", "caro", "2030-10-22", "11:00", "12:00", "NO_SHOW")],
  });
  const c = celdaDeLaSemana(a, "2030-10-22", "caro", ANTES);
  assert.equal(c.minutosOcupados, 60);
  assert.equal(c.turnos, 1);
});

test("sin horario leído (demo): no se inventa una ocupación", () => {
  const c = celdaDeLaSemana(agenda({ horarios: null }), "2030-10-22", "caro", ANTES);
  assert.equal(c.porcentaje, null);
  assert.equal(c.motivo, null);
  assert.ok(c.hrefDarTurno, "se puede dar turno igual (el alta valida)");
});

test("armarSemana: días con conteos, totales, esperado sin cancelados ni faltazos, días → agenda por profesional", () => {
  const ahora = new Date(iso("2030-10-21", "08:00"));
  const a = agenda({
    turnos: [
      turno("1", "caro", "2030-10-21", "09:00", "10:00", "PENDING", 6000),
      turno("2", "lu", "2030-10-21", "10:00", "11:00", "CONFIRMED", 14000),
      turno("3", "caro", "2030-10-22", "09:00", "10:00", "NO_SHOW", 8000),
      turno("4", "caro", "2030-10-23", "09:00", "10:00", "CANCELLED", 9000),
    ],
  });
  const s = armarSemana(a, { hoy: "2030-10-21", ahoraMin: 8 * 60, puedeDarTurno: true, ahora });
  assert.equal(s.dias.length, 6);
  assert.equal(s.dias[0].titulo, "lun 21");
  assert.equal(s.dias[0].esHoy, true);
  assert.equal(s.dias[0].turnos, 2);
  assert.equal(s.dias[0].sinConfirmar, 1);
  assert.equal(s.dias[1].href, "/admin/turnos?date=2030-10-22&vista=profesionales");
  assert.equal(s.dias[0].href, "/admin/turnos?vista=profesionales");
  assert.deepEqual(s.totales, { turnos: 3, sinConfirmar: 1, esperado: 20000, huecos: s.filas.reduce((x, f) => x + f.huecos, 0) });
  assert.equal(s.filas.length, 2);
  assert.equal(s.filas[1].celdas[3].motivo, "no trabaja ese día", "Lu el jueves");
  assert.equal(s.anterior, "2030-10-14");
  assert.equal(s.siguiente, "2030-10-28");
});
