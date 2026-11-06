// Las comisiones pendientes EJECUTADAS: la misma base de siempre (lo cobrado, turnos saldados,
// % del profesional o del servicio) y a qué pantalla vuelve la liquidación.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  comisionesPendientes,
  contarTurnosEsperandoSaldo,
  overridesPorProfesional,
  textoDeEsperaPorSaldo,
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

test("R6 · CH lee «espera hasta que se salde» sólo si hay un turno esperando; los demás rubros, como siempre", () => {
  assert.equal(textoDeEsperaPorSaldo(null), "un turno con saldo sin cobrar espera hasta que se salde");
  assert.equal(textoDeEsperaPorSaldo(0), null);
  assert.equal(textoDeEsperaPorSaldo(1), "1 turno con saldo sin cobrar espera hasta que se salde");
  assert.equal(textoDeEsperaPorSaldo(3), "3 turnos con saldo sin cobrar esperan hasta que se salden");
  const pagina = readFileSync(join(process.cwd(), "src/app/admin/(dashboard)/comisiones/page.tsx"), "utf8");
  assert.doesNotMatch(pagina, /"un turno con saldo sin cobrar/, "ya no es texto fijo en la pantalla");
  assert.match(pagina, /textoDeEsperaPorSaldo\(esperando\)/);
  assert.match(pagina, /esEstetica\(await getCurrentTenantSlug\(\)\) \? await getTurnosEsperandoSaldo\(\) : null/);
});

test("R6 · cuenta los turnos con saldo que dejarían comisión: saldado o sin comisión, no esperan", () => {
  const sinCobrar = { precio: 12000, payment: null, cobros: [] };
  const conSenia = { precio: 12000, payment: { status: "APPROVED", amount: 5000 }, cobros: [{ amount: 5000, method: "EFECTIVO" }] };
  const saldado = { precio: 8000, payment: { status: "APPROVED", amount: 8000 }, cobros: [] };
  const sinPct = new Map<string, ReadonlyMap<string, number>>();
  assert.equal(contarTurnosEsperandoSaldo([turno({ id: "a", ...saldado })], sinPct), 0);
  assert.equal(contarTurnosEsperandoSaldo([turno({ id: "a", ...conSenia }), turno({ id: "b", ...sinCobrar }), turno({ id: "c", ...saldado })], sinPct), 2);
  assert.equal(contarTurnosEsperandoSaldo([turno({ id: "a", ...conSenia, pctGeneral: 0 })], sinPct), 0, "sin comisión no hay nada que esperar");
});

test("lo pendiente descuenta lo pagado con voucher: cobro 10.000 con 4.000 de voucher → base 6.000", () => {
  const p = comisionesPendientes(
    [
      turno({
        id: "v1",
        payment: { status: "APPROVED", amount: 10000 },
        cobros: [
          { amount: 4000, method: "VOUCHER" },
          { amount: 6000, method: "EFECTIVO" },
        ],
      }),
    ],
    overridesPorProfesional([]),
  );
  // 40 % de 6.000, no de 10.000.
  assert.deepEqual(p.map((c) => [c.professionalId, c.amount, c.ingresos, c.appointmentCount]), [["ana", 2400, 6000, 1]]);
});
