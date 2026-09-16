// ============================================================================
// TEST-GATE — anular un cobro y condonar un saldo (src/lib/turnos/anulacion.ts).
// ============================================================================
//
// Las invariantes que hacen que esto sea una CORRECCIÓN y no un agujero nuevo:
//  · Anular NO borra: deja la contrapartida, y Σ cobros baja sola (el saldo se re-abre).
//  · La reversa del libro es SIMÉTRICA del cobro: mismo monto, mismo medio, misma FECHA
//    CONTABLE y el mismo turno de caja, atada al cobro original por `collectionId`.
//  · Idempotente en las dos: anular/condonar dos veces no duplica nada.
//  · Un día ya cerrado no se toca: ahí la corrección va con fecha de hoy (regla del libro).
//  · Condonar NO escribe una sola fila en el libro ni infla el `Payment` — si lo hiciera,
//    el negocio estaría contando plata que nunca entró, que es exactamente lo que hoy
//    obliga a hacer a mano.
//  · La acción de anular exige la MISMA capacidad y el MISMO veredicto que cobrar
//    (se verifica leyendo `actions.ts`, al estilo de `audit-superficie.test.ts`).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Prisma } from "@/generated/prisma/client";
import {
  anularCobroTurnoInTx,
  condonarSaldoTurnoInTx,
  claseDeCobro,
  cobroAnuladoPor,
  cobrosAnulables,
  desglosarCobros,
  detalleReversa,
  notaDeAnulacion,
  planAnulacion,
  planCondonacion,
  validarMotivo,
  claveAnulacion,
  ANULACION_TURNO_ACTOR_PREFIX,
  AnulacionRechazada,
  CondonacionRechazada,
  type AnulacionTx,
} from "./anulacion";
import { estadoCobroTurno, validarCobroTurno } from "./cobros";

// ── Doble de transacción (ADR-026: sin DB) ──────────────────────────────────

type ColRow = {
  id: string;
  tenantId: string;
  originType: string;
  originId: string;
  appointmentId: string | null;
  amount: Prisma.Decimal;
  method: string;
  note: string | null;
  collectedBy: string;
  idempotencyKey?: string | null;
  createdAt: Date;
};
type MovRow = {
  id: string;
  tenantId: string;
  collectionId: string | null;
  sessionId: string | null;
  type: string;
  amount: number;
  method: string;
  reason: string | null;
  occurredAt: Date;
  createdBy: string;
};
type PayRow = { tenantId: string; appointmentId: string; amount: number; method: string; status: string };

const TENANT = "t1";
const TURNO = "appt-1";
const D = (s: string) => new Date(`${s}T15:00:00.000Z`);

type ColSeed = Omit<Partial<ColRow>, "amount"> & { amount?: number };

