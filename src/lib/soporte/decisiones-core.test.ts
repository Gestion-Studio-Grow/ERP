// Las decisiones del dueño del 14/11/2026 (D1, D2, D3, D6, D8) como reglas puras. Argentina = UTC-3 fijo.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MOTOR_VIGENTE,
  VAR_WHATSAPP_SOPORTE,
  avisarAlDuenioFueraDeHora,
  canalesDeSoporteActivos,
  enHorarioDeGuardia,
  FERIADOS_NACIONALES,
  estadoDelTope,
  n1PuedeSalirSolo,
  n2SeAplicaSolo,
  sumarHorasDeGuardia,
  vencimientoDeResolucion,
} from "./decisiones-core";

/** Hora argentina → instante. «2026-11-16 09:00» (lunes) = 12:00 UTC. */
const ar = (s: string) => new Date(`${s.replace(" ", "T")}:00-03:00`);

test("D1: WhatsApp sólo con el número nuevo de soporte cargado; si no, se arranca sin él", () => {
  assert.deepEqual(canalesDeSoporteActivos({}), ["erp", "mail"]);
  assert.deepEqual(canalesDeSoporteActivos({ [VAR_WHATSAPP_SOPORTE]: "" }), ["erp", "mail"]);
  assert.deepEqual(canalesDeSoporteActivos({ [VAR_WHATSAPP_SOPORTE]: "123" }), ["erp", "mail"], "id roto");
  assert.deepEqual(canalesDeSoporteActivos({ [VAR_WHATSAPP_SOPORTE]: "abc123456" }), ["erp", "mail"]);
  assert.deepEqual(canalesDeSoporteActivos({ [VAR_WHATSAPP_SOPORTE]: "109876543210" }), ["erp", "mail", "whatsapp"]);
});

test("D2: horario de guardia L–V 9–19 y sábado 9–13, en hora argentina", () => {
  assert.equal(enHorarioDeGuardia(ar("2026-11-16 09:00")), true, "lunes abre");
  assert.equal(enHorarioDeGuardia(ar("2026-11-16 08:59")), false);
  assert.equal(enHorarioDeGuardia(ar("2026-11-20 18:59")), true, "viernes");
  assert.equal(enHorarioDeGuardia(ar("2026-11-20 19:00")), false, "viernes cierra");
  assert.equal(enHorarioDeGuardia(ar("2026-11-14 12:59")), true, "sábado");
  assert.equal(enHorarioDeGuardia(ar("2026-11-14 13:00")), false, "sábado cierra a las 13");
  assert.equal(enHorarioDeGuardia(ar("2026-11-15 11:00")), false, "domingo");
  assert.equal(enHorarioDeGuardia(ar("2026-11-16 10:00"), new Set(["2026-11-16"])), false, "feriado");
  // 22:00 del lunes en Argentina ya es martes en UTC: manda la fecha argentina.
  assert.equal(enHorarioDeGuardia(ar("2026-11-16 22:00"), new Set(["2026-11-17"])), false);
});

test("D2: el reloj sólo corre en guardia (pasa por sábado, domingo y feriados)", () => {
  assert.deepEqual(sumarHorasDeGuardia(ar("2026-11-20 18:00"), 3), ar("2026-11-21 11:00"), "viernes 1 h + sábado 2 h");
  assert.deepEqual(sumarHorasDeGuardia(ar("2026-11-21 12:30"), 2, new Set()), ar("2026-11-23 10:30"), "sábado 30 min + lunes 1 h 30");
  assert.deepEqual(sumarHorasDeGuardia(ar("2026-11-22 10:00"), 1, new Set()), ar("2026-11-23 10:00"), "domingo arranca el lunes");
  assert.deepEqual(sumarHorasDeGuardia(ar("2026-11-22 10:00"), 1, new Set(["2026-11-23"])), ar("2026-11-24 10:00"), "lunes feriado");
  assert.deepEqual(sumarHorasDeGuardia(ar("2026-11-16 07:00"), 0), ar("2026-11-16 09:00"), "0 h fuera de hora = cuando abre");
  assert.throws(() => sumarHorasDeGuardia(ar("2026-11-16 10:00"), 1, new Set(Array.from({ length: 500 }, (_, i) => new Date(Date.UTC(2026, 10, 16 + i)).toISOString().slice(0, 10)))));
});

test("D2: lo grave (P1) corre a toda hora sólo para negocios en vivo", () => {
  const dom = ar("2026-11-15 11:00");
  assert.deepEqual(vencimientoDeResolucion("P1", dom, { enVivo: true }), ar("2026-11-15 19:00"), "P1 en vivo: 8 h corridas");
  assert.deepEqual(vencimientoDeResolucion("P1", dom, { enVivo: false }), ar("2026-11-16 17:00"), "P1 sin vivo: 8 h de guardia");
  assert.deepEqual(vencimientoDeResolucion("P1", dom), vencimientoDeResolucion("P1", dom, { enVivo: false }), "sin dato = no en vivo");
  assert.deepEqual(vencimientoDeResolucion("P2", dom, { enVivo: true }), sumarHorasDeGuardia(dom, 48), "P2 siempre en guardia");
  assert.equal(avisarAlDuenioFueraDeHora("P1", dom, { enVivo: true }), true, "domingo, P1, en vivo: aviso ya");
  assert.equal(avisarAlDuenioFueraDeHora("P1", ar("2026-11-16 10:00"), { enVivo: true }), false, "en horario lo ve la guardia");
  assert.equal(avisarAlDuenioFueraDeHora("P1", dom, { enVivo: false }), false);
  assert.equal(avisarAlDuenioFueraDeHora("P2", dom, { enVivo: true }), false);
});

