// El reloj real del club: la regla del vanilla (`relojReal` de public/previews/breakpoint/club/app.mjs) —la madrugada
// cuenta en el día que abrió mientras no pasó el cierre de AYER (su horario)— y que con ese `Ahora` el motor manda lo
// cobrado de madrugada a la caja de 12 a 12 que corresponde.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as M from "@/lib/club/motor.mjs";
import { fechaLocal, mismoAhora, relojReal } from "./reloj-del-club";

/** Un club que abre a las 8 y cierra a `cierra` (minutos; 1500 = la 01:00 del día siguiente) todos los días. */
function clubQueCierraA(cierra: number): M.EstadoClub {
  const e = M.crearClubReal("2026-10-17");
  for (let d = 0; d < 7; d++) e.config.horarios[d] = { abre: 8 * 60, cierra };
  return e;
}
const a = (dia: number, h: number, m: number) => new Date(2026, 9, dia, h, m, 7); // hora LOCAL de este equipo

test("fechaLocal: la fecha civil de este equipo (no la de UTC)", () => {
  assert.equal(fechaLocal(a(17, 0, 5)), "2026-10-17");
  assert.equal(fechaLocal(a(17, 23, 59)), "2026-10-17");
  assert.equal(fechaLocal(new Date(2026, 0, 1, 0, 0)), "2026-01-01");
});

test("de día: la fecha y los minutos del calendario", () => {
  const e = clubQueCierraA(25 * 60);
  assert.deepEqual(relojReal(e, a(17, 10, 30)), { fecha: "2026-10-17", min: 630 });
  assert.deepEqual(relojReal(e, a(17, 23, 59)), { fecha: "2026-10-17", min: 1439 });
});

test("de madrugada, antes del cierre de ayer, sigue siendo el día que abrió (minutos ≥ 1440)", () => {
  const e = clubQueCierraA(25 * 60); // cierra a la 01:00
  assert.deepEqual(relojReal(e, a(18, 0, 0)), { fecha: "2026-10-17", min: 1440 });
  assert.deepEqual(relojReal(e, a(18, 0, 30)), { fecha: "2026-10-17", min: 1470 });
  assert.deepEqual(relojReal(e, a(18, 0, 59)), { fecha: "2026-10-17", min: 1499 });
  // En el minuto exacto del cierre ya es el día nuevo (el vanilla compara con `<`).
  assert.deepEqual(relojReal(e, a(18, 1, 0)), { fecha: "2026-10-18", min: 60 });
  // Cerrando a las 02:00, la 01:30 todavía es de ayer.
  assert.deepEqual(relojReal(clubQueCierraA(26 * 60), a(18, 1, 30)), { fecha: "2026-10-17", min: 1530 });
});

test("si ayer cerró antes de la medianoche, la madrugada es del día nuevo; sin estado, el calendario", () => {
  assert.deepEqual(relojReal(clubQueCierraA(23 * 60), a(18, 0, 30)), { fecha: "2026-10-18", min: 30 });
  assert.deepEqual(relojReal(clubQueCierraA(24 * 60), a(18, 0, 0)), { fecha: "2026-10-18", min: 0 });
  assert.deepEqual(relojReal(null, a(18, 0, 30)), { fecha: "2026-10-18", min: 30 });
});

test("usa el horario de AYER (cada día de la semana tiene el suyo)", () => {
  const e = clubQueCierraA(23 * 60);
  // El 17/10/2026 es sábado (6): sólo ese día cierra a la 01:00.
  e.config.horarios[M.diaSemana("2026-10-17")] = { abre: 8 * 60, cierra: 25 * 60 };
  assert.deepEqual(relojReal(e, a(18, 0, 30)), { fecha: "2026-10-17", min: 1470 }, "sábado a la madrugada: sigue el sábado");
  assert.deepEqual(relojReal(e, a(19, 0, 30)), { fecha: "2026-10-19", min: 30 }, "domingo cerró a las 23: el lunes ya empezó");
});

test("con el `Ahora` de la madrugada, el motor manda lo cobrado a la caja de 12 a 12 que abrió el día anterior", () => {
  const e = clubQueCierraA(25 * 60);
  const madrugada = relojReal(e, a(18, 0, 30));
  assert.equal(M.diaDeCaja(e, madrugada.fecha, madrugada.min), "2026-10-17");
  assert.equal(M.cajaAbierta(e, madrugada), "2026-10-17");
  // Y a las 13 del día siguiente ya es la caja nueva.
  const tarde = relojReal(e, a(18, 13, 0));
  assert.equal(M.cajaAbierta(e, tarde), "2026-10-18");
});

test("mismoAhora compara fecha y minuto", () => {
  assert.equal(mismoAhora({ fecha: "2026-10-17", min: 10 }, { fecha: "2026-10-17", min: 10 }), true);
  assert.equal(mismoAhora({ fecha: "2026-10-17", min: 10 }, { fecha: "2026-10-17", min: 11 }), false);
  assert.equal(mismoAhora({ fecha: "2026-10-17", min: 10 }, { fecha: "2026-10-18", min: 10 }), false);
});
