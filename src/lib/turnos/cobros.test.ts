// ============================================================================
// TEST-GATE — aritmética del cobro de turnos (src/lib/turnos/cobros.ts).
// ============================================================================
//
// Lo que el QA midió roto y acá queda blindado:
//  · La seña se cobra al reservar y el saldo se DERIVA (precio − Σ cobros), nunca se guarda.
//  · Completar exige que el turno haya ocurrido y cobra el resto (o lo deja a cobrar).
//  · La comisión se devenga sobre el servicio prestado, no sobre la seña.
//  · Los turnos cobrados por el camino viejo (`Payment` 1:1, sin `Collection`) no aparecen
//    como deuda ni se pueden volver a cobrar.
//
// Todo PURO, sin DB. Estilo node:test, como libro-caja.test.ts.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  montosCobrados,
  estadoCobroTurno,
  seniaDelServicio,
  cobroSugerido,
  validarCobroTurno,
  puedeCompletarse,
  planCompletar,
  baseComision,
  seniaRetenida,
  esCuentaACobrar,
  claveCobroTurno,
  esMetodoDePago,
  medioHabilitado,
  metodosDePago,
  tarjetaHabilitada,
  avisoDeTarjeta,
  METODOS_DE_PAGO,
  METODO_LABEL,
} from "./cobros";

// ── Saldo derivado ──────────────────────────────────────────────────────────

test("turno recién reservado sin cobros → nada cobrado, saldo = precio", () => {
  const e = estadoCobroTurno({ precio: 20000, cobros: [] });
  assert.deepEqual(e, { precio: 20000, cobrado: 0, saldo: 20000, estado: "UNPAID" });
});

test("seña cobrada al reservar → parcial, el saldo es lo que falta", () => {
  const e = estadoCobroTurno({ precio: 20000, cobros: [{ amount: 5000, method: "TRANSFERENCIA" }] });
  assert.deepEqual(e, { precio: 20000, cobrado: 5000, saldo: 15000, estado: "PARTIAL" });
});

test("seña + saldo al completar → saldado al peso", () => {
  const e = estadoCobroTurno({
    precio: 20000,
    cobros: [
      { amount: 5000, method: "TRANSFERENCIA" },
      { amount: 15000, method: "EFECTIVO" },
    ],
  });
  assert.deepEqual(e, { precio: 20000, cobrado: 20000, saldo: 0, estado: "PAID" });
});

test("los centavos no se arrastran: 3 cobros de 33.33 sobre 99.99 quedan saldados", () => {
  const e = estadoCobroTurno({
    precio: 99.99,
    cobros: [33.33, 33.33, 33.33].map((amount) => ({ amount, method: "EFECTIVO" })),
  });
  assert.equal(e.saldo, 0);
  assert.equal(e.estado, "PAID");
});

// ── Pago legado (confirmPayment / Mercado Pago, sin Collection) ─────────────

test("turno cobrado por el camino viejo (Payment APPROVED, sin cobros) cuenta como cobrado", () => {
  assert.deepEqual(montosCobrados([], { status: "APPROVED", amount: 15000 }), [15000]);
  const e = estadoCobroTurno({ precio: 15000, cobros: [], pagoLegado: { status: "APPROVED", amount: 15000 } });
  assert.equal(e.saldo, 0);
  assert.equal(e.estado, "PAID");
});

test("un Payment que no está APPROVED no es plata que entró", () => {
  for (const status of ["PENDING", "REJECTED", "REFUNDED"]) {
    assert.deepEqual(montosCobrados([], { status, amount: 15000 }), []);
  }
});

test("en cuanto hay cobros, el Payment es su agregado: NO se suma dos veces", () => {
  // Payment agregado = 5000 (lo escribió el repositorio) + un cobro de 5000 → cobrado 5000, no 10000.
  const e = estadoCobroTurno({
    precio: 20000,
    cobros: [{ amount: 5000, method: "EFECTIVO" }],
    pagoLegado: { status: "APPROVED", amount: 5000 },
  });
  assert.equal(e.cobrado, 5000);
  assert.equal(e.saldo, 15000);
});

// ── Seña del catálogo ───────────────────────────────────────────────────────

test("la seña es el depositAmount fijo del catálogo (provisional a confirmar)", () => {
  assert.equal(seniaDelServicio({ depositAmount: 5000, precio: 20000 }), 5000);
});

