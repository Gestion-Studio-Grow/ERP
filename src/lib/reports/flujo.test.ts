// El flujo de fondos EJECUTADO con un caso de prueba sumado a mano: saldo del libro, fiado,
// deudas con y sin cheque, lo vencido y lo que no tiene fecha.

import { test } from "node:test";
import assert from "node:assert/strict";
import { businessWallTimeToUtc } from "@/lib/datetime";
import { calcularFlujo, leerHorizonte, saldoDelLibro, type EntradaFlujo } from "./flujo";

const dia = (d: string) => businessWallTimeToUtc(d, "12:00");
const HOY = "2026-09-23";

function caso(extra: Partial<EntradaFlujo> = {}): EntradaFlujo {
  return {
    hoy: HOY,
    horizonte: 30,
    saldoLibro: 500000,
    aCobrar: [
      // Vence el 30/09 (semana 2): entra.
      { id: "r1", amount: 120000, issueDate: dia("2026-09-01"), dueDate: dia("2026-09-30"), saldado: 20000, saldo: 100000, quien: "Ana" },
      // Vencido: no se proyecta.
      { id: "r2", amount: 50000, issueDate: dia("2026-08-01"), dueDate: dia("2026-09-10"), saldado: 0, saldo: 50000, quien: "Beto" },
      // Sin fecha: no se proyecta.
      { id: "r3", amount: 30000, issueDate: dia("2026-09-15"), dueDate: null, saldado: 0, saldo: 30000, quien: "Caro" },
      // Vence después del horizonte (30 días = hasta el 22/10).
      { id: "r4", amount: 70000, issueDate: dia("2026-09-15"), dueDate: dia("2026-11-15"), saldado: 0, saldo: 70000, quien: "Dani" },
    ],
    aPagar: [
      // $300.000: un cheque de $200.000 al 05/10 (semana 2) y el resto ($100.000) vence el 15/10 (semana 4).
      {
        id: "a1",
        amount: 300000,
        issueDate: dia("2026-09-01"),
        dueDate: dia("2026-10-15"),
        saldo: 300000,
        quien: "Frigorífico",
        cheques: [{ id: "ch1", amount: 200000, dueDate: dia("2026-10-05"), status: "DELIVERED" }],
      },
      // Vencida el 20/09: sale HOY (semana 1).
      { id: "a2", amount: 80000, issueDate: dia("2026-08-20"), dueDate: dia("2026-09-20"), saldo: 80000, quien: "Envases", cheques: [] },
      // Un cheque rebotado no sale; la deuda sin vencimiento va aparte.
      {
        id: "a3",
        amount: 40000,
        issueDate: dia("2026-09-01"),
        dueDate: null,
        saldo: 40000,
        quien: "Limpieza",
        cheques: [{ id: "ch2", amount: 40000, dueDate: dia("2026-09-25"), status: "BOUNCED" }],
      },
    ],
    ...extra,
  };
}

test("a 30 días: coincide con la suma a mano del caso de prueba", () => {
  const f = calcularFlujo(caso());
  // Suma a mano: 500.000 + 100.000 (Ana) − 80.000 (vencida, hoy) − 200.000 (cheque) − 100.000 (resto de a1).
  assert.equal(f.hasta, "2026-10-22", "30 días contando hoy");
  assert.equal(f.totalEntra, 100000);
  assert.equal(f.totalSale, 380000);
  assert.equal(f.saldoFinal, 220000);
  assert.equal(f.semanas.length, 5);
  assert.deepEqual(
    f.semanas.map((s) => [s.desde, s.hasta, s.entra, s.sale, s.saldoAlCierre]),
    [
      ["2026-09-23", "2026-09-29", 0, 80000, 420000],
      ["2026-09-30", "2026-10-06", 100000, 200000, 320000],
      ["2026-10-07", "2026-10-13", 0, 0, 320000],
      ["2026-10-14", "2026-10-20", 0, 100000, 220000],
      ["2026-10-21", "2026-10-22", 0, 0, 220000],
    ],
  );
  assert.equal(f.semanaMasAjustada?.numero, 4);
  assert.equal(f.primeraEnRojo, null);
  // La vencida sale hoy, y se dice desde cuándo se debe.
  assert.deepEqual(
    f.semanas[0].movimientos.map((m) => [m.dia, m.tipo, m.monto, m.vencidoDesde]),
    [["2026-09-23", "pago", 80000, "2026-09-20"]],
  );
  // Lo que no se proyecta, con su monto.
  assert.equal(f.fuera.fiadoVencido, 50000);
  assert.equal(f.fuera.fiadoSinFecha, 30000);
  assert.equal(f.fuera.deudasSinFecha, 40000, "el cheque rebotado no cubre nada: la deuda entera queda sin fecha");
  assert.equal(f.fuera.cobrosMasAdelante, 70000);
});

