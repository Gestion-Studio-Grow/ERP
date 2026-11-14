// F1 · La regla de la comisión no rendida, en un solo lugar, y que las tres lecturas la apliquen igual:
// `comisionesPendientes` (Inicio, Comisiones, Reportes), `armarVistaPrevia` (vista previa y «Mi
// liquidación») y `settleCommissions` (lo que se paga).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { businessWallTimeToUtc } from "@/lib/datetime";
import { comisionesPendientes, totalALiquidar, type TurnoPendiente } from "@/lib/reports/comisiones";
import { POLITICA_COMISION_NO_RENDIDA, seLiquidaSegunRendicion } from "./comision-no-rendida";
import { leerPeriodo } from "./periodo";
import { armarVistaPrevia } from "./vista-previa";

const oct = leerPeriodo("2026-10")!;
let n = 0;
const turno = (o: Partial<TurnoPendiente> & { monto: number }): TurnoPendiente => ({
  id: `t${++n}`,
  serviceId: "srv",
  startsAt: businessWallTimeToUtc("2026-10-10", "10:00"),
  professionalId: o.professionalId ?? "laura",
  professionalName: o.professionalName ?? "Laura",
  pctGeneral: 40,
  precio: o.monto,
  cobros: [{ amount: o.monto, method: "EFECTIVO" }],
  payment: { status: "APPROVED", amount: o.monto },
  servicio: "Esculpidas",
  clienta: "Clienta",
  pendienteDeRendir: o.pendienteDeRendir,
});

test("la política vigente es «esperar» (A): con algo sin rendir no se paga", () => {
  assert.equal(POLITICA_COMISION_NO_RENDIDA, "esperar");
  assert.equal(seLiquidaSegunRendicion(0), true);
  assert.equal(seLiquidaSegunRendicion(undefined), true, "sin las tablas no hay nada pendiente: como hoy");
  assert.equal(seLiquidaSegunRendicion(null), true);
  assert.equal(seLiquidaSegunRendicion(37_000), false);
  assert.equal(seLiquidaSegunRendicion(0.01), false);
  assert.equal(seLiquidaSegunRendicion(Number.NaN), false, "un monto ilegible no habilita un pago");
});

test("«descontar» (B) no está implementada: elegirla corta en vez de pagar sin descontar", () => {
  assert.throws(() => seLiquidaSegunRendicion(37_000, "descontar"), /sin implementar/);
});

test("caso Laura: $37.000 sin rendir → nada a liquidar y «pendiente de rendir $37.000» con su comisión", () => {
  const turnos = [turno({ monto: 37_000, pendienteDeRendir: 37_000 })];
  assert.deepEqual(comisionesPendientes(turnos, new Map()), [], "Comisiones / Inicio / Reportes: nada");
  assert.deepEqual(totalALiquidar(comisionesPendientes(turnos, new Map())), { monto: 0, profesionales: 0 });
  const v = armarVistaPrevia(turnos, new Map(), oct);
  assert.equal(v.totalCents, 0);
  assert.deepEqual(v.profesionales, [], "sin botón de liquidar");
  assert.equal(v.pendientesDeRendir.length, 1);
  const p = v.pendientesDeRendir[0];
  assert.equal(p.professionalName, "Laura");
  assert.equal(p.pendienteDeRendirCents, 3_700_000);
  assert.equal(p.comisionCents, 1_480_000);
  assert.equal(p.lineas[0].pendienteDeRendirCents, 3_700_000);
});

test("rendido: entra al total y la vista previa, y coinciden", () => {
  const turnos = [turno({ monto: 37_000, pendienteDeRendir: 0 })];
  const [p] = comisionesPendientes(turnos, new Map());
  assert.equal(p.amount, 14_800);
  const v = armarVistaPrevia(turnos, new Map(), oct);
  assert.equal(v.totalCents, 1_480_000);
  assert.deepEqual(v.pendientesDeRendir, []);
});

test("mixto: sólo se paga lo rendido; lo sin rendir queda aparte y no suma en el total", () => {
  const turnos = [turno({ monto: 37_000, pendienteDeRendir: 0 }), turno({ monto: 20_000, pendienteDeRendir: 20_000 })];
  const [p] = comisionesPendientes(turnos, new Map());
  assert.equal(p.amount, 14_800);
  assert.equal(p.appointmentCount, 1);
  const v = armarVistaPrevia(turnos, new Map(), oct);
  assert.equal(v.totalCents, 1_480_000);
  assert.equal(v.profesionales[0].lineas.length, 1);
  assert.equal(v.profesionales[0].detalleCuadra, true);
  assert.equal(v.pendientesDeRendir[0].comisionCents, 800_000);
});

test("settleCommissions aplica la MISMA guarda, leída en su tx con candado", () => {
  const src = readFileSync(new URL("../commission-actions.ts", import.meta.url), "utf8");
  assert.match(src, /pendienteDeRendirPorTurnoInTx\(tx, tenantId, candidatos\.map\(\(c\) => c\.id\), \{ bloquear: true \}\)/);
  assert.match(src, /candidatos\.filter\(\(c\) => seLiquidaSegunRendicion\(pendienteDeRendir\.get\(c\.id\)\)\)/);
});