test("sin depositAmount (null/0/negativo/NaN) no hay seña", () => {
  for (const dep of [null, undefined, 0, -1, Number.NaN]) {
    assert.equal(seniaDelServicio({ depositAmount: dep, precio: 20000 }), 0);
  }
});

test("la seña nunca supera el precio del servicio", () => {
  assert.equal(seniaDelServicio({ depositAmount: 50000, precio: 20000 }), 20000);
});

// ── Qué cobrar ahora ────────────────────────────────────────────────────────

test("turno reservado, con seña definida y nada cobrado → se sugiere la seña", () => {
  assert.deepEqual(cobroSugerido({ status: "PENDING", precio: 20000, depositAmount: 5000, cobros: [] }), {
    tipo: "senia",
    monto: 5000,
  });
});

test("turno confirmado con la seña ya cobrada → se sugiere el saldo", () => {
  assert.deepEqual(
    cobroSugerido({ status: "CONFIRMED", precio: 20000, depositAmount: 5000, cobros: [{ amount: 5000, method: "EFECTIVO" }] }),
    { tipo: "saldo", monto: 15000 },
  );
});

test("servicio sin seña → se sugiere el precio completo como saldo", () => {
  assert.deepEqual(cobroSugerido({ status: "PENDING", precio: 20000, depositAmount: null, cobros: [] }), {
    tipo: "saldo",
    monto: 20000,
  });
});

test("turno completado con saldo (cuenta a cobrar) → se sugiere lo que falta, no la seña", () => {
  assert.deepEqual(
    cobroSugerido({ status: "COMPLETED", precio: 20000, depositAmount: 5000, cobros: [{ amount: 5000, method: "EFECTIVO" }] }),
    { tipo: "saldo", monto: 15000 },
  );
});

// ── Validación del cobro ────────────────────────────────────────────────────

test("cobrar la seña de un turno reservado → ok, queda saldo", () => {
  const v = validarCobroTurno({ status: "PENDING", precio: 20000, cobros: [], monto: 5000 });
  assert.deepEqual(v, { ok: true, monto: 5000, saldoDespues: 15000, quedaSaldado: false });
});

test("cobrar el saldo exacto → ok y queda saldado", () => {
  const v = validarCobroTurno({ status: "CONFIRMED", precio: 20000, cobros: [{ amount: 5000, method: "EFECTIVO" }], monto: 15000 });
  assert.deepEqual(v, { ok: true, monto: 15000, saldoDespues: 0, quedaSaldado: true });
});

test("cobrar más de lo que falta → rechazado (excede-saldo): el doble clic no puede pasar por acá", () => {
  const v = validarCobroTurno({ status: "CONFIRMED", precio: 20000, cobros: [{ amount: 20000, method: "EFECTIVO" }], monto: 1 });
  assert.deepEqual(v, { ok: false, motivo: "excede-saldo", saldo: 0 });
});

test("un turno ya cobrado por el camino viejo no admite otro cobro", () => {
  const v = validarCobroTurno({
    status: "CONFIRMED",
    precio: 15000,
    cobros: [],
    pagoLegado: { status: "APPROVED", amount: 15000 },
    monto: 15000,
  });
  assert.equal(v.ok, false);
  assert.equal(!v.ok && v.motivo, "excede-saldo");
});

test("monto ≤ 0 o no finito → monto-invalido", () => {
  for (const monto of [0, -5, Number.NaN, Infinity]) {
    const v = validarCobroTurno({ status: "PENDING", precio: 20000, cobros: [], monto });
    assert.equal(v.ok, false);
    assert.equal(!v.ok && v.motivo, "monto-invalido");
  }
});

test("turno cancelado o con no-show no acepta cobros", () => {
  for (const status of ["CANCELLED", "NO_SHOW"]) {
    const v = validarCobroTurno({ status, precio: 20000, cobros: [], monto: 5000 });
    assert.deepEqual(v, { ok: false, motivo: "turno-cerrado", saldo: 20000 });
  }
});

