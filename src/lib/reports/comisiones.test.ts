// Las comisiones pendientes EJECUTADAS: la misma base de siempre (lo cobrado, turnos saldados,
// % del profesional o del servicio) y a qué pantalla vuelve la liquidación.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  comisionesPendientes,
  overridesPorProfesional,
  totalALiquidar,
  vueltaDeLiquidacion,
  whereTurnosConComisionPendiente,
  type TurnoPendiente,
} from "./comisiones";

const turno = (x: Partial<TurnoPendiente> & { id: string }): TurnoPendiente => ({
  serviceId: "corte",
  startsAt: new Date("2026-09-10T15:00:00.000Z"),
  professionalId: "ana",
  professionalName: "Ana",
  pctGeneral: 40,
  precio: 10000,
  cobros: [],
  payment: { status: "APPROVED", amount: 10000 },
  ...x,
});

test("lo pendiente por profesional: sobre lo cobrado, con el % del servicio si lo tiene; un turno con saldo espera", () => {
  const p = comisionesPendientes(
    [
      turno({ id: "t1" }),
      turno({ id: "t2", serviceId: "color", payment: { status: "APPROVED", amount: 20000 }, precio: 20000 }),
      // Con saldo: cobrado 5.000 de 12.000 → espera.
      turno({ id: "t3", precio: 12000, payment: { status: "APPROVED", amount: 5000 }, cobros: [{ amount: 5000, method: "EFECTIVO" }] }),
      turno({ id: "t4", professionalId: "beto", professionalName: "Beto", pctGeneral: 50, payment: { status: "APPROVED", amount: 8000 }, precio: 8000 }),
    ],
    overridesPorProfesional([{ professionalId: "ana", serviceId: "color", commissionPercent: 25 }]),
  );
  assert.deepEqual(
    p.map((c) => [c.professionalId, c.amount, c.ingresos, c.appointmentCount]),
    [
      ["ana", 4000 + 5000, 30000, 2],
      ["beto", 4000, 8000, 1],
    ],
  );
  assert.deepEqual(totalALiquidar(p), { monto: 13000, profesionales: 2 });
  assert.deepEqual(totalALiquidar([]), { monto: 0, profesionales: 0 });
});

test("el where es el de la liquidación: completados, cobrados y sin liquidar", () => {
  assert.deepEqual(whereTurnosConComisionPendiente("t"), {
    tenantId: "t",
    status: "COMPLETED",
    commissionPayoutId: null,
    payment: { status: "APPROVED" },
  });
});

test("la liquidación vuelve a Reportes o a Comisiones; cualquier otra cosa, a Reportes", () => {
  assert.equal(vueltaDeLiquidacion("/admin/comisiones"), "/admin/comisiones");
  assert.equal(vueltaDeLiquidacion("/admin/reportes"), "/admin/reportes");
  assert.equal(vueltaDeLiquidacion("https://otro.sitio/robo"), "/admin/reportes");
  assert.equal(vueltaDeLiquidacion(null), "/admin/reportes", "un formulario viejo (sin el campo) vuelve a donde liquidaba CH");
});
