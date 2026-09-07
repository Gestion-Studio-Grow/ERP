// ============================================================================
// TEST-GATE — puente TURNOS → LIBRO DE CAJA (src/lib/caja/cobro-turno.ts).
// ============================================================================
//
// Invariantes:
//  · El cobro de un turno entra al libro UNA sola vez, con el medio con que se cobró.
//  · Confirmar dos veces (secuencial o en carrera) no produce dos asientos: pre-check por
//    `paymentId` + @@unique(tenantId, paymentId, type) como árbitro.
//  · Si la columna `paymentId` todavía no está migrada (schema-ahead), el cobro se concreta
//    igual SIN asiento — el comportamiento previo al puente — en vez de romper el cobro.
//
// Sin DB (ADR-026): el cuerpo real corre contra un doble de tx; la orquestación se prueba
// con las operaciones inyectadas. Estilo node:test, como libro-caja.test.ts.

import { test } from "node:test";
import assert from "node:assert/strict";
import { Prisma } from "@/generated/prisma/client";
import {
  cobroTurnoEligibility,
  cobroTurnoDetail,
  recordCobroTurnoInTx,
  settleAppointmentPaymentGuarded,
  type CobroTurnoTx,
  type CobroTurnoInput,
} from "./cobro-turno";
import { expectedCash } from "./cash-register";

// ── Decisión pura ───────────────────────────────────────────────────────────

test("pago APPROVED en efectivo → elegible, columna EFECTIVO, monto tal cual", () => {
  assert.deepEqual(cobroTurnoEligibility({ status: "APPROVED", paymentMethod: "EFECTIVO", amount: 15000 }), {
    eligible: true,
    amount: 15000,
    method: "EFECTIVO",
  });
});

test("Mercado Pago y transferencia caen juntas en la columna MP, como lo lleva el negocio", () => {
  assert.deepEqual(cobroTurnoEligibility({ status: "APPROVED", paymentMethod: "MERCADOPAGO", amount: 20000 }), {
    eligible: true,
    amount: 20000,
    method: "MP",
  });
  assert.deepEqual(cobroTurnoEligibility({ status: "APPROVED", paymentMethod: "TRANSFERENCIA", amount: 20000 }), {
    eligible: true,
    amount: 20000,
    method: "MP",
  });
});

test("un pago que no está APPROVED no es plata que entró: no se asienta", () => {
  for (const status of ["PENDING", "REJECTED", "REFUNDED"]) {
    assert.deepEqual(cobroTurnoEligibility({ status, paymentMethod: "EFECTIVO", amount: 15000 }), {
      eligible: false,
      reason: "not-approved",
    });
  }
});

test("medio desconocido o vacío → no se adivina la columna", () => {
  assert.deepEqual(cobroTurnoEligibility({ status: "APPROVED", paymentMethod: null, amount: 15000 }), {
    eligible: false,
    reason: "unsupported-method",
  });
  assert.deepEqual(cobroTurnoEligibility({ status: "APPROVED", paymentMethod: "TARJETA", amount: 15000 }), {
    eligible: false,
    reason: "unsupported-method",
  });
});

test("monto no positivo o no finito → nada que asentar", () => {
  for (const amount of [0, -1, Number.NaN, Infinity]) {
    assert.deepEqual(cobroTurnoEligibility({ status: "APPROVED", paymentMethod: "EFECTIVO", amount }), {
      eligible: false,
      reason: "invalid-amount",
    });
  }
});

test("el detalle se reconoce a simple vista entre las filas tipeadas a mano", () => {
  assert.equal(
    cobroTurnoDetail({ serviceName: "Limpieza facial profunda", clientName: "Sofía Pérez" }),
    "Turno · Limpieza facial profunda — Sofía Pérez",
  );
  assert.equal(cobroTurnoDetail({ serviceName: "  Masaje ", clientName: "" }), "Turno · Masaje");
  assert.equal(cobroTurnoDetail({ serviceName: "", clientName: "Ana" }), "Turno · servicio — Ana");
});

// ── Cuerpo tx-scoped contra un doble de tx ──────────────────────────────────

type MovRow = {
  id: string;
  paymentId: string | null;
  type: string;
  amount: number;
  method: string;
  sessionId: string | null;
  reason: string;
};

function p2002Payment(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "7.8.0",
    meta: { target: "CashMovement_tenantId_paymentId_type_key" },
  });
}

function p2022PaymentId(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError("The column `paymentId` does not exist", {
    code: "P2022",
    clientVersion: "7.8.0",
    meta: { column: "CashMovement.paymentId" },
  });
}