test("nadie volvió a poner un Σ ciego a la nota sobre el Payment agregado", () => {
  // Acá se probaba `montoPaymentAgregado`, que sumaba `cobradoAntes + monto` sin mirar la
  // nota de la fila. Una `CONDONACION:` entraba al agregado y `Payment.amount` decía $20.000
  // donde habían entrado $5.000 — y esa columna es la base de la comisión. La función se
  // borró; lo que queda es el candado para que no vuelva.
  const fuente = readFileSync(new URL("./cobros.ts", import.meta.url), "utf8");
  assert.doesNotMatch(
    fuente,
    /export function montoPaymentAgregado/,
    "volvió `montoPaymentAgregado`. El agregado se deriva con `desglosarCobros` (anulacion.ts), " +
      "que es lo único que distingue plata cobrada de saldo condonado.",
  );
});

// ── Completar ───────────────────────────────────────────────────────────────

test("un turno confirmado que ya empezó se puede completar", () => {
  const r = puedeCompletarse({
    status: "CONFIRMED",
    startsAt: new Date("2026-09-08T14:00:00Z"),
    ahora: new Date("2026-09-08T14:00:00Z"),
  });
  assert.deepEqual(r, { ok: true });
});

test("el turno del martes NO se puede completar el domingo (lo que el QA pudo hacer)", () => {
  const r = puedeCompletarse({
    status: "CONFIRMED",
    startsAt: new Date("2026-09-08T14:00:00Z"), // martes
    ahora: new Date("2026-09-06T10:00:00Z"), // domingo
  });
  assert.deepEqual(r, { ok: false, motivo: "no-ocurrio" });
});

test("sólo un turno CONFIRMED se completa (reservado, cancelado, no-show: no confirmado)", () => {
  for (const status of ["PENDING", "CANCELLED", "NO_SHOW"]) {
    const r = puedeCompletarse({ status, startsAt: new Date(0), ahora: new Date() });
    assert.deepEqual(r, { ok: false, motivo: "no-confirmado" }, status);
  }
});

test("un turno ya COMPLETED dice «ya-cerrado», no «no-confirmado» (cert O-3, doble envío)", () => {
  for (const vino of [undefined, false, true]) {
    const r = puedeCompletarse({ status: "COMPLETED", startsAt: new Date(0), ahora: new Date(), vino });
    assert.deepEqual(r, { ok: false, motivo: "ya-cerrado" }, `vino=${vino}`);
  }
  // Cerrado es cerrado aunque la hora todavía no haya llegado (no se lo manda a «no ocurrió»).
  const futuro = puedeCompletarse({ status: "COMPLETED", startsAt: new Date("2026-10-23T13:00:00Z"), ahora: new Date("2026-10-22T10:00:00Z") });
  assert.deepEqual(futuro, { ok: false, motivo: "ya-cerrado" });
});

// ── «Vino» desde un Reservado (reingeniería CH, Tanda 1 · CH-002, CH-046) ────

test("con «vino», un Reservado cuya hora ya pasó se completa sin pasar por Confirmar (CH-002)", () => {
  const r = puedeCompletarse({
    status: "PENDING",
    startsAt: new Date("2026-10-21T13:00:00Z"), // ayer
    ahora: new Date("2026-10-22T10:00:00Z"),
    vino: true,
  });
  assert.deepEqual(r, { ok: true });
});

test("con «vino», un Reservado de mañana sigue rechazado: no ocurrió (CH-046)", () => {
  const r = puedeCompletarse({
    status: "PENDING",
    startsAt: new Date("2026-10-23T13:00:00Z"),
    ahora: new Date("2026-10-22T10:00:00Z"),
    vino: true,
  });
  assert.deepEqual(r, { ok: false, motivo: "no-ocurrio" });
});

test("sin «vino» (o con vino=false), un Reservado pasado sigue rechazado: la regla de siempre", () => {
  for (const vino of [undefined, false]) {
    const r = puedeCompletarse({ status: "PENDING", startsAt: new Date(0), ahora: new Date(), vino });
    assert.deepEqual(r, { ok: false, motivo: "no-confirmado" }, `vino=${vino}`);
  }
});

test("«vino» no resucita lo cerrado: cancelado, completado o no-show siguen rechazados", () => {
  for (const status of ["CANCELLED", "NO_SHOW"]) {
    const r = puedeCompletarse({ status, startsAt: new Date(0), ahora: new Date(), vino: true });
    assert.deepEqual(r, { ok: false, motivo: "no-confirmado" }, status);
  }
  const completado = puedeCompletarse({ status: "COMPLETED", startsAt: new Date(0), ahora: new Date(), vino: true });
  assert.deepEqual(completado, { ok: false, motivo: "ya-cerrado" });
});

