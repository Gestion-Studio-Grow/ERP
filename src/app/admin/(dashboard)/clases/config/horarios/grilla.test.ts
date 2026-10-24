import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BLOQUES,
  OPCIONES_HORA,
  agregarOtro,
  aTramos,
  alternarBloque,
  cambiarTramo,
  copiarA,
  erroresDe,
  hayErrores,
  horasDelDia,
  iguales,
  quitarTramo,
  resumenSemana,
  semanaDesde,
  semanaVacia,
  tieneBloque,
  vistaPrevia,
} from "./grilla";

const [MANANA, TARDE] = BLOQUES;
const LUN = 1, MAR = 2, MIE = 3, JUE = 4, VIE = 5;

test("semanaDesde: sólo las franjas semanales que da clases, ordenadas por hora", () => {
  const s = semanaDesde([
    { diaSemana: 1, desde: "16:00", hasta: "21:00", fecha: null, tipo: "DA" },
    { diaSemana: 1, desde: "08:00", hasta: "12:00", fecha: null, tipo: "DA" },
    { diaSemana: null, desde: "00:00", hasta: "23:59", fecha: "2026-10-24", tipo: "NO" },
  ]);
  assert.deepEqual(s[LUN], [{ desde: "08:00", hasta: "12:00" }, { desde: "16:00", hasta: "21:00" }]);
  assert.equal(s.flat().length, 2);
});

test("chips ↔ tramos: «Mañana 8–12» prende y apaga ese tramo", () => {
  let s = alternarBloque(semanaVacia(), LUN, MANANA);
  assert.ok(tieneBloque(s[LUN], MANANA));
  s = alternarBloque(s, LUN, TARDE);
  assert.deepEqual(s[LUN].map((t) => t.desde), ["08:00", "16:00"]);
  s = alternarBloque(s, LUN, MANANA);
  assert.ok(!tieneBloque(s[LUN], MANANA));
  assert.ok(tieneBloque(s[LUN], TARDE));
});

test("«Copiar a…»: el lunes 8–12 a mar, mié, jue y vie, y nada más cambia (M-079)", () => {
  const base = alternarBloque(semanaVacia(), LUN, MANANA);
  const s = copiarA(base, LUN, [MAR, MIE, JUE, VIE]);
  for (const d of [LUN, MAR, MIE, JUE, VIE]) assert.deepEqual(s[d], [{ desde: "08:00", hasta: "12:00" }]);
  assert.deepEqual(s[0], []);
  assert.deepEqual(s[6], []);
  // Un solo guardado con los 5 días.
  assert.equal(aTramos(s).length, 5);
  // Copiar pisa lo que tenía el destino.
  const conTarde = alternarBloque(s, MAR, TARDE);
  assert.deepEqual(copiarA(conTarde, LUN, [MAR])[MAR], [{ desde: "08:00", hasta: "12:00" }]);
});

test("«Termina antes de empezar» en rojo y no se guarda (M-080)", () => {
  let s = agregarOtro(semanaVacia(), LUN);
  s = cambiarTramo(s, LUN, 0, "desde", "16:00");
  s = cambiarTramo(s, LUN, 0, "hasta", "15:00");
  assert.equal(erroresDe(s)[LUN][0], "Termina antes de empezar");
  assert.ok(hayErrores(s));
  assert.ok(!hayErrores(quitarTramo(s, LUN, 0)));
});

test("dos tramos que se pisan, los dos en rojo", () => {
  let s = alternarBloque(semanaVacia(), LUN, MANANA);
  s = agregarOtro(s, LUN);
  s = cambiarTramo(s, LUN, 1, "desde", "11:00");
  s = cambiarTramo(s, LUN, 1, "hasta", "13:00");
  const e = erroresDe(s)[LUN];
  assert.match(e[0] ?? "", /pisa/);
  assert.match(e[1] ?? "", /pisa/);
});

test("«+ Otro» arranca donde termina el último tramo del día", () => {
  const s = agregarOtro(alternarBloque(semanaVacia(), LUN, TARDE), LUN);
  assert.deepEqual(s[LUN][1], { desde: "21:00", hasta: "23:00" });
  assert.deepEqual(agregarOtro(semanaVacia(), MAR)[MAR], [{ desde: "18:00", hasta: "20:00" }]);
  assert.equal(hayErrores(s), false);
});

test("vista previa: «El alumno va a ver: lun 8, 9, 10, 11» (M-082)", () => {
  const s = alternarBloque(semanaVacia(), LUN, MANANA);
  assert.equal(vistaPrevia(s, 60), "El alumno va a ver: lun 8, 9, 10, 11");
  // Con 90 minutos entra de a una clase entera: 8:00 y 9:30 (11:00 terminaría 12:30).
  assert.deepEqual(horasDelDia(s[LUN], 90), ["08:00", "09:30"]);
  assert.equal(vistaPrevia(semanaVacia(), 60), "El alumno todavía no ve ningún horario.");
  // El domingo va al final (la semana del profe arranca el lunes).
  const conDomingo = alternarBloque(alternarBloque(semanaVacia(), 0, MANANA), LUN, MANANA);
  assert.match(vistaPrevia(conDomingo, 120), /^El alumno va a ver: lun 8, 10 · dom 8, 10$/);
});

test("iguales / cambios sin guardar", () => {
  const a = alternarBloque(semanaVacia(), LUN, MANANA);
  assert.ok(iguales(a, semanaDesde([{ diaSemana: 1, desde: "08:00", hasta: "12:00" }])));
  assert.ok(!iguales(a, alternarBloque(a, MAR, MANANA)));
});

test("ruedas cada 30 min y resumen de la tarjeta", () => {
  assert.equal(OPCIONES_HORA[0], "06:00");
  assert.equal(OPCIONES_HORA[1], "06:30");
  assert.equal(OPCIONES_HORA.at(-1), "23:30");
  assert.equal(
    resumenSemana([
      { diaSemana: 1, desde: "08:00", hasta: "12:00" },
      { diaSemana: 1, desde: "16:00", hasta: "21:00" },
      { diaSemana: 2, desde: "08:30", hasta: "12:00" },
    ]),
    "lun 8–12 y 16–21 · mar 8:30–12",
  );
  assert.equal(resumenSemana([]), "");
});