// `snapshotExisting`: qué ve el pre-check (para modelar la carrera: dos tx ven "no existe"
// antes de que cualquiera cree). `enforceUnique`: la DB ya tiene el @@unique migrado.
function makeTx(opts: {
  openSession: boolean;
  store?: MovRow[];
  snapshotExisting?: boolean;
  enforceUnique?: boolean;
  columnMissing?: boolean;
}) {
  const store = opts.store ?? [];
  let seq = 0;
  const tx = {
    cashSession: { findFirst: async () => (opts.openSession ? { id: "sess_1" } : null) },
    cashMovement: {
      findFirst: async (args: { where: { paymentId: string; type: string } }) => {
        if (opts.columnMissing) throw p2022PaymentId();
        if (opts.snapshotExisting !== undefined) return opts.snapshotExisting ? { id: "mov_pre" } : null;
        const m = store.find((x) => x.paymentId === args.where.paymentId && x.type === args.where.type);
        return m ? { id: m.id } : null;
      },
      create: async (args: { data: Omit<MovRow, "id"> }) => {
        if (opts.enforceUnique && store.some((x) => x.paymentId === args.data.paymentId && x.type === args.data.type)) {
          throw p2002Payment();
        }
        const m: MovRow = { id: `mov_${++seq}`, ...args.data };
        store.push(m);
        return { id: m.id };
      },
    },
  };
  return { tx: tx as unknown as CobroTurnoTx, store };
}

const input = (over: Partial<CobroTurnoInput> = {}): CobroTurnoInput => ({
  paymentId: "pay_1",
  status: "APPROVED",
  paymentMethod: "EFECTIVO",
  amount: 15000,
  detail: "Turno · Masaje — Sofía",
  actor: "user:u1",
  ...over,
});

test("cobro en efectivo con turno de caja abierto → VENTA EFECTIVO enganchada al turno", async () => {
  const { tx, store } = makeTx({ openSession: true });
  const r = await recordCobroTurnoInTx(tx, "t1", input());
  assert.equal(r.recorded, true);
  assert.equal(store.length, 1);
  assert.equal(store[0].type, "VENTA");
  assert.equal(store[0].method, "EFECTIVO");
  assert.equal(store[0].amount, 15000);
  assert.equal(store[0].paymentId, "pay_1");
  assert.equal(store[0].sessionId, "sess_1");
  assert.equal(store[0].reason, "Turno · Masaje — Sofía");
});

test("sin turno de caja abierto (CH no usa turnos) → asienta igual, suelto: el libro lo ve", async () => {
  const { tx, store } = makeTx({ openSession: false });
  const r = await recordCobroTurnoInTx(tx, "t1", input({ paymentMethod: "MERCADOPAGO" }));
  assert.equal(r.recorded, true);
  assert.equal(r.recorded && r.sessionId, null);
  assert.equal(r.recorded && r.method, "MP");
  assert.equal(store[0].sessionId, null);
  assert.equal(store[0].method, "MP");
});

test("idempotencia secuencial: confirmar dos veces deja UN asiento (already-recorded)", async () => {
  const { tx, store } = makeTx({ openSession: true });
  const r1 = await recordCobroTurnoInTx(tx, "t1", input());
  const r2 = await recordCobroTurnoInTx(tx, "t1", input());
  assert.equal(r1.recorded, true);
  assert.deepEqual(r2, { recorded: false, reason: "already-recorded" });
  assert.equal(store.length, 1);
});

test("idempotencia no mira el medio: re-confirmar por MP lo que ya entró en efectivo no duplica", async () => {
  const { tx, store } = makeTx({ openSession: true });
  await recordCobroTurnoInTx(tx, "t1", input({ paymentMethod: "EFECTIVO" }));
  const r = await recordCobroTurnoInTx(tx, "t1", input({ paymentMethod: "MERCADOPAGO" }));
  assert.deepEqual(r, { recorded: false, reason: "already-recorded" });
  assert.equal(store.length, 1);
  assert.equal(store[0].method, "EFECTIVO", "queda el asiento del primer cobro");
});

test("carrera: el pre-check pasa pero el @@unique dispara → InTx propaga P2002 (lo clasifica el llamador)", async () => {
  const store: MovRow[] = [
    { id: "mov_1", paymentId: "pay_1", type: "VENTA", amount: 15000, method: "EFECTIVO", sessionId: null, reason: "x" },
  ];
  const { tx } = makeTx({ openSession: false, store, snapshotExisting: false, enforceUnique: true });
  await assert.rejects(recordCobroTurnoInTx(tx, "t1", input()), (e: unknown) =>
    e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002",
  );
  assert.equal(store.length, 1, "el segundo asiento NO se materializa");
});

test("no elegible (pago PENDING) → no toca la DB y no lanza", async () => {
  const { tx, store } = makeTx({ openSession: true });
  const r = await recordCobroTurnoInTx(tx, "t1", input({ status: "PENDING" }));
  assert.deepEqual(r, { recorded: false, reason: "not-approved" });
  assert.equal(store.length, 0);
});

test("una VENTA de turno por MP no mueve el efectivo esperado del arqueo del cajón", () => {
  const movs = [
    { type: "VENTA" as const, amount: 15000, method: "EFECTIVO" as const },
    { type: "VENTA" as const, amount: 20000, method: "MP" as const },
  ];
  assert.equal(expectedCash(10000, movs), 25000, "sólo el efectivo suma al cajón");
});

// ── Orquestación: schema-ahead y carrera ────────────────────────────────────