function makeTx(seed: { cobros?: ColSeed[]; movs?: Partial<MovRow>[]; payment?: Partial<PayRow> } = {}) {
  let seq = 0;
  const collections: ColRow[] = (seed.cobros ?? []).map((c, i) => ({
    id: c.id ?? `col-${i + 1}`,
    tenantId: TENANT,
    originType: "APPOINTMENT",
    originId: TURNO,
    appointmentId: TURNO,
    amount: new Prisma.Decimal(c.amount ?? 0),
    method: c.method ?? "EFECTIVO",
    note: c.note ?? null,
    collectedBy: "user:u1",
    idempotencyKey: c.idempotencyKey ?? null,
    createdAt: c.createdAt ?? D("2026-09-10"),
  }));
  const movements: MovRow[] = (seed.movs ?? []).map((m, i) => ({
    id: m.id ?? `mov-${i + 1}`,
    tenantId: TENANT,
    collectionId: m.collectionId ?? null,
    sessionId: m.sessionId ?? null,
    type: m.type ?? "VENTA",
    amount: m.amount ?? 0,
    method: m.method ?? "EFECTIVO",
    reason: m.reason ?? null,
    occurredAt: m.occurredAt ?? D("2026-09-10"),
    createdBy: m.createdBy ?? "user:u1",
  }));
  const payments: PayRow[] = seed.payment
    ? [{ tenantId: TENANT, appointmentId: TURNO, amount: 0, method: "EFECTIVO", status: "APPROVED", ...seed.payment }]
    : [];

  const tx = {
    collection: {
      findFirst: async (args: { where: { id?: string; originId?: string } }) =>
        collections.find((c) => (args.where.id ? c.id === args.where.id : c.originId === args.where.originId)) ?? null,
      findMany: async (args: { where: { originId: string } }) =>
        collections.filter((c) => c.originId === args.where.originId),
      create: async (args: { data: Record<string, unknown> }) => {
        const d = args.data as Partial<ColRow> & { amount: number };
        // El @@unique(tenantId, idempotencyKey) como árbitro de la carrera.
        if (d.idempotencyKey && collections.some((c) => c.idempotencyKey === d.idempotencyKey)) {
          throw new Error("unique violation idempotencyKey");
        }
        const row: ColRow = {
          id: `col-new-${++seq}`,
          tenantId: TENANT,
          originType: String(d.originType),
          originId: String(d.originId),
          appointmentId: d.appointmentId ?? null,
          amount: new Prisma.Decimal(d.amount),
          method: String(d.method),
          note: d.note ?? null,
          collectedBy: String(d.collectedBy),
          idempotencyKey: d.idempotencyKey ?? null,
          createdAt: new Date(),
        };
        collections.push(row);
        return { id: row.id };
      },
    },
    cashMovement: {
      findFirst: async (args: { where: { collectionId?: string; type?: string } }) =>
        movements.find((m) => m.collectionId === args.where.collectionId && m.type === args.where.type) ?? null,
      create: async (args: { data: Record<string, unknown> }) => {
        const d = args.data as Partial<MovRow>;
        if (movements.some((m) => m.collectionId === d.collectionId && m.type === d.type)) {
          throw new Error("unique violation (tenantId, collectionId, type)");
        }
        const row: MovRow = {
          id: `mov-new-${++seq}`,
          tenantId: TENANT,
          collectionId: d.collectionId ?? null,
          sessionId: d.sessionId ?? null,
          type: String(d.type),
          amount: Number(d.amount),
          method: String(d.method),
          reason: d.reason ?? null,
          occurredAt: d.occurredAt ?? new Date(),
          createdBy: String(d.createdBy),
        };
        movements.push(row);
        return { id: row.id };
      },
    },
    payment: {
      findUnique: async () => payments[0] ?? null,
      updateMany: async (args: { data: { amount: number; status: string } }) => {
        for (const p of payments) {
          p.amount = args.data.amount;
          p.status = args.data.status;
        }
        return { count: payments.length };
      },
    },
  };
  return { tx: tx as unknown as AnulacionTx, collections, movements, payments };
}

// Día contable inyectado: el test no depende de la zona horaria del que lo corre.
const diaDe = (d: Date) => d.toISOString().slice(0, 10);
const esDiaCerrado = (dia: string, hasta: string) => dia <= hasta;

function argsAnular(over: Partial<Parameters<typeof anularCobroTurnoInTx>[2]> = {}) {
  return {
    collectionId: "col-1",
    appointmentId: TURNO,
    precio: 18000,
    motivo: "cobré en efectivo y fue por transferencia",
    actor: "user:u1",
    diaCerradoHasta: null,
    esDiaCerrado,
    diaDe,
    withSchema: true,
    ...over,
  };
}

// ── 1. Núcleo puro ──────────────────────────────────────────────────────────

test("el motivo es obligatorio y no se acepta un garabato", () => {
  assert.equal(validarMotivo("").ok, false);
  assert.equal(validarMotivo("   ").ok, false);
  assert.equal(validarMotivo("ok").ok, false);
  const v = validarMotivo("  medio   equivocado  ");
  assert.deepEqual(v, { ok: true, motivo: "medio equivocado" });
  const largo = validarMotivo("x".repeat(500));
  assert.equal(largo.ok && largo.motivo.length, 200);
});