test("«vino» sobre un Confirmado pasado no cambia nada: se completa igual", () => {
  const r = puedeCompletarse({ status: "CONFIRMED", startsAt: new Date(0), ahora: new Date(), vino: true });
  assert.deepEqual(r, { ok: true });
});

test("completar con seña cobrada y medio elegido → UN cobro por el saldo", () => {
  const p = planCompletar({
    precio: 20000,
    cobros: [{ amount: 5000, method: "TRANSFERENCIA" }],
    dejarSaldoACobrar: false,
    method: "EFECTIVO",
  });
  assert.deepEqual(p, { ok: true, cobro: { monto: 15000, method: "EFECTIVO" }, saldoACobrar: 0 });
});

test("completar un turno ya saldado no cobra nada (ni pide medio)", () => {
  const p = planCompletar({ precio: 20000, cobros: [{ amount: 20000, method: "EFECTIVO" }], dejarSaldoACobrar: false, method: null });
  assert.deepEqual(p, { ok: true, cobro: null, saldoACobrar: 0 });
});

test("completar con saldo y sin medio → falta-medio (no se completa a $0 en silencio)", () => {
  const p = planCompletar({ precio: 20000, cobros: [], dejarSaldoACobrar: false, method: null });
  assert.deepEqual(p, { ok: false, motivo: "falta-medio" });
});

test("completar dejando el saldo a cobrar → sin cobro, queda como cuenta a cobrar", () => {
  const p = planCompletar({ precio: 20000, cobros: [{ amount: 5000, method: "EFECTIVO" }], dejarSaldoACobrar: true, method: null });
  assert.deepEqual(p, { ok: true, cobro: null, saldoACobrar: 15000 });
  assert.equal(esCuentaACobrar({ status: "COMPLETED", saldo: 15000 }), true);
  assert.equal(esCuentaACobrar({ status: "CONFIRMED", saldo: 15000 }), false);
  assert.equal(esCuentaACobrar({ status: "COMPLETED", saldo: 0 }), false);
});

// ── Comisión y seña retenida ────────────────────────────────────────────────

test("la comisión se devenga sobre el servicio prestado (precio), no sobre la seña", () => {
  assert.equal(baseComision({ status: "COMPLETED", precio: 20000 }), 20000);
});

test("reservar y cobrar la seña no devenga comisión: sólo COMPLETED", () => {
  for (const status of ["PENDING", "CONFIRMED", "CANCELLED", "NO_SHOW"]) {
    assert.equal(baseComision({ status, precio: 20000 }), 0);
  }
});

test("con no-show el negocio se queda con la seña (provisional: pasadas 24 h)", () => {
  assert.equal(seniaRetenida({ status: "NO_SHOW", cobrado: 5000 }), 5000);
  assert.equal(seniaRetenida({ status: "COMPLETED", cobrado: 5000 }), 0);
});

// ── Claves y medios ─────────────────────────────────────────────────────────

test("la seña al reservar y el saldo al completar tienen clave natural por turno", () => {
  assert.equal(claveCobroTurno("senia", "appt_1"), "senia:appt_1");
  assert.equal(claveCobroTurno("saldo", "appt_1"), "saldo:appt_1");
  assert.notEqual(claveCobroTurno("senia", "appt_1"), claveCobroTurno("saldo", "appt_1"));
});

test("sólo los tres medios del negocio son válidos", () => {
  assert.equal(esMetodoDePago("EFECTIVO"), true);
  assert.equal(esMetodoDePago("MERCADOPAGO"), true);
  assert.equal(esMetodoDePago("TRANSFERENCIA"), true);
  assert.equal(esMetodoDePago("TARJETA"), false);
  assert.equal(esMetodoDePago(null), false);
  // Sin la lista de la base, Débito y Crédito siguen rechazados (comportamiento de siempre).
  assert.equal(esMetodoDePago("DEBITO"), false);
  assert.equal(esMetodoDePago("CREDITO"), false);
});

// ── Débito y Crédito (reingeniería CH, Tanda 3 · CH-031/CH-032) ─────────────

const BASE_SIN_M1 = ["MERCADOPAGO", "EFECTIVO", "TRANSFERENCIA"] as const; // orden de pg_enum hoy
const BASE_CON_M1 = [...BASE_SIN_M1, "DEBITO", "CREDITO"] as const;

