// ============================================================================
// TEST-GATE I2 (ADR-064) — comprobante ↔ venta 1:1 (idempotencia por venta).
// ============================================================================
//
// Invariante: NO hay DOS comprobantes para la misma venta. `createInvoice` es idempotente
// por origen (Order/Appointment): un reintento devuelve la MISMA factura, no crea otra.
//
// Sin DB (ADR-026): se testea la ORQUESTACIÓN real (`createInvoiceInTx`) contra un doble de
// test que modela el store de facturas + la guarda UNIQUE por origen (patrón audit-retention:
// mock casteado al tipo del tx). La CARRERA concurrente + la recuperación P2002 se modela con
// una simulación pura (patrón collection-concurrency): dos emisiones simultáneas de la misma
// venta → exactamente 1 factura, ambas devuelven el mismo id.

import { test } from "node:test";
import assert from "node:assert/strict";
import { Prisma } from "@/generated/prisma/client";
import { createInvoiceInTx, type CreateInvoiceInput, type InvoiceTx } from "./invoice-core";

// --- Doble de test: store en memoria con la guarda UNIQUE (tenantId, orderId/appointmentId). ---

interface StoredInvoice {
  id: string;
  tenantId: string;
  orderId: string | null;
  appointmentId: string | null;
  mpPaymentId: string | null; // A-6 — origen MP_PAYMENT
}

function makeMockTx() {
  const invoices: StoredInvoice[] = [];
  const outbox: { type: string; tenantId: string }[] = [];
  let seq = 0;

  function p2002(target: string): Prisma.PrismaClientKnownRequestError {
    return new Prisma.PrismaClientKnownRequestError(
      `Unique constraint failed on ${target}`,
      { code: "P2002", clientVersion: "test", meta: { target } },
    );
  }

  const tx = {
    invoice: {
      findFirst: async (args: {
        where: { tenantId: string; orderId?: string; appointmentId?: string; mpPaymentId?: string };
      }) => {
        const w = args.where;
        const found = invoices.find(
          (i) =>
            i.tenantId === w.tenantId &&
            (w.orderId !== undefined ? i.orderId === w.orderId : true) &&
            (w.appointmentId !== undefined ? i.appointmentId === w.appointmentId : true) &&
            (w.mpPaymentId !== undefined ? i.mpPaymentId === w.mpPaymentId : true) &&
            // al menos una condición de origen tuvo que matchear (no devolver una sin origen)
            (w.orderId !== undefined || w.appointmentId !== undefined || w.mpPaymentId !== undefined),
        );
        return found ? { id: found.id } : null;
      },
      create: async (args: {
        data: { tenantId: string; orderId?: string; appointmentId?: string; mpPaymentId?: string };
      }) => {
        const d = args.data;
        const orderId = d.orderId ?? null;
        const appointmentId = d.appointmentId ?? null;
        const mpPaymentId = d.mpPaymentId ?? null;
        // Guarda UNIQUE (NULLs no colisionan, como en Postgres).
        if (orderId !== null && invoices.some((i) => i.tenantId === d.tenantId && i.orderId === orderId)) {
          throw p2002("Invoice_tenantId_orderId_key");
        }
        if (
          appointmentId !== null &&
          invoices.some((i) => i.tenantId === d.tenantId && i.appointmentId === appointmentId)
        ) {
          throw p2002("Invoice_tenantId_appointmentId_key");
        }
        if (
          mpPaymentId !== null &&
          invoices.some((i) => i.tenantId === d.tenantId && i.mpPaymentId === mpPaymentId)
        ) {
          throw p2002("Invoice_tenantId_mpPaymentId_key");
        }
        const inv: StoredInvoice = { id: `inv_${++seq}`, tenantId: d.tenantId, orderId, appointmentId, mpPaymentId };
        invoices.push(inv);
        return { id: inv.id };
      },
    },
    outboxEvent: {
      create: async (args: { data: { type: string; tenantId: string } }) => {
        outbox.push({ type: args.data.type, tenantId: args.data.tenantId });
        return {};
      },
    },
  };

  return { tx: tx as unknown as InvoiceTx, mock: tx, invoices, outbox };
}