test("la nota ata la contrapartida al cobro original y se puede volver a leer", () => {
  const nota = notaDeAnulacion("col-1", "medio equivocado");
  assert.equal(claseDeCobro(nota), "anulacion");
  assert.equal(cobroAnuladoPor(nota), "col-1");
  assert.equal(cobroAnuladoPor("Seña al reservar"), null);
  assert.equal(claseDeCobro(null), "cobro");
});

test("cobrado y condonado NO se suman: son plata distinta", () => {
  const filas = [
    { amount: 17000, note: null },
    { amount: 3000, note: "CONDONACION: descuento de la dueña" },
  ];
  assert.deepEqual(desglosarCobros(filas), { cobrado: 17000, anulado: 0, condonado: 3000 });
  // …y el saldo derivado sí los suma: el turno queda saldado, que es el punto de condonar.
  assert.equal(estadoCobroTurno({ precio: 20000, cobros: filas.map((f) => ({ amount: f.amount, method: "EFECTIVO" })) }).saldo, 0);
});

test("un cobro ya anulado no vuelve a ofrecerse para anular", () => {
  const filas = [
    { id: "col-1", amount: 18000, note: null },
    { id: "col-2", amount: -18000, note: notaDeAnulacion("col-1", "medio equivocado") },
    { id: "col-3", amount: 5000, note: null },
  ];
  assert.deepEqual(cobrosAnulables(filas).map((c) => c.id), ["col-3"]);
});

test("planAnulacion: sólo cobros vivos, y el día cerrado se responde después de la idempotencia", () => {
  assert.deepEqual(planAnulacion({ note: null, amount: 18000, yaAnulado: false, diaCerrado: false }), { ok: true, monto: 18000 });
  assert.deepEqual(planAnulacion({ note: notaDeAnulacion("x", "m"), amount: -1, yaAnulado: false, diaCerrado: false }), {
    ok: false,
    motivo: "no-es-cobro",
  });
  assert.deepEqual(planAnulacion({ note: null, amount: 0, yaAnulado: false, diaCerrado: false }), { ok: false, motivo: "monto-invalido" });
  // Ya anulado + día cerrado → "ya-anulado": un doble clic no tiene que asustar a nadie.
  assert.deepEqual(planAnulacion({ note: null, amount: 100, yaAnulado: true, diaCerrado: true }), { ok: false, motivo: "ya-anulado" });
  assert.deepEqual(planAnulacion({ note: null, amount: 100, yaAnulado: false, diaCerrado: true }), { ok: false, motivo: "dia-cerrado" });
});

test("planCondonacion: sólo un turno prestado y con saldo", () => {
  const cobros = [{ amount: 17000, method: "EFECTIVO" }];
  assert.deepEqual(planCondonacion({ status: "COMPLETED", precio: 20000, cobros }), { ok: true, monto: 3000 });
  assert.deepEqual(planCondonacion({ status: "CONFIRMED", precio: 20000, cobros }), { ok: false, motivo: "no-prestado" });
  assert.deepEqual(planCondonacion({ status: "COMPLETED", precio: 17000, cobros }), { ok: false, motivo: "sin-saldo" });
});

test("el detalle de la reversa nombra al asiento original", () => {
  assert.equal(
    detalleReversa("Turno · Lifting de pestañas — Ana", "medio equivocado"),
    "Anulación de cobro · Turno · Lifting de pestañas — Ana — medio equivocado",
  );
});

// ── 2. Anulación: persistencia ──────────────────────────────────────────────

