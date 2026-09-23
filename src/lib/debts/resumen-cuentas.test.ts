// Los números de cuentas a cobrar y a pagar EJECUTADOS: saldo por cuenta, "te deben · más de
// 30 días", "vence en 7 días · cheques a debitar", las salidas de una deuda con cheque y el
// tope de un cheque nuevo. Son los mismos que usan la pantalla, el botón del Inicio y el flujo.

import { test } from "node:test";
import assert from "node:assert/strict";
import { businessWallTimeToUtc } from "@/lib/datetime";
import {
  conSaldo,
  diasEntre,
  imputadoPorCuenta,
  resumirAPagar,
  resumirFiado,
  salidasDeCuenta,
  sumarDias,
  validarChequeNuevo,
  validarPagoAMano,
  PagoRechazadoError,
  whereCuentasAbiertas,
  whereImputacionesDe,
} from "./resumen-cuentas";
import { ETIQUETA_CHEQUE, esEstadoDeCheque, pasosDelCheque } from "./cheque";
import { leerFecha, leerMonto, mensajeDeRechazo } from "./formularios";

const dia = (d: string) => businessWallTimeToUtc(d, "12:00");
const HOY = "2026-09-23";

test("el saldo de cada cuenta: total menos lo imputado; pagar $100.000 de $300.000 deja $200.000", () => {
  const cuentas = conSaldo(
    [
      { id: "a", amount: 300000, issueDate: dia("2026-09-01"), dueDate: null },
      { id: "b", amount: 50000, issueDate: dia("2026-09-01"), dueDate: null },
      { id: "c", amount: 10000, issueDate: dia("2026-09-01"), dueDate: null },
    ],
    imputadoPorCuenta([
      { originId: "a", _sum: { amount: { toNumber: () => 100000 } } },
      { originId: "b", _sum: { amount: 50000 } },
      { originId: "c", _sum: { amount: null } },
    ]),
  );
  assert.deepEqual(
    cuentas.map((c) => [c.id, c.saldado, c.saldo]),
    [
      ["a", 100000, 200000],
      ["b", 50000, 0],
      ["c", 0, 10000],
    ],
  );
  assert.deepEqual(whereCuentasAbiertas("t"), { tenantId: "t", status: "OPEN" });
  assert.deepEqual(whereImputacionesDe("t", "PAYABLE"), { tenantId: "t", originType: "PAYABLE" });
});

test("fiado: 'te deben $X · $Y con más de 30 días', por la fecha en que se fió", () => {
  const r = resumirFiado(
    [
      { id: "viejo", amount: 100, issueDate: dia("2026-08-01"), dueDate: null, saldado: 0, saldo: 100 },
      { id: "justo30", amount: 50, issueDate: dia("2026-08-24"), dueDate: null, saldado: 0, saldo: 50 },
      { id: "nuevo", amount: 70, issueDate: dia("2026-09-20"), dueDate: dia("2026-09-22"), saldado: 0, saldo: 70 },
      { id: "saldado", amount: 999, issueDate: dia("2026-01-01"), dueDate: null, saldado: 999, saldo: 0 },
    ],
    HOY,
  );
  assert.equal(diasEntre("2026-08-24", HOY), 30);
  assert.equal(r.total, 220);
  assert.equal(r.cuentas, 3, "la saldada no cuenta");
  assert.equal(r.masDe30, 100, "30 días justos todavía no es 'más de 30'");
  assert.equal(r.cuentasMasDe30, 1);
  assert.equal(r.vencido, 70);
});