test("D3: el soporte usa como máximo ¼ del tope; aviso al 80 %, manual al 100 %; sin pago, cero", () => {
  const e = (usadoSemana: number, topeSemanalPlan = 100, negocioPaga = true) => estadoDelTope({ usadoSemana, topeSemanalPlan, negocioPaga }).estado;
  assert.equal(e(0), "normal");
  assert.equal(e(19.99), "normal");
  assert.equal(e(20), "aviso", "80 % de 25");
  assert.equal(e(24.99), "aviso");
  assert.equal(e(25), "manual", "el cuarto del tope");
  assert.equal(e(0, 100, false), "manual", "no paga: cero IA");
  for (const [u, t] of [[NaN, 100], [-1, 100], [1, 0], [1, -5], [1, Infinity]]) assert.equal(e(u, t), "manual", `${u}/${t}: falla cerrado`);
});

test("D6: toda respuesta se revisa; a las 4 semanas y 9 de 10 sin cambios, P3 sale sola — sólo si el motor es API", () => {
  const base = {
    motor: "api" as const,
    inicioRevision: ar("2026-11-23 09:00"),
    ahora: ar("2026-12-21 09:00"),
    aprobadosSinCambios: 27,
    revisados: 30,
    ticket: { tipo: "consulta", prioridad: "P3" as const },
    esCH: false,
  };
  assert.equal(MOTOR_VIGENTE, "plan");
  assert.equal(n1PuedeSalirSolo(base).solo, true, "27/30 = 90 % a las 4 semanas");
  assert.equal(n1PuedeSalirSolo({ ...base, motor: MOTOR_VIGENTE }).solo, false, "con el plan, nunca (D-11)");
  assert.equal(n1PuedeSalirSolo({ ...base, esCH: true }).solo, false, "CH: siempre el dueño");
  assert.equal(n1PuedeSalirSolo({ ...base, aprobadosSinCambios: 26 }).solo, false, "86 %");
  assert.equal(n1PuedeSalirSolo({ ...base, ahora: ar("2026-12-21 08:59") }).solo, false, "un minuto antes de las 4 semanas");
  assert.equal(n1PuedeSalirSolo({ ...base, revisados: 10, aprobadosSinCambios: 10 }).solo, false, "muestra chica");
  assert.equal(n1PuedeSalirSolo({ ...base, ticket: { tipo: "problema", prioridad: "P3" } }).solo, false);
  assert.equal(n1PuedeSalirSolo({ ...base, ticket: { tipo: "consulta", prioridad: "P2" } }).solo, false);
  assert.equal(n1PuedeSalirSolo({ ...base, revisados: 0, aprobadosSinCambios: 0 }).solo, false);
});

test("D8: cada cambio con un clic; tras 20 sin error, lo reversible se aplica solo — sólo si el motor es API", () => {
  const base = { motor: "api" as const, cambiosSeguidosSinError: 20, reversible: true, esCH: false };
  assert.equal(n2SeAplicaSolo(base).solo, true);
  assert.equal(n2SeAplicaSolo({ ...base, motor: MOTOR_VIGENTE }).solo, false, "con el plan, nunca (D-11)");
  assert.equal(n2SeAplicaSolo({ ...base, cambiosSeguidosSinError: 19 }).solo, false);
  assert.equal(n2SeAplicaSolo({ ...base, reversible: false }).solo, false);
  assert.equal(n2SeAplicaSolo({ ...base, esCH: true }).solo, false);
});

test("D2: feriados nacionales oficiales por defecto (argentina.gob.ar, 2026)", () => {
  assert.equal(FERIADOS_NACIONALES.size, 21);
  for (const f of FERIADOS_NACIONALES) assert.match(f, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(FERIADOS_NACIONALES.has("2026-11-23"), "Soberanía Nacional trasladado al lunes 23/11");
  assert.ok(!FERIADOS_NACIONALES.has("2026-11-20"), "el 20/11 original no es feriado: se trasladó");
  assert.ok(!FERIADOS_NACIONALES.has("2026-11-10"), "feriado sólo provincial: no entra");
  assert.equal(enHorarioDeGuardia(ar("2026-11-23 10:00")), false, "23/11: sin guardia por defecto");
  assert.equal(enHorarioDeGuardia(ar("2026-11-23 10:00"), new Set()), true, "con lista vacía explícita sí hay");
  assert.deepEqual(sumarHorasDeGuardia(ar("2026-11-21 12:30"), 2), ar("2026-11-24 10:30"), "sábado 30 min + martes 1 h 30");
  assert.deepEqual(vencimientoDeResolucion("P3", ar("2026-12-24 18:00")), sumarHorasDeGuardia(ar("2026-12-24 18:00"), 120, FERIADOS_NACIONALES));
});