function baseInput(overrides: Partial<CreateInvoiceInput> = {}): CreateInvoiceInput {
  return {
    tenantId: "t1",
    concepto: 1,
    fecha: "20260710",
    emisor: { cuit: 20111111112, condicionIva: "RI", puntoVenta: 1 },
    receptor: { docTipo: 99, docNro: 0, condicionIva: "CF" },
    neto: 1000,
    iva: [{ alicuotaId: 5, base: 1000, importe: 210 }],
    total: 1210,
    ...overrides,
  };
}

// --- Idempotencia SECUENCIAL (reintento) sobre la orquestación real. ---

test("I2 · reintento sobre la misma venta → mismo comprobante, una sola factura, un solo outbox", async () => {
  const { tx, invoices, outbox } = makeMockTx();
  const input = baseInput({ origin: { type: "ORDER", id: "ord_1" } });

  const id1 = await createInvoiceInTx(tx, input);
  const id2 = await createInvoiceInTx(tx, input); // reintento

  assert.equal(id1, id2, "el reintento devuelve el MISMO comprobante");
  assert.equal(invoices.length, 1, "una sola factura para la venta");
  assert.equal(outbox.length, 1, "el reintento NO encola un segundo outbox (no re-despacha)");
});

test("I2 · idempotencia también por turno (APPOINTMENT)", async () => {
  const { tx, invoices } = makeMockTx();
  const input = baseInput({ concepto: 2, origin: { type: "APPOINTMENT", id: "apt_1" } });

  const id1 = await createInvoiceInTx(tx, input);
  const id2 = await createInvoiceInTx(tx, input);

  assert.equal(id1, id2);
  assert.equal(invoices.length, 1);
});

test("I2 · ventas DISTINTAS generan comprobantes distintos", async () => {
  const { tx, invoices } = makeMockTx();
  const idA = await createInvoiceInTx(tx, baseInput({ origin: { type: "ORDER", id: "ord_A" } }));
  const idB = await createInvoiceInTx(tx, baseInput({ origin: { type: "ORDER", id: "ord_B" } }));

  assert.notEqual(idA, idB);
  assert.equal(invoices.length, 2);
});

test("I2 · SIN origen (previa a D10) NO dedupe: crea siempre", async () => {
  const { tx, invoices } = makeMockTx();
  const id1 = await createInvoiceInTx(tx, baseInput()); // sin origin
  const id2 = await createInvoiceInTx(tx, baseInput()); // sin origin

  assert.notEqual(id1, id2, "sin venta enlazada no hay 1:1 → dos facturas legítimas");
  assert.equal(invoices.length, 2);
});

// --- A-6 · Doble factura por webhook MP duplicado (origen MP_PAYMENT). ---

test("A-6 · webhook MP duplicado (mismo payment_id) → una sola factura, mismo comprobante", async () => {
  const { tx, invoices, outbox } = makeMockTx();
  const input = baseInput({ origin: { type: "MP_PAYMENT", id: "mp_pay_123" } });

  const id1 = await createInvoiceInTx(tx, input);
  const id2 = await createInvoiceInTx(tx, input); // MP reintenta la notificación

  assert.equal(id1, id2, "el reintento del webhook devuelve la MISMA factura");
  assert.equal(invoices.length, 1, "un solo comprobante por pago MP");
  assert.equal(outbox.length, 1, "no re-despacha");
});

test("A-6 · pagos MP distintos → facturas distintas", async () => {
  const { tx, invoices } = makeMockTx();
  const a = await createInvoiceInTx(tx, baseInput({ origin: { type: "MP_PAYMENT", id: "mp_A" } }));
  const b = await createInvoiceInTx(tx, baseInput({ origin: { type: "MP_PAYMENT", id: "mp_B" } }));
  assert.notEqual(a, b);
  assert.equal(invoices.length, 2);
});

