// ============================================================================
// TEST-GATE — persistencia del cobro de turno (src/lib/turnos/cobro-turno-repo.ts).
// ============================================================================
//
// Invariantes, contra un doble de tx (ADR-026, sin DB):
//  · Cada cobro deja UNA `Collection`, actualiza el `Payment` agregado y asienta UNA VENTA
//    en el libro con el medio del cobro, keyeada por `collectionId`.
//  · Doble clic con la misma clave → el segundo no escribe nada (duplicate).
//  · Cobrar más de lo que falta → rechazado ANTES de escribir (nada queda a medias).
//  · Un turno cobrado por el camino viejo (Payment sin Collection) no se cobra dos veces.
//  · Schema-ahead (`withSchema: false`): Collection + Payment sin clave ni asiento.

import { test } from "node:test";
import assert from "node:assert/strict";
import { Prisma } from "@/generated/prisma/client";
import { aplicarCobroTurnoInTx, cobrosPorTurno, CobroTurnoRechazado, type AplicarCobroArgs, type CobroTurnoTx } from "./cobro-turno-repo";

type ColRow = {
  id: string;
  originType: string;
  originId: string;
  appointmentId: string | null;
  amount: Prisma.Decimal;
  method: string;
  idempotencyKey?: string | null;
  createdAt: Date;
};
type PayRow = { id: string; appointmentId: string; amount: number; method: string; status: string };
type MovRow = { id: string; collectionId: string | null; paymentId: string | null; type: string; amount: number; method: string; reason: string };

function makeTx(opts: { legacyPayment?: PayRow; enforceUnique?: boolean } = {}) {
  const collections: ColRow[] = [];
  const payments: PayRow[] = opts.legacyPayment ? [opts.legacyPayment] : [];
  const movements: MovRow[] = [];
  let seq = 0;
  const tx = {
    collection: {
      findFirst: async (args: { where: { idempotencyKey: string } }) => {
        const c = collections.find((x) => x.idempotencyKey === args.where.idempotencyKey);
        return c ? { id: c.id } : null;
      },
      findMany: async (args: { where: { originId: string | { in: string[] } } }) => {
        const w = args.where.originId;
        const ids = typeof w === "string" ? [w] : w.in;
        return collections.filter((c) => ids.includes(c.originId));
      },
      create: async (args: { data: Omit<ColRow, "id" | "amount" | "createdAt"> & { amount: number } }) => {
        if (opts.enforceUnique && args.data.idempotencyKey && collections.some((c) => c.idempotencyKey === args.data.idempotencyKey)) {
          throw new Prisma.PrismaClientKnownRequestError("dup", {
            code: "P2002",
            clientVersion: "7.8.0",
            meta: { target: "Collection_tenantId_idempotencyKey_key" },
          });
        }
        const row: ColRow = { ...args.data, id: `col_${++seq}`, amount: new Prisma.Decimal(args.data.amount), createdAt: new Date() };
        collections.push(row);
        return { id: row.id };
      },
    },
    payment: {
      findUnique: async (args: { where: { appointmentId: string } }) =>
        payments.find((p) => p.appointmentId === args.where.appointmentId) ?? null,
      upsert: async (args: { where: { appointmentId: string }; create: Omit<PayRow, "id">; update: Partial<PayRow> }) => {
        let p = payments.find((x) => x.appointmentId === args.where.appointmentId);
        if (p) Object.assign(p, args.update);
        else {
          p = { id: `pay_${++seq}`, ...args.create };
          payments.push(p);
        }
        return { id: p.id, amount: p.amount };
      },
    },
    cashSession: { findFirst: async () => null },
    cashMovement: {
      findFirst: async (args: { where: { collectionId?: string; paymentId?: string; type: string } }) => {
        const m = movements.find(
          (x) =>
            x.type === args.where.type &&
            (args.where.collectionId ? x.collectionId === args.where.collectionId : x.paymentId === args.where.paymentId),
        );
        return m ? { id: m.id } : null;
      },
      create: async (args: { data: Omit<MovRow, "id"> }) => {
        const m: MovRow = { id: `mov_${++seq}`, ...args.data };
        movements.push(m);
        return { id: m.id };
      },
    },
  };
  return { tx: tx as unknown as CobroTurnoTx, collections, payments, movements };
}

const args = (over: Partial<AplicarCobroArgs> = {}): AplicarCobroArgs => ({
  appointmentId: "appt_1",
  status: "PENDING",
  precio: 20000,
  monto: 5000,
  method: "TRANSFERENCIA",
  actor: "user:u1",
  detail: "Turno · Limpieza facial — Sofía",
  idempotencyKey: "senia:appt_1",
  withSchema: true,
  ...over,
});