test("CH-032 · sin la migración M1, no se ofrecen Débito ni Crédito y la caja lo aclara", () => {
  assert.deepEqual(metodosDePago(BASE_SIN_M1), ["EFECTIVO", "MERCADOPAGO", "TRANSFERENCIA"]);
  assert.equal(medioHabilitado("DEBITO", BASE_SIN_M1), false);
  assert.equal(medioHabilitado("CREDITO", BASE_SIN_M1), false);
  assert.equal(medioHabilitado("EFECTIVO", BASE_SIN_M1), true);
  assert.equal(tarjetaHabilitada(BASE_SIN_M1), false);
  assert.equal(avisoDeTarjeta(BASE_SIN_M1), "Hoy la tarjeta se registra como Mercado Pago.");
  // La lista por defecto (lo que usan todas las pantallas que no preguntan) es la de siempre.
  assert.deepEqual(metodosDePago(), [...METODOS_DE_PAGO]);
  assert.deepEqual([...METODOS_DE_PAGO], ["EFECTIVO", "MERCADOPAGO", "TRANSFERENCIA"]);
});

test("CH-031 · con la migración M1, Débito y Crédito se ofrecen al final y se validan", () => {
  assert.deepEqual(metodosDePago(BASE_CON_M1), ["EFECTIVO", "MERCADOPAGO", "TRANSFERENCIA", "DEBITO", "CREDITO"]);
  assert.equal(medioHabilitado("DEBITO", BASE_CON_M1), true);
  assert.equal(esMetodoDePago("CREDITO", BASE_CON_M1), true);
  assert.equal(tarjetaHabilitada(BASE_CON_M1), true);
  assert.equal(avisoDeTarjeta(BASE_CON_M1), null);
  assert.equal(METODO_LABEL.DEBITO, "Débito");
  assert.equal(METODO_LABEL.CREDITO, "Crédito");
});

test("medioHabilitado: un valor que el código no conoce no se habilita aunque la base lo tenga", () => {
  assert.equal(medioHabilitado("TARJETA", [...BASE_CON_M1, "TARJETA"]), false);
  assert.equal(medioHabilitado("", BASE_CON_M1), false);
  assert.equal(medioHabilitado(undefined, BASE_CON_M1), false);
  assert.equal(medioHabilitado("debito", BASE_CON_M1), false); // sin adivinar mayúsculas
  // Sólo uno de los dos en la base (migración a medias, a mano): se ofrece ése solo, y la
  // tarjeta no cuenta como habilitada (el aviso sigue).
  assert.deepEqual(metodosDePago([...BASE_SIN_M1, "DEBITO"]), ["EFECTIVO", "MERCADOPAGO", "TRANSFERENCIA", "DEBITO"]);
  assert.equal(tarjetaHabilitada([...BASE_SIN_M1, "DEBITO"]), false);
});

// «No se presentó» (UAT de CH, 18/10): reservado o confirmado, y sólo cuando ya llegó la hora.
test("no vino: un Reservado o Confirmado cuya hora ya pasó se puede marcar", async () => {
  const { puedeMarcarseNoVino } = await import("./cobros");
  const ahora = new Date("2026-10-18T15:00:00Z");
  const antes = new Date("2026-10-18T13:00:00Z");
  assert.deepEqual(puedeMarcarseNoVino({ status: "CONFIRMED", startsAt: antes, ahora }), { ok: true });
  assert.deepEqual(puedeMarcarseNoVino({ status: "PENDING", startsAt: antes, ahora }), { ok: true });
});

test("no vino: un turno de más tarde no se marca como faltazo, y uno cerrado tampoco", async () => {
  const { puedeMarcarseNoVino, mensajeNoVino } = await import("./cobros");
  const ahora = new Date("2026-10-18T15:00:00Z");
  const despues = new Date("2026-10-18T17:00:00Z");
  const antes = new Date("2026-10-18T13:00:00Z");
  assert.deepEqual(puedeMarcarseNoVino({ status: "CONFIRMED", startsAt: despues, ahora }), { ok: false, motivo: "no-ocurrio" });
  for (const status of ["CANCELLED", "COMPLETED", "NO_SHOW"]) {
    assert.deepEqual(puedeMarcarseNoVino({ status, startsAt: antes, ahora }), { ok: false, motivo: "no-vigente" });
  }
  assert.match(mensajeNoVino("no-ocurrio"), /a partir de su horario/);
});