test("columna migrada: cobro + asiento en una sola pasada (outcome ok)", async () => {
  let conPuente = 0;
  let sinPuente = 0;
  const r = await settleAppointmentPaymentGuarded({
    runWithBridge: async () => {
      conPuente++;
      return "cobrado+asentado";
    },
    runWithoutBridge: async () => {
      sinPuente++;
      return "cobrado";
    },
  });
  assert.deepEqual(r, { outcome: "ok", value: "cobrado+asentado" });
  assert.equal(conPuente, 1);
  assert.equal(sinPuente, 0);
});

test("schema-ahead (P2022 en paymentId): la tx con puente aborta y se reintenta SIN puente → el turno se cobra igual", async () => {
  const { tx } = makeTx({ openSession: true, columnMissing: true });
  const pasos: string[] = [];
  const r = await settleAppointmentPaymentGuarded({
    runWithBridge: async () => {
      pasos.push("con-puente");
      // La tx real: Payment + turno + recordCobroTurnoInTx → el pre-check choca P2022 y
      // TODA la tx se revierte (nada quedó a medias).
      await recordCobroTurnoInTx(tx, "t1", input());
      return "no-llega";
    },
    runWithoutBridge: async () => {
      pasos.push("sin-puente");
      return "cobrado-sin-asiento";
    },
  });
  assert.deepEqual(r, { outcome: "degraded", value: "cobrado-sin-asiento" });
  assert.deepEqual(pasos, ["con-puente", "sin-puente"]);
});

test("un P2022 de OTRA columna no se disfraza de schema-ahead: se propaga", async () => {
  const otra = new Prisma.PrismaClientKnownRequestError("col", {
    code: "P2022",
    clientVersion: "7.8.0",
    meta: { column: "Order.idempotencyKey" },
  });
  await assert.rejects(
    settleAppointmentPaymentGuarded({
      runWithBridge: async () => {
        throw otra;
      },
      runWithoutBridge: async () => "no-debe-correr",
    }),
    (e: unknown) => e === otra,
  );
});

test("carrera del doble submit (P2002 en paymentId): outcome race, sin reintento ni error", async () => {
  let sinPuente = 0;
  const r = await settleAppointmentPaymentGuarded({
    runWithBridge: async () => {
      throw p2002Payment();
    },
    runWithoutBridge: async () => {
      sinPuente++;
      return "x";
    },
  });
  assert.deepEqual(r, { outcome: "race" });
  assert.equal(sinPuente, 0, "no se reintenta: el otro submit ya dejó cobro y asiento");
});

test("un P2002 de OTRO índice (orderId) no es la carrera del turno: se propaga", async () => {
  const otro = new Prisma.PrismaClientKnownRequestError("uq", {
    code: "P2002",
    clientVersion: "7.8.0",
    meta: { target: "CashMovement_tenantId_orderId_type_key" },
  });
  await assert.rejects(
    settleAppointmentPaymentGuarded({
      runWithBridge: async () => {
        throw otro;
      },
      runWithoutBridge: async () => "no",
    }),
    (e: unknown) => e === otro,
  );
});

test("cualquier otro error de DB se propaga: el cobro no queda a medias porque la tx entera se revirtió", async () => {
  const boom = new Error("connection reset");
  await assert.rejects(
    settleAppointmentPaymentGuarded({
      runWithBridge: async () => {
        throw boom;
      },
      runWithoutBridge: async () => "no",
    }),
    (e: unknown) => e === boom,
  );
});

// ── Frontera: BUG (sin puente) vs FIX ───────────────────────────────────────
//
// Modela el estado persistido tras confirmar el pago de un turno. `libroCompleto` = "todo
// Payment APPROVED tiene exactamente UNA fila de caja" — la condición que hace que Reportes
// (suma Payment) y el libro (suma CashMovement) no puedan dar distinto.

interface Store {
  payments: { id: string; amount: number }[];
  cash: { paymentId: string; amount: number }[];
}

function libroCompleto(s: Store): boolean {
  return s.payments.every((p) => s.cash.filter((c) => c.paymentId === p.id).length === 1);
}

test("BUG (antes): confirmar el pago dejaba Payment sin fila de caja → el libro no ve la plata", () => {
  const s: Store = { payments: [{ id: "pay_1", amount: 15000 }], cash: [] };
  assert.equal(libroCompleto(s), false, "el QA lo midió: 359 movimientos antes y después de cobrar $15.000");
});

test("FIX: cada Payment produce exactamente UNA fila de caja, aun confirmando dos veces", () => {
  const s: Store = { payments: [], cash: [] };
  const confirmar = () => {
    if (!s.payments.some((p) => p.id === "pay_1")) s.payments.push({ id: "pay_1", amount: 15000 });
    if (!s.cash.some((c) => c.paymentId === "pay_1")) s.cash.push({ paymentId: "pay_1", amount: 15000 });
  };
  confirmar();
  confirmar();
  assert.equal(s.payments.length, 1);
  assert.equal(s.cash.length, 1);
  assert.equal(libroCompleto(s), true);
  assert.equal(
    s.payments.reduce((a, p) => a + p.amount, 0),
    s.cash.reduce((a, c) => a + c.amount, 0),
    "Reportes (Payment) y libro (CashMovement) suman lo mismo",
  );
});