test("a 60 días entra lo que antes quedaba más adelante, y la semana en rojo se avisa", () => {
  const f = calcularFlujo(caso({ horizonte: 60, saldoLibro: 100000 }));
  assert.equal(f.hasta, "2026-11-21");
  assert.equal(f.semanas.length, 9);
  assert.equal(f.fuera.cobrosMasAdelante, 0, "el fiado del 15/11 ya entra a 60 días");
  assert.equal(f.totalEntra, 170000);
  assert.ok(f.primeraEnRojo, "100.000 − 80.000 + 100.000 − 200.000 = −80.000 en la semana 2");
  assert.equal(f.primeraEnRojo?.numero, 2);
  assert.equal(f.primeraEnRojo?.saldoAlCierre, -80000);
});

test("un cheque que cubre más de lo que se debe sale ENTERO: es lo que el banco debita", () => {
  // Deuda de $100.000, cheque de $100.000 entregado y después $40.000 pagados en efectivo: el
  // banco debita los $100.000 (el débito se registra aunque pague de más). Antes el flujo sacaba
  // $60.000 y quedaba optimista en $40.000, justo en la semana del cheque.
  const f = calcularFlujo(
    caso({
      aCobrar: [],
      aPagar: [
        {
          id: "a1",
          amount: 100000,
          issueDate: dia("2026-09-01"),
          dueDate: dia("2026-10-01"),
          saldo: 60000,
          quien: "X",
          cheques: [{ id: "c", amount: 100000, dueDate: dia("2026-09-28"), status: "DELIVERED" }],
        },
      ],
    }),
  );
  assert.equal(f.totalSale, 100000);
  assert.equal(f.saldoFinal, 400000, "500.000 − 100.000");
  // Y el de una deuda ya saldada también sale.
  const saldada = calcularFlujo(
    caso({
      aCobrar: [],
      aPagar: [
        {
          id: "a1",
          amount: 100000,
          issueDate: dia("2026-09-01"),
          dueDate: dia("2026-10-01"),
          saldo: 0,
          quien: "X",
          cheques: [{ id: "c", amount: 100000, dueDate: dia("2026-09-28"), status: "DELIVERED" }],
        },
      ],
    }),
  );
  assert.equal(saldada.totalSale, 100000);
});

test("el saldo del libro: entra VENTA e INGRESO, sale EGRESO y RETIRO; la apertura no mueve", () => {
  assert.equal(
    saldoDelLibro([
      { type: "VENTA", total: 1000 },
      { type: "INGRESO", total: 200 },
      { type: "EGRESO", total: 300 },
      { type: "RETIRO", total: 100 },
      { type: "APERTURA", total: 5000 },
    ]),
    800,
  );
});

test("el horizonte de la URL: 30, 60 o 90; cualquier otra cosa, 30", () => {
  assert.equal(leerHorizonte("60"), 60);
  assert.equal(leerHorizonte("90"), 90);
  assert.equal(leerHorizonte("45"), 30);
  assert.equal(leerHorizonte(undefined), 30);
  assert.equal(leerHorizonte("9999999"), 30);
});
