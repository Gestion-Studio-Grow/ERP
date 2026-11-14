// Certificación adversarial PR #110 (gsg-certificador, 11/11/2026): lista de Cuentas a cobrar = «A cobrar» con monedas mezcladas.
/* eslint-disable @typescript-eslint/no-explicit-any -- test adversarial del certificador, copiado tal cual */
import { test } from "node:test";
import assert from "node:assert/strict";
import { cobranza, cobranzaEnMoneda, repartoDelNegocio, resumenConCobranza, sinCalendarioDelNegocio } from "./cobranza-core";
import { aPesos, proyeccionDeCaja } from "./gestion-core";

const hoy = new Date(2026, 10, 11);
const d = (dias: number) => new Date(hoy.getTime() + dias * 864e5);
const sum = (a: number[]) => Math.round(a.reduce((s, x) => s + x, 0) * 100) / 100;
type Cuota = { id: string; proyectoId: string | null; tipo: string; monto: number; moneda: string; venceEl: Date; pagadoEl: Date | null };

function tres(cuotas: Cuota[], t: Record<string, number>, m: Map<string, any>) {
  const { pendiente } = repartoDelNegocio(cuotas, t, m);
  const res = resumenConCobranza(cuotas, t, m, hoy);
  const sinCal = sinCalendarioDelNegocio(cuotas, pendiente, t, m);
  const filas = sum([...cuotas.map((q, i) => (q.tipo === "COBRO" && !q.pagadoEl ? aPesos(pendiente[i], q.moneda, t) : 0)), ...sinCal.map((f: any) => f.pesos)]);
  const conP = cuotas.map((q, i) => ({ ...q, pendiente: pendiente[i] }));
  const proy = sum(proyeccionDeCaja({ cajaHoy: 0, cuotas: conP, sueldosMes: 0, fijos: [], tiposDeCambio: t, meses: 6, hoy }).map((x: any) => x.cobros));
  return { res, kpi: res.aCobrar, filas, proy, sinCal, pendiente };
}

test("A1 proyecto en pesos con cuota en USD que cubre todo (un poco más): ¿renglón «Sin calendario» fantasma?", () => {
  const t = { USD: 1500.01 };
  const cuotas: Cuota[] = [{ id: "q1", proyectoId: "P", tipo: "COBRO", monto: 100, moneda: "USD", venceEl: d(5), pagadoEl: null }];
  const r = tres(cuotas, t, new Map([["P", cobranza(150_000, [])]]));
  console.log("A1", JSON.stringify({ kpi: r.kpi, filas: r.filas, sinCal: r.sinCal, pend: r.pendiente }));
  assert.equal(r.filas, r.kpi);
  assert.deepEqual(r.sinCal, [], "la cuota de US$ 100 cubre los $150.000 y aun así aparece «Sin calendario»");
});

test("A2 proyecto en USD (tc con decimales) y cuotas USD: lista == KPI al centavo", () => {
  const t = { USD: 1452.5 };
  const cob = cobranzaEnMoneda(145_250, [], { moneda: "USD", cambioVenta: 1452.5, tcHoy: 1452.5 }); // 100 USD
  const cuotas: Cuota[] = [0, 1, 2].map((k) => ({ id: "q" + k, proyectoId: "P", tipo: "COBRO", monto: 33.33, moneda: "USD", venceEl: d(5 + 30 * k), pagadoEl: null }));
  const r = tres(cuotas, t, new Map([["P", cob]]));
  console.log("A2", JSON.stringify({ kpi: r.kpi, filas: r.filas, proy: r.proy, sinCal: r.sinCal }));
  assert.equal(r.filas, r.kpi, "lista != KPI");
});