test("anular deja la contrapartida, baja el Payment y revierte el asiento con el MISMO medio, monto y fecha contable", async () => {
  const { tx, collections, movements, payments } = makeTx({
    cobros: [{ id: "col-1", amount: 18000, method: "EFECTIVO" }],
    movs: [{ id: "mov-1", collectionId: "col-1", type: "VENTA", amount: 18000, method: "EFECTIVO", reason: "Turno · Lifting — Ana", occurredAt: D("2026-09-10"), sessionId: "sess-1" }],
    payment: { amount: 18000, status: "APPROVED" },
  });

  const r = await anularCobroTurnoInTx(tx, TENANT, argsAnular());
  assert.equal(r.applied, true);
  if (!r.applied) return;

  // La original sigue entera: esto es contabilidad, no edición.
  const original = collections.find((c) => c.id === "col-1")!;
  assert.equal(original.amount.toNumber(), 18000);
  assert.equal(original.note, null);

  // La contrapartida: negativa, mismo medio, atada al cobro por la nota y por la clave.
  const reversa = collections.find((c) => c.id === r.reversaId)!;
  assert.equal(reversa.amount.toNumber(), -18000);
  assert.equal(reversa.method, "EFECTIVO");
  assert.equal(cobroAnuladoPor(reversa.note), "col-1");
  assert.equal(reversa.idempotencyKey, claveAnulacion("col-1"));

  // Σ cobros vuelve a cero → el saldo se re-abre solo, sin filtrar nada en las pantallas.
  assert.equal(estadoCobroTurno({ precio: 18000, cobros: collections.map((c) => ({ amount: c.amount.toNumber(), method: c.method })) }).saldo, 18000);
  assert.equal(r.saldoDespues, 18000);
  assert.equal(r.cobradoDespues, 0);

  // El Payment agregado deja de decir que entró plata (si no, la comisión lo liquidaría).
  assert.equal(payments[0].amount, 0);
  assert.equal(payments[0].status, "PENDING");

  // El libro: EGRESO simétrico, misma fecha CONTABLE y mismo turno de caja que la VENTA.
  const egreso = movements.find((m) => m.type === "EGRESO")!;
  assert.equal(egreso.amount, 18000);
  assert.equal(egreso.method, "EFECTIVO");
  assert.equal(egreso.collectionId, "col-1"); // atado al original, no a la contrapartida
  assert.equal(egreso.occurredAt.toISOString(), D("2026-09-10").toISOString());
  assert.equal(egreso.sessionId, "sess-1");
  assert.ok(egreso.reason?.includes("Turno · Lifting — Ana"));
  assert.ok(egreso.createdBy.startsWith(ANULACION_TURNO_ACTOR_PREFIX));
  assert.equal(r.libro.asentada, true);
});

test("anular dos veces NO duplica la reversa ni el egreso", async () => {
  const { tx, collections, movements } = makeTx({
    cobros: [{ id: "col-1", amount: 18000, method: "MERCADOPAGO" }],
    movs: [{ collectionId: "col-1", type: "VENTA", amount: 18000, method: "MP" }],
    payment: { amount: 18000 },
  });
  const primera = await anularCobroTurnoInTx(tx, TENANT, argsAnular());
  const segunda = await anularCobroTurnoInTx(tx, TENANT, argsAnular());
  assert.equal(primera.applied, true);
  assert.deepEqual(segunda, { applied: false, reason: "duplicate", reversaId: primera.applied ? primera.reversaId : "" });
  assert.equal(collections.filter((c) => cobroAnuladoPor(c.note)).length, 1);
  assert.equal(movements.filter((m) => m.type === "EGRESO").length, 1);
});

test("un cobro de un día YA CERRADO no se anula: la corrección va con fecha de hoy", async () => {
  const { tx, collections, movements } = makeTx({
    cobros: [{ id: "col-1", amount: 18000 }],
    movs: [{ collectionId: "col-1", type: "VENTA", amount: 18000, occurredAt: D("2026-09-10") }],
    payment: { amount: 18000 },
  });
  await assert.rejects(
    () => anularCobroTurnoInTx(tx, TENANT, argsAnular({ diaCerradoHasta: "2026-09-10" })),
    (e: unknown) => e instanceof AnulacionRechazada && e.motivo === "dia-cerrado",
  );
  // Y no quedó NADA a medias.
  assert.equal(collections.length, 1);
  assert.equal(movements.length, 1);
});