test("cuentas a pagar: vence en 7 días (con lo vencido), sin contar lo que ya cubre un cheque", () => {
  const r = resumirAPagar(
    [
      // $300.000 con un cheque de $200.000 al 25/09: salen $200.000 por cheque y $100.000 al vencer (28/09).
      {
        id: "frigo",
        amount: 300000,
        issueDate: dia("2026-09-01"),
        dueDate: dia("2026-09-28"),
        saldo: 300000,
        cheques: [
          { id: "ch1", amount: 200000, dueDate: dia("2026-09-25"), status: "DELIVERED" },
          { id: "ch2", amount: 80000, dueDate: dia("2026-09-26"), status: "BOUNCED" },
        ],
      },
      // Vencida el 20/09.
      { id: "envases", amount: 40000, issueDate: dia("2026-08-01"), dueDate: dia("2026-09-20"), saldo: 40000, cheques: [] },
      // Vence en noviembre: no entra en los 7 días.
      { id: "lejos", amount: 10000, issueDate: dia("2026-09-01"), dueDate: dia("2026-11-01"), saldo: 10000, cheques: [] },
      // Saldada.
      { id: "saldada", amount: 5000, issueDate: dia("2026-09-01"), dueDate: dia("2026-09-24"), saldo: 0, cheques: [] },
      // Un cheque que sigue en la chequera, con fecha dentro de la semana: nadie lo va a cobrar
      // todavía, así que no es "a debitar"; sí es un cheque sin debitar (y sale en el flujo).
      {
        id: "chequera",
        amount: 30000,
        issueDate: dia("2026-09-01"),
        dueDate: dia("2026-10-20"),
        saldo: 30000,
        cheques: [{ id: "ch3", amount: 30000, dueDate: dia("2026-09-27"), status: "PENDING" }],
      },
    ],
    HOY,
  );
  assert.equal(r.total, 380000);
  assert.equal(r.cuentas, 4);
  assert.equal(r.venceEn7, 140000, "100.000 del frigorífico + 40.000 vencidos");
  assert.equal(r.vencido, 40000);
  assert.equal(r.cuentasVencidas, 1);
  assert.equal(r.chequesADebitar, 1, "ni el rebotado ni el que sigue en la chequera");
  assert.equal(r.montoChequesADebitar, 200000);
  assert.equal(r.chequesPendientes, 2, "sin debitar: el entregado y el de la chequera");
  assert.equal(r.montoChequesPendientes, 230000);
  assert.equal(sumarDias(HOY, 7), "2026-09-30");
});

test("las salidas de una deuda: cada cheque entero por su fecha, lo que no cubren al vencer", () => {
  const base = { id: "x", amount: 100, issueDate: dia("2026-09-01"), dueDate: dia("2026-10-10") };
  assert.deepEqual(
    salidasDeCuenta({
      ...base,
      saldo: 100,
      cheques: [
        { id: "b", amount: 30, dueDate: dia("2026-10-05"), status: "PENDING" },
        { id: "a", amount: 50, dueDate: dia("2026-10-01"), status: "DELIVERED" },
        { id: "z", amount: 99, dueDate: dia("2026-10-02"), status: "CLEARED" },
      ],
    }).map((s) => [s.tipo, s.dia, s.monto]),
    [
      ["cheque", "2026-10-01", 50],
      ["cheque", "2026-10-05", 30],
      ["vencimiento", "2026-10-10", 20],
    ],
  );
  // El saldo ya bajó por un pago: el banco debita el cheque ENTERO igual (el débito se registra
  // aunque pague de más), así que sale por 50 y no por los 40 que faltaban. Del lado prudente.
  assert.deepEqual(
    salidasDeCuenta({ ...base, saldo: 40, cheques: [{ id: "a", amount: 50, dueDate: dia("2026-10-01"), status: "DELIVERED" }] }).map((s) => [s.tipo, s.monto]),
    [["cheque", 50]],
  );
  // Deuda saldada con un cheque que todavía no se debitó: el cheque sale igual.
  assert.deepEqual(
    salidasDeCuenta({ ...base, saldo: 0, cheques: [{ id: "a", amount: 50, dueDate: dia("2026-10-01"), status: "DELIVERED" }] }).map((s) => s.monto),
    [50],
  );
  assert.deepEqual(salidasDeCuenta({ ...base, saldo: 0, cheques: [] }), []);
});

test("un pago a mano no puede pagar lo que ya cubre un cheque sin debitar", () => {
  // Deuda de $100.000 con un cheque de $100.000 entregado: el pago a mano la pagaría dos veces.
  const cubierta = validarPagoAMano({ monto: 100000, saldo: 100000, chequesSinDebitar: 100000 });
  assert.equal(cubierta.ok, false);
  assert.match(!cubierta.ok ? cubierta.error : "", /ya está cubierta por cheques/);
  // $300.000 con $200.000 en cheques: a mano, hasta $100.000.
  assert.deepEqual(validarPagoAMano({ monto: 100000, saldo: 300000, chequesSinDebitar: 200000 }), { ok: true });
  const deMas = validarPagoAMano({ monto: 100000.01, saldo: 300000, chequesSinDebitar: 200000 });
  assert.equal(deMas.ok, false);
  assert.match(!deMas.ok ? deMas.error : "", /hasta \$100\.000,00/);
  // Sin cheques decide la guarda de saldo de siempre, no ésta.
  assert.deepEqual(validarPagoAMano({ monto: 999999, saldo: 10, chequesSinDebitar: 0 }), { ok: true });
});