test("A3 proyecto en USD con cuota en pesos: lista == KPI", () => {
  const t = { USD: 1457.37 };
  const cob = cobranzaEnMoneda(100_000, [], { moneda: "USD", cambioVenta: 1000, tcHoy: 1457.37 });
  const cuotas: Cuota[] = [{ id: "q1", proyectoId: "P", tipo: "COBRO", monto: 77_777.77, moneda: "ARS", venceEl: d(5), pagadoEl: null }];
  const r = tres(cuotas, t, new Map([["P", cob]]));
  console.log("A3", JSON.stringify({ kpi: r.kpi, filas: r.filas, sinCal: r.sinCal }));
  assert.ok(Math.abs(r.filas - r.kpi) <= 0.01, `lista ${r.filas} != KPI ${r.kpi}`);
});

// Generador determinista.
function rng(seed: number) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32); }

test("A4 fuzz 3000 negocios: lista==KPI, sin negativos, F3 exacto, proyección = KPI − sin calendario (cuotas ≤ 6 meses)", () => {
  const R = rng(110);
  let peor = 0, peorCaso = "", f3 = 0, negativos = 0, proyMal = 0, peorProy = 0;
  for (let n = 0; n < 3000; n++) {
    const tcU = [1000, 1452.5, 1457.37, 1500.01][Math.floor(R() * 4)];
    const t = { USD: tcU };
    const m = new Map<string, any>();
    const cuotas: Cuota[] = [];
    for (let p = 0; p < 3; p++) {
      const id = "P" + p, usd = R() < 0.5, total = Math.round(R() * 300_000 * 100) / 100;
      const cobros = Array.from({ length: Math.floor(R() * 3) }, () => ({ monto: Math.round(R() * total * 0.6 * 100) / 100, ...(R() < 0.2 && { anuladoEl: hoy }) }));
      m.set(id, usd ? cobranzaEnMoneda(total, cobros, { moneda: "USD", cambioVenta: 1000, tcHoy: tcU }) : cobranza(total, cobros));
      for (let k = 0; k < Math.floor(R() * 4); k++) {
        const mon = R() < 0.5 ? "USD" : "ARS";
        const monto = Math.round(R() * (mon === "USD" ? 120 : 120_000) * 100) / 100;
        cuotas.push({ id: id + "q" + k, proyectoId: id, tipo: "COBRO", monto, moneda: mon, venceEl: d(Math.floor(R() * 150) - 20), pagadoEl: R() < 0.15 ? hoy : null });
      }
    }
    if (R() < 0.5) cuotas.push({ id: "e", proyectoId: null, tipo: "COBRO", monto: Math.round(R() * 5000 * 100) / 100, moneda: "ARS", venceEl: d(3), pagadoEl: null });
    const r = tres(cuotas, t, m);
    const dif = Math.abs(r.filas - r.kpi);
    if (dif > peor) { peor = dif; peorCaso = JSON.stringify({ tcU, kpi: r.kpi, filas: r.filas, sinCal: r.sinCal }); }
    if (r.res.aCobrarDeEventos + r.res.aCobrarDeEmpresa !== r.res.aCobrar) f3++;
    if (r.sinCal.some((f: any) => f.monto < 0 || f.pesos < 0) || r.pendiente.some((x: number) => x < 0)) negativos++;
    const esperadoProy = sum([r.kpi, ...r.sinCal.map((f: any) => -f.pesos)]);
    const dp = Math.abs(r.proy - esperadoProy);
    if (dp > 0.011) { proyMal++; peorProy = Math.max(peorProy, dp); }
  }
  console.log("A4", JSON.stringify({ peorDifListaKpi: peor, peorCaso, f3NoExacto: f3, negativos, proyMal, peorProy }));
  assert.equal(negativos, 0);
  assert.ok(peor <= 0.011, `lista != KPI hasta ${peor}`);
});