test("A-6 · BUG(antes): SIN origin, dos webhooks del mismo pago facturaban dos veces", async () => {
  // Antes del fix, facturarPagoMP llamaba createInvoice SIN origin → hasOrigin=false → sin dedupe.
  const { tx, invoices } = makeMockTx();
  await createInvoiceInTx(tx, baseInput()); // sin origin (comportamiento viejo)
  await createInvoiceInTx(tx, baseInput()); // sin origin
  assert.equal(invoices.length, 2, "sin la clave MP_PAYMENT el webhook duplicado facturaba de más");
});

test("I2 · la guarda UNIQUE del schema dispara P2002 ante un doble-create directo (misma venta)", async () => {
  // Modela la ventana de carrera: dos creates de la misma venta SIN pasar por el check
  // (ambos lo pasaron cuando el store estaba vacío). El UNIQUE (Gate 2) hace fallar al 2º.
  const { mock } = makeMockTx();
  const tenantId = "t1";

  await mock.invoice.create({ data: { tenantId, orderId: "ord_race" } });
  await assert.rejects(
    () => mock.invoice.create({ data: { tenantId, orderId: "ord_race" } }),
    (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002",
    "el índice único debe rechazar el segundo comprobante para la misma venta",
  );
});

// --- CARRERA concurrente + recuperación P2002 (simulación pura, estilo collection-concurrency). ---
//
// Modela el flujo REAL de `createInvoice` bajo concurrencia: dos emisiones leen el store vacío
// (ambas pasan el check), ambas intentan crear; el UNIQUE deja pasar a una y aborta la otra con
// P2002; la abortada REFETCHEA (query nueva, fuera de la tx) y devuelve el ganador. Resultado:
// exactamente 1 factura y ambas emisiones devuelven el MISMO id (idempotente de punta a punta).

interface RaceStore {
  invoices: { id: string; orderId: string }[];
  seq: number;
}

function emitWithRecovery(store: RaceStore, orderId: string, readSawExisting: boolean): string {
  // 1) check-then-create con la lectura de ANTES de la carrera (readSawExisting = lo que vio en su snapshot)
  if (readSawExisting) {
    const existing = store.invoices.find((i) => i.orderId === orderId);
    if (existing) return existing.id;
  }
  // 2) intento de create contra la guarda UNIQUE
  const already = store.invoices.find((i) => i.orderId === orderId);
  if (already) {
    // P2002 → 3) recuperación: refetch del ganador (idempotente)
    return already.id;
  }
  const inv = { id: `inv_${++store.seq}`, orderId };
  store.invoices.push(inv);
  return inv.id;
}

test("I2 · CARRERA: dos emisiones simultáneas de la misma venta → 1 factura, mismo id (P2002 + recovery)", () => {
  const store: RaceStore = { invoices: [], seq: 0 };
  // Ambas leyeron el store vacío en su snapshot (readSawExisting=false): la carrera real.
  const idA = emitWithRecovery(store, "ord_x", /* readSawExisting */ false);
  const idB = emitWithRecovery(store, "ord_x", /* readSawExisting */ false);

  assert.equal(store.invoices.length, 1, "NUNCA dos comprobantes para la misma venta");
  assert.equal(idA, idB, "ambas emisiones convergen al mismo comprobante");
});

test("I2 · CARRERA saldada: la emisión que llega después ve el comprobante y lo reusa", () => {
  const store: RaceStore = { invoices: [], seq: 0 };
  const idA = emitWithRecovery(store, "ord_y", false);
  const idB = emitWithRecovery(store, "ord_y", /* ya ve la factura */ true);
  assert.equal(idA, idB);
  assert.equal(store.invoices.length, 1);
});