test("un cheque nuevo no puede cubrir más de lo que falta ni lo que ya cubre otro sin debitar", () => {
  assert.deepEqual(validarChequeNuevo({ monto: 100000, saldo: 300000, chequesSinDebitar: 150000 }), { ok: true, monto: 100000 });
  const deMas = validarChequeNuevo({ monto: 200000, saldo: 300000, chequesSinDebitar: 150000 });
  assert.equal(deMas.ok, false);
  assert.match(!deMas.ok ? deMas.error : "", /como máximo, \$150\.000,00/);
  const cubierta = validarChequeNuevo({ monto: 1, saldo: 300000, chequesSinDebitar: 300000 });
  assert.equal(cubierta.ok, false);
  assert.equal(validarChequeNuevo({ monto: 0, saldo: 10, chequesSinDebitar: 0 }).ok, false);
});

test("los pasos de un cheque salen de la misma tabla que valida el servidor; lo irreversible se confirma", () => {
  assert.deepEqual(pasosDelCheque("PENDING").map((p) => [p.a, Boolean(p.confirmar)]), [
    ["DELIVERED", false],
    ["CANCELED", true],
  ]);
  assert.deepEqual(pasosDelCheque("DELIVERED").map((p) => [p.a, Boolean(p.confirmar)]), [
    ["CLEARED", true],
    ["BOUNCED", true],
    ["CANCELED", true],
  ]);
  for (const terminal of ["CLEARED", "BOUNCED", "CANCELED"] as const) assert.deepEqual(pasosDelCheque(terminal), []);
  assert.equal(ETIQUETA_CHEQUE.CLEARED, "Debitado");
  assert.equal(esEstadoDeCheque("CLEARED"), true);
  assert.equal(esEstadoDeCheque("__proto__"), false);
  assert.equal(esEstadoDeCheque(null), false);
});

test("el monto del formulario se lee como plata: '100.000' son cien mil, no cien", () => {
  assert.equal(leerMonto("100.000"), 100000);
  assert.equal(leerMonto("100000"), 100000);
  assert.equal(leerMonto("1.500,50"), 1500.5);
  assert.equal(leerMonto("12500.75"), 12500.75, "lo que manda el campo oculto (String de un number)");
  assert.equal(leerMonto(""), null);
  assert.equal(leerMonto("0"), null);
  assert.equal(leerMonto("abc"), null);
  assert.equal(leerMonto(null), null);
});

test("la fecha del cheque se guarda al mediodía del día del negocio; una fecha imposible no pasa", () => {
  const f = leerFecha("2026-10-05");
  assert.ok(f);
  assert.equal(f.toISOString(), "2026-10-05T15:00:00.000Z");
  assert.equal(leerFecha("2026-02-30"), null);
  assert.equal(leerFecha("05/10/2026"), null);
  assert.equal(leerFecha(""), null);
});

test("el rechazo del servidor se dice para la persona, sin detalle crudo", () => {
  const asiento = Object.assign(new Error("La caja de hoy (23/09/2026) ya está cerrada: este pago caería en un día ya contado."), {
    name: "AsientoRechazadoError",
  });
  assert.match(mensajeDeRechazo(asiento, "pago"), /ya está cerrada/);
  assert.equal(
    mensajeDeRechazo(new Error("Movimiento rechazado (EXCEEDS_BALANCE); saldo pendiente 200000."), "pago"),
    "El monto supera lo que falta pagar: el saldo es $200.000,00. Corregí el monto.",
  );
  assert.match(mensajeDeRechazo(new Error("Transición de cheque inválida: CLEARED → BOUNCED."), "cheque"), /ya cambió de estado/);
  assert.match(mensajeDeRechazo(new Error("Cuenta a cobrar no encontrada para este negocio."), "cobro"), /No encontramos esa cuenta/);
  // Con centavos, el punto final de la oración no es parte del número (antes: "el saldo es —").
  for (const [crudo, dicho] of [
    ["1500.5", "$1.500,50"],
    ["1234.56", "$1.234,56"],
    ["0.5", "$0,50"],
  ] as const) {
    assert.equal(
      mensajeDeRechazo(new Error(`Movimiento rechazado (EXCEEDS_BALANCE); saldo pendiente ${crudo}.`), "cobro"),
      `El monto supera lo que falta cobrar: el saldo es ${dicho}. Corregí el monto.`,
    );
  }
  // Las reglas de la deuda con sus cheques ya vienen escritas para la persona.
  assert.equal(mensajeDeRechazo(new PagoRechazadoError("Esta deuda ya está cubierta por cheques."), "pago"), "Esta deuda ya está cubierta por cheques.");
  assert.equal(
    mensajeDeRechazo(new Error("ECONNRESET prisma:query"), "cobro"),
    "No se pudo registrar el cobro. Probá de nuevo en un momento; si sigue, avisanos.",
  );
});