test("la frontera se mide contra la FECHA CONTABLE del asiento, no contra cuándo se tipeó", async () => {
  // Cobro tipeado el 12 pero imputado al 10 (el libro se carga en diferido). Con el día 10
  // cerrado, la anulación se rechaza aunque `createdAt` caiga en un día abierto.
  const { tx } = makeTx({
    cobros: [{ id: "col-1", amount: 18000, createdAt: D("2026-09-12") }],
    movs: [{ collectionId: "col-1", type: "VENTA", amount: 18000, occurredAt: D("2026-09-10") }],
    payment: { amount: 18000 },
  });
  await assert.rejects(
    () => anularCobroTurnoInTx(tx, TENANT, argsAnular({ diaCerradoHasta: "2026-09-11" })),
    (e: unknown) => e instanceof AnulacionRechazada && e.motivo === "dia-cerrado",
  );
});

test("anular una contrapartida está prohibido: no se anula una anulación", async () => {
  const { tx } = makeTx({
    cobros: [
      { id: "col-1", amount: 18000 },
      { id: "col-2", amount: -18000, note: notaDeAnulacion("col-1", "medio equivocado") },
    ],
    payment: { amount: 0, status: "PENDING" },
  });
  await assert.rejects(
    () => anularCobroTurnoInTx(tx, TENANT, argsAnular({ collectionId: "col-2" })),
    (e: unknown) => e instanceof AnulacionRechazada && e.motivo === "no-es-cobro",
  );
});

test("schema-ahead: sin las columnas migradas la contrapartida se asienta igual, sin clave ni libro", async () => {
  const { tx, collections, movements } = makeTx({
    cobros: [{ id: "col-1", amount: 18000 }],
    payment: { amount: 18000 },
  });
  const r = await anularCobroTurnoInTx(tx, TENANT, argsAnular({ withSchema: false }));
  assert.equal(r.applied, true);
  if (!r.applied) return;
  assert.equal(r.libro.asentada, false);
  assert.equal(collections.find((c) => c.id === r.reversaId)!.idempotencyKey, null);
  // El cobro tampoco había asentado nada: no hay libro que revertir (misma degradación).
  assert.equal(movements.length, 0);
});

test("anulado el cobro, el turno se puede volver a cobrar por el monto completo", async () => {
  const { tx, collections } = makeTx({
    cobros: [{ id: "col-1", amount: 18000, method: "EFECTIVO" }],
    movs: [{ collectionId: "col-1", type: "VENTA", amount: 18000 }],
    payment: { amount: 18000 },
  });
  await anularCobroTurnoInTx(tx, TENANT, argsAnular());
  const cobros = collections.map((c) => ({ amount: c.amount.toNumber(), method: c.method }));
  // Es el caso que motivó todo: se cobró en EFECTIVO lo que fue por TRANSFERENCIA.
  const v = validarCobroTurno({ status: "COMPLETED", precio: 18000, cobros, monto: 18000 });
  assert.equal(v.ok, true);
});

// ── 3. Condonación ──────────────────────────────────────────────────────────

test("condonar salda el turno SIN tocar el libro ni inflar el Payment", async () => {
  const { tx, collections, movements, payments } = makeTx({
    cobros: [{ id: "col-1", amount: 17000 }],
    payment: { amount: 17000, status: "APPROVED" },
  });
  const r = await condonarSaldoTurnoInTx(tx, TENANT, {
    appointmentId: TURNO,
    status: "COMPLETED",
    precio: 20000,
    motivo: "descuento de la dueña a clienta fiel",
    actor: "user:u1",
    withSchema: true,
  });
  assert.equal(r.applied, true);
  if (!r.applied) return;
  assert.equal(r.monto, 3000);

  const fila = collections.find((c) => c.id === r.condonacionId)!;
  assert.equal(claseDeCobro(fila.note), "condonacion");
  assert.equal(fila.amount.toNumber(), 3000);

  // El turno deja de ser cuenta a cobrar (destraba la comisión)…
  const cobros = collections.map((c) => ({ amount: c.amount.toNumber(), method: c.method }));
  assert.equal(estadoCobroTurno({ precio: 20000, cobros }).saldo, 0);
  // …pero NO entró un peso: ni asiento de caja, ni Payment inflado.
  assert.equal(movements.length, 0);
  assert.equal(payments[0].amount, 17000);
  assert.equal(desglosarCobros(collections.map((c) => ({ amount: c.amount.toNumber(), note: c.note }))).cobrado, 17000);
});

