// Los turnos sin cerrar: el número de la Agenda con su aviso y el conteo de «Todos los turnos».
// Contra una base falsa que anota la consulta: una sola, siempre con el negocio (CH-062: cada
// negocio ve sólo los suyos), sin tope de días y con el `where` de la pantalla.

import { test } from "node:test";
import assert from "node:assert/strict";
import { rangoDelDia } from "@/lib/turnos/turno-abierto";
import { LOADERS_KPI } from "./loaders.server";
import {
  agendaConSinCerrar,
  contarTurnosSinCerrar,
  resumirAgendaConSinCerrar,
  whereSinCerrar,
} from "./turnos-sin-cerrar.server";
import type { ContextoLoader, DbKpi } from "./nucleo.server";

const HOY = "2026-10-22";
const { desde: HOY_DESDE } = rangoDelDia(HOY);
const { desde: AYER_DESDE } = rangoDelDia("2026-10-21");
const a = (iso: string) => new Date(iso);

test("whereSinCerrar: Reservados y Confirmados del negocio con la hora pasada, sin tope de días", () => {
  const ahora = a("2026-10-22T15:00:00.000Z");
  assert.deepEqual(whereSinCerrar("t-ch", ahora), {
    tenantId: "t-ch",
    status: { in: ["PENDING", "CONFIRMED"] },
    startsAt: { lt: ahora },
  });
});

test("contarTurnosSinCerrar: una consulta, con el negocio en el where (CH-062)", async () => {
  const llamadas: unknown[] = [];
  const db = { appointment: { count: async (args: unknown) => (llamadas.push(args), 7) } } as unknown as Parameters<typeof contarTurnosSinCerrar>[0];
  const ahora = a("2026-10-22T15:00:00.000Z");
  assert.equal(await contarTurnosSinCerrar(db, "t-ch", ahora), 7);
  assert.deepEqual(llamadas, [{ where: whereSinCerrar("t-ch", ahora) }]);
});

test("el número de la Agenda sigue igual y suma el aviso de los de días anteriores", () => {
  const hoy = [
    { status: "CONFIRMED", startsAt: a("2026-10-22T13:00:00.000Z") },
    { status: "PENDING", startsAt: a("2026-10-22T14:00:00.000Z") },
    { status: "COMPLETED", startsAt: a("2026-10-22T12:00:00.000Z") },
  ];
  // Sin pasados: el número de siempre, sin aviso.
  const limpio = resumirAgendaConSinCerrar(hoy, HOY_DESDE, AYER_DESDE);
  assert.deepEqual(limpio, { valor: "3", detalle: "turnos hoy · 50% de los que faltan confirmados" });
  // Con 2 de ayer (un Reservado y un Confirmado) y un completado de ayer (ése no cuenta).
  const deAyer = [
    ...hoy,
    { status: "PENDING", startsAt: a("2026-10-21T13:00:00.000Z") },
    { status: "CONFIRMED", startsAt: a("2026-10-21T20:00:00.000Z") },
    { status: "COMPLETED", startsAt: a("2026-10-21T15:00:00.000Z") },
  ];
  const r = resumirAgendaConSinCerrar(deAyer, HOY_DESDE, AYER_DESDE);
  assert.ok(!("sinDato" in r));
  assert.equal(r.valor, "3");
  assert.deepEqual(r.alerta, { valor: "2", texto: "turnos de ayer sin cerrar" });
  // Uno de hace 4 meses también cuenta (sin tope), y ya no son «de ayer».
  const viejo = resumirAgendaConSinCerrar([...deAyer, { status: "PENDING", startsAt: a("2026-06-10T13:00:00.000Z") }], HOY_DESDE, AYER_DESDE);
  assert.ok(!("sinDato" in viejo));
  assert.deepEqual(viejo.alerta, { valor: "3", texto: "turnos sin cerrar de días anteriores" });
  // Los de HOY con la hora pasada no son aviso: se están atendiendo.
  const soloHoy = resumirAgendaConSinCerrar([{ status: "PENDING", startsAt: a("2026-10-22T11:00:00.000Z") }], HOY_DESDE, AYER_DESDE);
  assert.ok(!("sinDato" in soloHoy));
  assert.equal(soloHoy.alerta, undefined);
});

test("el loader de la Agenda: UNA consulta, con el negocio arriba del OR, y reemplaza al de siempre", async () => {
  const llamadas: { where: Record<string, unknown> }[] = [];
  const filas = [
    { status: "CONFIRMED", startsAt: a("2026-10-22T13:00:00.000Z") },
    { status: "PENDING", startsAt: a("2026-10-20T13:00:00.000Z") },
  ];
  const db = {
    appointment: { findMany: async (args: { where: Record<string, unknown> }) => (llamadas.push(args), filas) },
  } as unknown as DbKpi;
  const ctx: ContextoLoader = {
    db,
    tenantId: "t-ch",
    hoy: HOY,
    ahora: a("2026-10-22T15:00:00.000Z"),
    esMostrador: false,
    sustantivo: { uno: "servicio", varios: "servicios" },
    monto: false,
  };
  const r = await agendaConSinCerrar(ctx);
  assert.equal(llamadas.length, 1);
  assert.equal(llamadas[0].where.tenantId, "t-ch");
  assert.ok(r && !("sinDato" in r));
  assert.deepEqual(r.alerta, { valor: "1", texto: "turno sin cerrar de días anteriores" });
  assert.equal(LOADERS_KPI.agenda, agendaConSinCerrar);
});
