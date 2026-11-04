import { test } from "node:test";
import assert from "node:assert/strict";
import { calcularVencimientos, diaIso, estadoEfectivo, habilDesde, type TablaVencimientos } from "./vencimientos";
import { FERIADOS_2026, TABLA_VENCIMIENTOS_2026, TABLA_VENCIMIENTOS_2026_PROVISIONAL } from "./tabla-vencimientos-2026";

const CUIT_TERMINA_6 = "20123456786"; // válido (lo usan otros tests del repo)
const d = (s: string) => new Date(`${s}T00:00:00Z`);

const TABLA: TablaVencimientos = {
  anio: 2026,
  provisional: true,
  obligaciones: [
    {
      codigo: "IVA_MENSUAL",
      nombre: "IVA",
      organismo: "ARCA",
      periodicidad: "MENSUAL",
      accion: "AMBAS",
      mesesHastaVencimiento: 1,
      // terminación 6 → día 18 de abril de 2026 (sábado), 2 de mayo (sábado) para probar corrimientos
      diasPorMes: { "2026-04": [1, 1, 1, 1, 1, 1, 18, 1, 1, 1], "2026-05": [1, 1, 1, 1, 1, 1, 1, 1, 1, 1] },
    },
    {
      codigo: "GANANCIAS_ANTICIPO",
      nombre: "Anticipos",
      organismo: "ARCA",
      periodicidad: "ANTICIPO",
      accion: "PAGO",
      porPeriodo: { "2026": [{ cuota: 1, mes: "2026-08" }, { cuota: 2, mes: "2026-09" }] },
      diasPorMes: { "2026-08": [13, 13, 13, 13, 13, 13, 13, 13, 13, 13] },
    },
  ],
};

test("la tabla de ejemplo está marcada provisional", () => {
  assert.equal(TABLA_VENCIMIENTOS_2026_PROVISIONAL, true);
  assert.equal(TABLA_VENCIMIENTOS_2026.provisional, true);
});

test("CUIT inválido o período mal escrito: error claro", () => {
  assert.equal((calcularVencimientos("20123456789", "2026-03", TABLA) as { error: string }).error, "CUIT_INVALIDO");
  assert.equal((calcularVencimientos(CUIT_TERMINA_6, "2026-13", TABLA) as { error: string }).error, "PERIODO_INVALIDO");
});

test("mensual: día por terminación de CUIT, sábado → lunes", () => {
  const r = calcularVencimientos("20-12345678-6", "2026-03", TABLA);
  assert.ok(r.ok);
  assert.equal(r.terminacion, 6);
  assert.equal(r.vencimientos.length, 1);
  const v = r.vencimientos[0];
  assert.equal(diaIso(v.fechaSegunTabla), "2026-04-18"); // sábado
  assert.equal(diaIso(v.fechaVencimiento), "2026-04-20"); // lunes
  assert.equal(v.corrido, true);
  assert.equal(v.cuota, 0);
});

test("feriado: corre al hábil siguiente (y encadena fin de semana)", () => {
  // 2026-05-01 viernes feriado → sábado → domingo → lunes 4
  const r = calcularVencimientos(CUIT_TERMINA_6, "2026-04", TABLA, ["2026-05-01"]);
  assert.ok(r.ok);
  assert.equal(diaIso(r.vencimientos[0].fechaVencimiento), "2026-05-04");
  assert.equal(diaIso(habilDesde(d("2026-05-04"))), "2026-05-04");
});

test("anticipos: período YYYY con cuotas; mes sin dato en la tabla → aviso, no fecha inventada", () => {
  const r = calcularVencimientos(CUIT_TERMINA_6, "2026", TABLA);
  assert.ok(r.ok);
  assert.deepEqual(r.vencimientos.map((v) => [v.codigo, v.cuota, diaIso(v.fechaVencimiento)]), [["GANANCIAS_ANTICIPO", 1, "2026-08-13"]]);
  assert.equal(r.avisos.length, 1);
  assert.match(r.avisos[0], /2026-09/);
});

test("filtro por códigos de obligación activos", () => {
  const r = calcularVencimientos(CUIT_TERMINA_6, "2026-03", TABLA, [], ["GANANCIAS_ANTICIPO"]);
  assert.ok(r.ok);
  assert.equal(r.vencimientos.length, 0);
});

test("la tabla 2026 de ejemplo da fechas hábiles para todo el año", () => {
  const fer = new Set(FERIADOS_2026);
  for (let m = 1; m <= 11; m++) {
    const r = calcularVencimientos(CUIT_TERMINA_6, `2026-${String(m).padStart(2, "0")}`, TABLA_VENCIMIENTOS_2026, FERIADOS_2026);
    assert.ok(r.ok);
    assert.ok(r.vencimientos.length >= 5);
    for (const v of r.vencimientos) {
      const dow = v.fechaVencimiento.getUTCDay();
      assert.ok(dow !== 0 && dow !== 6 && !fer.has(diaIso(v.fechaVencimiento)), `${v.codigo} ${diaIso(v.fechaVencimiento)}`);
    }
  }
});

test("estadoEfectivo: VENCIDO se deriva sólo para PENDIENTE/EN_CURSO pasada la fecha (hora argentina)", () => {
  const venc = { fechaVencimiento: d("2026-04-20"), estado: "PENDIENTE" as const };
  // 20/04 23:30 en Argentina = 21/04 02:30 UTC: todavía es el día del vencimiento.
  assert.equal(estadoEfectivo(venc, new Date("2026-04-21T02:30:00Z")), "PENDIENTE");
  assert.equal(estadoEfectivo(venc, new Date("2026-04-21T03:30:00Z")), "VENCIDO");
  assert.equal(estadoEfectivo({ ...venc, estado: "EN_CURSO" }, new Date("2026-05-01T12:00:00Z")), "VENCIDO");
  assert.equal(estadoEfectivo({ ...venc, estado: "PAGADO" }, new Date("2026-05-01T12:00:00Z")), "PAGADO");
  assert.equal(estadoEfectivo({ ...venc, estado: "SIN_SALDO" }, new Date("2026-05-01T12:00:00Z")), "SIN_SALDO");
});