test("condonar dos veces no da de baja el saldo dos veces", async () => {
  const { tx, collections } = makeTx({ cobros: [{ id: "col-1", amount: 17000 }], payment: { amount: 17000 } });
  const base = { appointmentId: TURNO, status: "COMPLETED", precio: 20000, motivo: "incobrable", actor: "user:u1", withSchema: true };
  const a = await condonarSaldoTurnoInTx(tx, TENANT, base);
  const b = await condonarSaldoTurnoInTx(tx, TENANT, base);
  assert.equal(a.applied, true);
  assert.deepEqual(b, { applied: false, reason: "duplicate", condonacionId: a.applied ? a.condonacionId : "" });
  assert.equal(collections.filter((c) => claseDeCobro(c.note) === "condonacion").length, 1);
});

test("no se condona un turno que todavía no se prestó ni uno sin saldo", async () => {
  const noPrestado = makeTx({ cobros: [{ id: "col-1", amount: 17000 }] });
  await assert.rejects(
    () =>
      condonarSaldoTurnoInTx(noPrestado.tx, TENANT, {
        appointmentId: TURNO, status: "CONFIRMED", precio: 20000, motivo: "incobrable", actor: "user:u1", withSchema: true,
      }),
    (e: unknown) => e instanceof CondonacionRechazada && e.motivo === "no-prestado",
  );
  const saldado = makeTx({ cobros: [{ id: "col-1", amount: 20000 }] });
  await assert.rejects(
    () =>
      condonarSaldoTurnoInTx(saldado.tx, TENANT, {
        appointmentId: TURNO, status: "COMPLETED", precio: 20000, motivo: "incobrable", actor: "user:u1", withSchema: true,
      }),
    (e: unknown) => e instanceof CondonacionRechazada && e.motivo === "sin-saldo",
  );
});

// ── 4. Invariantes leídas del CÓDIGO (estilo audit-superficie.test.ts) ──────

const SRC = join(process.cwd(), "src", "lib");

test("condonar NO puede escribir en el libro de caja: no hay plata que mover", () => {
  const src = readFileSync(join(SRC, "turnos", "anulacion.ts"), "utf8");
  const desde = src.indexOf("export async function condonarSaldoTurnoInTx");
  assert.ok(desde > 0, "no se encontró condonarSaldoTurnoInTx");
  const cuerpo = src.slice(desde);
  assert.ok(
    !/tx\.cashMovement\.(create|update|delete)/.test(cuerpo),
    "condonarSaldoTurnoInTx escribe en `cashMovement`: una condonación no mueve plata, y asentarla descuadraría el arqueo contra el cajón.",
  );
});

test("anular exige la MISMA capacidad y el MISMO veredicto que cobrar", () => {
  const src = readFileSync(join(SRC, "actions.ts"), "utf8");
  const desde = src.indexOf("export async function anularCobroTurno(");
  assert.ok(desde > 0, "no se encontró anularCobroTurno");
  const cuerpo = src.slice(desde, src.indexOf("export async function condonarSaldoTurno("));
  assert.match(cuerpo, /requireCapability\("agenda:collect"\)/);
  assert.match(cuerpo, /puedeCobrarEsteTurno\(/);
  // La invariante dura dentro de la tx: una profesional no toca cobros ajenos.
  assert.match(cuerpo, /user\.role === "PROFESSIONAL" && appointment\.professionalId !== user\.professionalId/);
  // Y la frontera del libro se consulta antes de revertir.
  assert.match(cuerpo, /lastClosedDay\(tenantId\)/);
});

test("condonar exige agenda:manage: perdonar plata lo decide el negocio, no quien cobra", () => {
  const src = readFileSync(join(SRC, "actions.ts"), "utf8");
  const desde = src.indexOf("export async function condonarSaldoTurno(");
  assert.ok(desde > 0, "no se encontró condonarSaldoTurno");
  const cuerpo = src.slice(desde, desde + 2500);
  assert.match(cuerpo, /requireCapability\("agenda:manage"\)/);
  assert.match(cuerpo, /auditAdmin\(/);
});