test("seña al reservar: Collection + Payment agregado APPROVED + VENTA en el libro con el medio, keyeada por el cobro", async () => {
  const { tx, collections, payments, movements } = makeTx();
  const r = await aplicarCobroTurnoInTx(tx, "t1", args());
  assert.equal(r.applied, true);
  if (!r.applied) return;
  assert.equal(r.monto, 5000);
  assert.deepEqual(r.estado, { precio: 20000, cobrado: 5000, saldo: 15000, estado: "PARTIAL" });

  assert.equal(collections.length, 1);
  assert.equal(collections[0].originType, "APPOINTMENT");
  assert.equal(collections[0].appointmentId, "appt_1");
  assert.equal(collections[0].idempotencyKey, "senia:appt_1");

  assert.equal(payments.length, 1);
  assert.equal(payments[0].amount, 5000);
  assert.equal(payments[0].status, "APPROVED");
  assert.equal(payments[0].method, "TRANSFERENCIA");

  assert.equal(movements.length, 1);
  assert.equal(movements[0].type, "VENTA");
  assert.equal(movements[0].method, "MP", "transferencia cae en la columna MP del libro");
  assert.equal(movements[0].amount, 5000);
  assert.equal(movements[0].collectionId, collections[0].id);
  assert.equal(movements[0].paymentId, null, "el asiento se keyea por el cobro, no por el Payment agregado");
});

test("seña + saldo: dos Collection, dos asientos, y el Payment agregado suma el total del servicio", async () => {
  const { tx, collections, payments, movements } = makeTx();
  await aplicarCobroTurnoInTx(tx, "t1", args());
  const r = await aplicarCobroTurnoInTx(
    tx,
    "t1",
    args({ status: "CONFIRMED", monto: 15000, method: "EFECTIVO", idempotencyKey: "saldo:appt_1" }),
  );
  assert.equal(r.applied, true);
  if (!r.applied) return;
  assert.deepEqual(r.estado, { precio: 20000, cobrado: 20000, saldo: 0, estado: "PAID" });
  assert.equal(collections.length, 2);
  assert.equal(payments.length, 1, "Payment sigue siendo 1:1 con el turno");
  assert.equal(payments[0].amount, 20000, "lo que ven Reportes, la ficha y comisiones: el total");
  assert.equal(movements.length, 2);
  assert.deepEqual(
    movements.map((m) => [m.method, m.amount]),
    [
      ["MP", 5000],
      ["EFECTIVO", 15000],
    ],
  );
});

test("doble clic con la misma clave: el segundo no escribe nada (duplicate)", async () => {
  const { tx, collections, payments, movements } = makeTx();
  const r1 = await aplicarCobroTurnoInTx(tx, "t1", args());
  const r2 = await aplicarCobroTurnoInTx(tx, "t1", args());
  assert.equal(r1.applied, true);
  assert.deepEqual(r2, { applied: false, reason: "duplicate", collectionId: collections[0].id });
  assert.equal(collections.length, 1);
  assert.equal(payments[0].amount, 5000);
  assert.equal(movements.length, 1);
});

test("carrera: dos submits pasan el pre-check y el @@unique dispara P2002 → lo clasifica el llamador, nada escrito", async () => {
  const { tx, collections } = makeTx({ enforceUnique: true });
  // Simula que otro submit ya dejó su Collection con la misma clave sin que el pre-check la vea.
  collections.push({
    id: "col_otro",
    originType: "APPOINTMENT",
    originId: "appt_1",
    appointmentId: "appt_1",
    amount: new Prisma.Decimal(5000),
    method: "EFECTIVO",
    idempotencyKey: "uuid-x",
    createdAt: new Date(),
  });
  const original = tx.collection.findFirst;
  (tx.collection as unknown as { findFirst: () => Promise<null> }).findFirst = async () => null;
  await assert.rejects(aplicarCobroTurnoInTx(tx, "t1", args({ idempotencyKey: "uuid-x" })), (e: unknown) =>
    e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002",
  );
  (tx.collection as unknown as { findFirst: typeof original }).findFirst = original;
  assert.equal(collections.length, 1);
});

test("cobrar más de lo que falta se rechaza ANTES de escribir", async () => {
  const { tx, collections, payments, movements } = makeTx();
  await aplicarCobroTurnoInTx(tx, "t1", args({ monto: 20000, idempotencyKey: "k1" }));
  await assert.rejects(
    aplicarCobroTurnoInTx(tx, "t1", args({ monto: 1, idempotencyKey: "k2" })),
    (e: unknown) => e instanceof CobroTurnoRechazado && e.motivo === "excede-saldo" && e.saldo === 0,
  );
  assert.equal(collections.length, 1);
  assert.equal(payments[0].amount, 20000);
  assert.equal(movements.length, 1);
});