test("A5 sólo ARS (sin cambio de moneda): lista == KPI y F3 dentro de 0,01, fuzz", () => {
  const R = rng(7);
  let peor = 0, f3 = 0;
  for (let n = 0; n < 3000; n++) {
    const m = new Map<string, any>(); const cuotas: Cuota[] = [];
    for (let p = 0; p < 3; p++) {
      const id = "P" + p, total = Math.round(R() * 300_000 * 100) / 100;
      m.set(id, cobranza(total, Array.from({ length: Math.floor(R() * 3) }, () => ({ monto: Math.round(R() * total * 0.7 * 100) / 100 }))));
      for (let k = 0; k < Math.floor(R() * 4); k++) cuotas.push({ id: id + k, proyectoId: id, tipo: "COBRO", monto: Math.round(R() * 120_000 * 100) / 100, moneda: "ARS", venceEl: d(Math.floor(R() * 150) - 20), pagadoEl: R() < 0.15 ? hoy : null });
    }
    cuotas.push({ id: "e", proyectoId: null, tipo: "COBRO", monto: 0.1, moneda: "ARS", venceEl: d(3), pagadoEl: null });
    const r = tres(cuotas, {}, m);
    peor = Math.max(peor, Math.abs(r.filas - r.kpi));
    if (Math.abs(r.res.aCobrarDeEventos + r.res.aCobrarDeEmpresa - r.res.aCobrar) > 0.005) f3++;
  }
  console.log("A5", JSON.stringify({ peor, f3 }));
  assert.equal(peor, 0); assert.equal(f3, 0);
});

test("A6 saldo a favor con cuotas pendientes: sin renglón, pendientes 0, KPI 0", () => {
  const cuotas: Cuota[] = [{ id: "q1", proyectoId: "P", tipo: "COBRO", monto: 50, moneda: "USD", venceEl: d(5), pagadoEl: null }];
  const cob = cobranzaEnMoneda(100_000, [{ monto: 200_000 }], { moneda: "USD", cambioVenta: 1000, tcHoy: 1500 });
  const r = tres(cuotas, { USD: 1500 }, new Map([["P", cob]]));
  assert.deepEqual([r.kpi, r.filas, r.proy, r.sinCal.length], [0, 0, 0, 0]);
});

test("A7 F3 en mezcla de monedas, tolerancia 0,005; y arreglo sugerido (pesos del renglón = porCobrar − Σ pesos de cuotas) cierra exacto", () => {
  const R = rng(110);
  let f3 = 0, peorArreglo = 0;
  for (let n = 0; n < 3000; n++) {
    const tcU = [1000, 1452.5, 1457.37, 1500.01][Math.floor(R() * 4)];
    const t = { USD: tcU }; const m = new Map<string, any>(); const cuotas: Cuota[] = [];
    for (let p = 0; p < 3; p++) {
      const id = "P" + p, usd = R() < 0.5, total = Math.round(R() * 300_000 * 100) / 100;
      const cobros = Array.from({ length: Math.floor(R() * 3) }, () => ({ monto: Math.round(R() * total * 0.6 * 100) / 100 }));
      m.set(id, usd ? cobranzaEnMoneda(total, cobros, { moneda: "USD", cambioVenta: 1000, tcHoy: tcU }) : cobranza(total, cobros));
      for (let k = 0; k < Math.floor(R() * 4); k++) { const mon = R() < 0.5 ? "USD" : "ARS"; cuotas.push({ id: id + k, proyectoId: id, tipo: "COBRO", monto: Math.round(R() * (mon === "USD" ? 120 : 120_000) * 100) / 100, moneda: mon, venceEl: d(5), pagadoEl: null }); }
    }
    const r = tres(cuotas, t, m);
    if (Math.abs(r.res.aCobrarDeEventos + r.res.aCobrarDeEmpresa - r.res.aCobrar) > 0.005) f3++;
    // Arreglo: por proyecto, pesos = porCobrar − Σ aPesos(pendiente) (≥ 0).
    let filas = 0;
    cuotas.forEach((q, i) => (filas += aPesos(r.pendiente[i], q.moneda, t)));
    for (const [id, c] of m) { const esp = cuotas.reduce((s, q, i) => (q.proyectoId === id ? s + aPesos(r.pendiente[i], q.moneda, t) : s), 0); filas += Math.max(0, Math.round((c.porCobrar - esp) * 100) / 100); }
    peorArreglo = Math.max(peorArreglo, Math.abs(Math.round(filas * 100) / 100 - r.kpi));
  }
  console.log("A7", JSON.stringify({ f3, peorArreglo }));
  assert.equal(f3, 0);
});
