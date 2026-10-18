// La semana tipo y el factor de los días que vienen, con una carnicería de ejemplo: lunes a jueves
// vende 1, viernes y sábado 3, el domingo cierra.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DIAS_MINIMOS_PARA_PERFIL,
  diasDelPeriodo,
  diaDeLaSemana,
  factorDeLaVentana,
  perfilSemanal,
  sumarDias,
} from "./semana-tipo";
import type { FilaPorDia } from "./ventas-mostrador";

/** 28 días hasta `hoy` (sin hoy) con la venta de cada día de la semana. */
function carniceria(hoy: string, porDiaDeLaSemana: number[]): FilaPorDia[] {
  return diasDelPeriodo(hoy, 28)
    .filter((d) => d !== hoy)
    .map((dia) => ({ dia, total: porDiaDeLaSemana[diaDeLaSemana(dia)], cantidad: porDiaDeLaSemana[diaDeLaSemana(dia)] }))
    .filter((f) => f.total > 0);
}
const SEMANA = [1, 1, 1, 1, 3, 3, 0];

test("el perfil: cada día contra el día promedio (un sábado que vende el triple pesa más de 2; el domingo cerrado, 0)", () => {
  const p = perfilSemanal(carniceria("2026-10-18", SEMANA), "2026-10-18", 28);
  assert.equal(p.diasConVenta, 24);
  const media = 10 / 7;
  assert.deepEqual(p.pesos.map((x) => Math.round(x * 1000) / 1000), SEMANA.map((v) => Math.round((v / media) * 1000) / 1000));
  assert.equal(p.pesos[6], 0);
});

test("el factor mira los 9 días desde mañana: arrancando un domingo cae en 0,93; un miércoles (dos viernes y un sábado adentro), 1,09", () => {
  const domingo = "2026-10-18";
  assert.equal(diaDeLaSemana(domingo), 6);
  assert.equal(factorDeLaVentana(perfilSemanal(carniceria(domingo, SEMANA), domingo, 28), domingo, 9), 0.93);
  const miercoles = "2026-10-14";
  assert.equal(factorDeLaVentana(perfilSemanal(carniceria(miercoles, SEMANA), miercoles, 28), miercoles, 9), 1.09);
});

test("una semana pareja da factor 1; el factor queda entre 0,5 y 2", () => {
  const hoy = "2026-10-18";
  assert.equal(factorDeLaVentana(perfilSemanal(carniceria(hoy, [2, 2, 2, 2, 2, 2, 2]), hoy, 28), hoy, 9), 1);
  assert.equal(factorDeLaVentana({ pesos: [5, 5, 5, 5, 5, 5, 5], diasConVenta: 20 }, hoy, 9), 2);
  assert.equal(factorDeLaVentana({ pesos: [0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1], diasConVenta: 20 }, hoy, 9), 0.5);
});

test(`con menos de ${DIAS_MINIMOS_PARA_PERFIL} días con venta no se ajusta (factor 1)`, () => {
  const hoy = "2026-10-18";
  const pocas = carniceria(hoy, SEMANA).slice(0, DIAS_MINIMOS_PARA_PERFIL - 1);
  const p = perfilSemanal(pocas, hoy, 28);
  assert.equal(p.diasConVenta, DIAS_MINIMOS_PARA_PERFIL - 1);
  assert.equal(factorDeLaVentana(p, hoy, 9), 1);
  assert.equal(factorDeLaVentana(perfilSemanal([], hoy, 28), hoy, 9), 1);
});

test("hoy no cuenta (todavía no terminó) y la aritmética de días cruza meses", () => {
  const hoy = "2026-10-18";
  const conHoy = [...carniceria(hoy, SEMANA), { dia: hoy, total: 500, cantidad: 500 }];
  assert.deepEqual(perfilSemanal(conHoy, hoy, 28), perfilSemanal(carniceria(hoy, SEMANA), hoy, 28));
  assert.equal(sumarDias("2026-10-30", 3), "2026-11-02");
  assert.equal(sumarDias("2026-03-01", -1), "2026-02-28");
});