test("turno cobrado por el camino viejo (Payment APPROVED sin Collection): no se cobra dos veces", async () => {
  const { tx, collections } = makeTx({
    legacyPayment: { id: "pay_legacy", appointmentId: "appt_1", amount: 20000, method: "EFECTIVO", status: "APPROVED" },
  });
  await assert.rejects(
    aplicarCobroTurnoInTx(tx, "t1", args({ monto: 5000 })),
    (e: unknown) => e instanceof CobroTurnoRechazado && e.motivo === "excede-saldo",
  );
  assert.equal(collections.length, 0);
});

test("Payment legado PARCIAL (precio cambió): el pago previo se materializa como cobro y no se pierde un peso", async () => {
  const { tx, collections, payments, movements } = makeTx({
    legacyPayment: { id: "pay_legacy", appointmentId: "appt_1", amount: 15000, method: "EFECTIVO", status: "APPROVED" },
  });
  const r = await aplicarCobroTurnoInTx(tx, "t1", args({ status: "CONFIRMED", monto: 5000 }));
  assert.equal(r.applied, true);
  assert.equal(collections.length, 2, "el legado materializado + el cobro nuevo");
  assert.equal(collections[0].amount.toNumber(), 15000);
  assert.equal(collections[0].idempotencyKey, "legado:appt_1");
  assert.equal(payments[0].amount, 20000, "Reportes/ficha siguen viendo lo que ya había entrado");
  assert.equal(r.applied && r.estado.saldo, 0);
  assert.equal(movements.length, 1, "sólo el cobro nuevo se asienta: el legado ya tuvo su asiento por paymentId");
  assert.equal(movements[0].amount, 5000);
  // Y la lectura posterior coincide con el agregado.
  const map = await cobrosPorTurno(tx, "t1", ["appt_1"]);
  assert.equal(map.get("appt_1")!.reduce((s, c) => s + c.amount, 0), 20000);
});

test("schema-ahead (withSchema=false): Collection + Payment, sin clave persistente ni asiento", async () => {
  const { tx, collections, payments, movements } = makeTx();
  const r = await aplicarCobroTurnoInTx(tx, "t1", args({ withSchema: false }));
  assert.equal(r.applied, true);
  assert.equal(r.applied && r.caja, null);
  assert.equal(collections.length, 1);
  assert.equal(collections[0].idempotencyKey, undefined, "no se escribe la columna que no existe");
  assert.equal(payments[0].amount, 5000);
  assert.equal(movements.length, 0, "el libro no lo ve: lo tipea la dueña, como antes del puente");
});

test("el Payment agregado no lleva comprobanteNro: completar el turno tiene que poder facturar (ADR-024)", async () => {
  const { tx, payments } = makeTx();
  await aplicarCobroTurnoInTx(tx, "t1", args());
  assert.equal("comprobanteNro" in payments[0], false);
});

// ── Lectura tolerante ───────────────────────────────────────────────────────

test("cobrosPorTurno agrupa por turno y tolera que la tabla Collection no esté migrada", async () => {
  const { tx } = makeTx();
  await aplicarCobroTurnoInTx(tx, "t1", args());
  await aplicarCobroTurnoInTx(tx, "t1", args({ appointmentId: "appt_2", idempotencyKey: "senia:appt_2", monto: 3000 }));
  const map = await cobrosPorTurno(tx, "t1", ["appt_1", "appt_2", "appt_3"]);
  assert.deepEqual(map.get("appt_1")?.map((c) => c.amount), [5000]);
  assert.deepEqual(map.get("appt_2")?.map((c) => c.amount), [3000]);
  assert.equal(map.has("appt_3"), false);

  const sinTabla = {
    collection: {
      findMany: async () => {
        throw new Prisma.PrismaClientKnownRequestError("no table", { code: "P2021", clientVersion: "7.8.0", meta: { table: "Collection" } });
      },
    },
  } as unknown as Parameters<typeof cobrosPorTurno>[0];
  const vacio = await cobrosPorTurno(sinTabla, "t1", ["appt_1"]);
  assert.equal(vacio.size, 0, "la agenda sigue cargando");

  const otroError = {
    collection: {
      findMany: async () => {
        throw new Error("se cayó la conexión");
      },
    },
  } as unknown as Parameters<typeof cobrosPorTurno>[0];
  await assert.rejects(cobrosPorTurno(otroError, "t1", ["appt_1"]), /conexión/);
});
