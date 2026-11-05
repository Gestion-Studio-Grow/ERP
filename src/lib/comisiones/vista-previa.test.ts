// Vista previa de la liquidación: el total es EXACTAMENTE el que congela `settleCommissions`
// (calcularLiquidacion sobre los mismos turnos, con el mismo corte), en centavos enteros, y el
// detalle por turno suma ese total. T1, docs/producto/comisiones/LIQUIDACION.md.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { businessWallTimeToUtc } from "@/lib/datetime";
import { calcularLiquidacion, type TurnoParaComision } from "@/lib/comision-liquidacion";
import { sePuedeLiquidar } from "@/lib/comision-liquidable";
import type { TurnoPendiente } from "@/lib/reports/comisiones";
import { entraEnElCorte, leerPeriodo } from "./periodo";
import { aCentavos, armarVistaPrevia } from "./vista-previa";

const oct = leerPeriodo("2026-10")!;
let n = 0;
const turno = (o: Partial<TurnoPendiente> & { dia: string; hora?: string; monto: number }): TurnoPendiente => ({
  id: `t${++n}`,
  serviceId: o.serviceId ?? "srv",
  startsAt: businessWallTimeToUtc(o.dia, o.hora ?? "10:00"),
  professionalId: o.professionalId ?? "pA",
  professionalName: o.professionalName ?? "Ana",
  pctGeneral: o.pctGeneral ?? 40,
  precio: o.precio ?? o.monto,
  cobros: o.cobros ?? [{ amount: o.monto, method: "EFECTIVO" }],
  payment: o.payment === undefined ? { status: "APPROVED", amount: o.monto } : o.payment,
  servicio: "Masaje",
  clienta: "Clienta",
});

/** Lo que hace `settleCommissions` con los turnos de UNA profesional (commission-actions.ts). */
function loQueCongela(turnos: TurnoPendiente[], pctGeneral: number, overrides: Map<string, number>, periodo = oct): number {
  const liq: TurnoParaComision[] = [];
  for (const a of turnos) {
    if (!a.payment) continue;
    if (!entraEnElCorte(a.startsAt, periodo)) continue;
    if (!sePuedeLiquidar({ precio: a.precio, cobros: a.cobros, pagoLegado: a.payment })) continue;
    liq.push({ id: a.id, serviceId: a.serviceId, base: a.payment.amount, startsAt: a.startsAt });
  }
  return calcularLiquidacion(liq, pctGeneral, overrides).amount;
}

test("el borde del período: 23:59 del 31/10 entra; 00:00 del 1/11 queda para noviembre", () => {
  const turnos = [turno({ dia: "2026-10-31", hora: "23:59", monto: 10_000 }), turno({ dia: "2026-11-01", hora: "00:00", monto: 20_000 })];
  const v = armarVistaPrevia(turnos, new Map(), oct);
  assert.equal(v.profesionales[0].lineas.length, 1);
  assert.equal(v.totalCents, 400_000);
  assert.equal(v.despuesDelCorte, 1);
});

test("saldo pendiente espera, 0 % no entra, lo de antes entra marcado", () => {
  const turnos = [
    turno({ dia: "2026-10-10", monto: 5_000, precio: 15_000, cobros: [{ amount: 5_000, method: "EFECTIVO" }] }),
    turno({ dia: "2026-10-11", monto: 15_000, serviceId: "gratis" }),
    turno({ dia: "2026-09-20", monto: 10_000 }),
    turno({ dia: "2026-10-12", monto: 10_000 }),
  ];
  const v = armarVistaPrevia(turnos, new Map([["pA", new Map([["gratis", 0]])]]), oct);
  assert.equal(v.esperandoSaldo, 1);
  const lineas = v.profesionales[0].lineas;
  assert.deepEqual(lineas.map((l) => l.deAntes), [true, false]);
  assert.equal(v.profesionales[0].totalCents, 800_000);
});

test("igualdad: la vista previa == lo que congela la liquidación, con montos y % feos, en centavos", () => {
  // Pseudoaleatorio determinístico: montos con centavos y % con decimales, override por servicio.
  let semilla = 7;
  const azar = () => ((semilla = (semilla * 1_103_515_245 + 12_345) % 2 ** 31) / 2 ** 31);
  const profesionales = [
    { id: "pA", pct: 37.5, ov: new Map([["s2", 12.25]]) },
    { id: "pB", pct: 33.33, ov: new Map([["s3", 0]]) },
  ];
  const turnos: TurnoPendiente[] = [];
  for (let i = 0; i < 400; i++) {
    const p = profesionales[i % 2];
    const dia = `2026-${azar() < 0.15 ? "11" : azar() < 0.2 ? "09" : "10"}-${String(1 + Math.floor(azar() * 28)).padStart(2, "0")}`;
    const monto = Math.round(azar() * 9_000_000) / 100 + 0.01;
    const saldado = azar() > 0.1;
    turnos.push(
      turno({
        dia,
        hora: `${String(Math.floor(azar() * 24)).padStart(2, "0")}:${String(Math.floor(azar() * 60)).padStart(2, "0")}`,
        monto,
        precio: saldado ? monto : monto + 1000,
        professionalId: p.id,
        professionalName: p.id,
        pctGeneral: p.pct,
        serviceId: `s${1 + Math.floor(azar() * 3)}`,
      }),
    );
  }
  const overrides = new Map(profesionales.map((p) => [p.id, p.ov]));
  const v = armarVistaPrevia(turnos, overrides, oct);
  assert.equal(v.profesionales.length, 2);
  for (const p of profesionales) {
    const deElla = turnos.filter((t) => t.professionalId === p.id);
    const vp = v.profesionales.find((x) => x.professionalId === p.id)!;
    assert.equal(vp.totalCents, aCentavos(loQueCongela(deElla, p.pct, p.ov)), p.id);
    assert.ok(Number.isInteger(vp.totalCents));
    assert.equal(vp.lineas.reduce((s, l) => s + l.comisionCents, 0), vp.totalCents, `${p.id}: el detalle suma el total`);
    assert.equal(vp.detalleCuadra, true);
  }
});

test("settleCommissions usa el MISMO corte (entraEnElCorte) cuando llega el período", () => {
  const src = readFileSync(new URL("../commission-actions.ts", import.meta.url), "utf8");
  assert.match(src, /if \(periodo && !entraEnElCorte\(a\.startsAt, periodo\)\) continue;/);
  assert.match(src, /calcularLiquidacion\(liquidables, professional\.commissionPercent, overrideByService\)/);
});
