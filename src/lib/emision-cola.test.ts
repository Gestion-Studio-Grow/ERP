// ============================================================================
// APROBAR Y EMITIR DESDE LA COLA — la venta se vuelve a mirar antes de sacar la factura suelta.
// ============================================================================
//
// El riesgo: un cobro de un turno SIN factura entra a la cola de revisión; mientras espera, el
// turno se factura por su camino; alguien aprueba el ítem y sale la SEGUNDA factura de la misma
// venta. Acá se ejecutan `aprobarRevisionEnTx` y `emitirMovimientoEnTx` (con el resolutor real y
// `createInvoiceInTx` real) sobre una base falsa que respeta los `where` —incluido el estado del
// compare-and-set— y cuenta las facturas creadas.

import { test } from "node:test";
import assert from "node:assert/strict";
import type { Prisma } from "@/generated/prisma/client";
import { aprobarRevisionEnTx, emitirMovimientoEnTx, referenciaDeVentaDelMovimiento } from "./emision-cola";
import type { CreateInvoiceInput } from "./invoice-core";

const T = "t_ch";

type Mov = {
  id: string;
  tenantId: string;
  hash: string;
  referencia: string | null;
  estadoPropuesta: string;
  motivoRevision: string | null;
  invoiceId: string | null;
  docTipo?: number;
};
type Factura = { id: string; tenantId: string; status: string; appointmentId?: string; orderId?: string };

function mundo(opts: { turnoFacturado: boolean; estado?: string; referencia?: string | null }) {
  const m = {
    movs: [
      {
        id: "mov_1",
        tenantId: T,
        hash: "mp:pay_1",
        referencia: opts.referencia === undefined ? "appt_1" : opts.referencia,
        estadoPropuesta: opts.estado ?? "revision",
        motivoRevision: "Cobro del turno del 24/09/2026 12:30 sin factura: …",
        invoiceId: null,
      },
    ] as Mov[],
    facturas: (opts.turnoFacturado ? [{ id: "inv_turno", tenantId: T, status: "AUTHORIZED", appointmentId: "appt_1" }] : []) as Factura[],
    outbox: 0,
    lecturasDeVenta: 0,
  };
  const coincide = (mv: Mov, w: Record<string, unknown>) =>
    mv.id === w.id && mv.tenantId === w.tenantId && (w.estadoPropuesta === undefined || mv.estadoPropuesta === w.estadoPropuesta);
  const tx = {
    movimientoImportado: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        const mv = m.movs.find((x) => coincide(x, where));
        return mv ? { hash: mv.hash, referencia: mv.referencia } : null;
      },
      // El compare-and-set: sólo toca la fila si sigue en el estado del `where`.
      updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Partial<Mov> }) => {
        const filas = m.movs.filter((x) => coincide(x, where));
        for (const f of filas) Object.assign(f, data);
        return { count: filas.length };
      },
    },
    order: { findMany: async () => [] },
    appointment: {
      findMany: async ({ where }: { where: { tenantId: string; id: { in: string[] } } }) => {
        m.lecturasDeVenta++;
        return where.tenantId === T && where.id.in.includes("appt_1")
          ? [
              {
                id: "appt_1",
                startsAt: new Date("2026-09-24T15:30:00Z"),
                payment: null,
                invoices: m.facturas.filter((f) => f.appointmentId === "appt_1").map(({ id, status }) => ({ id, status })),
              },
            ]
          : [];
      },
    },
    invoice: {
      create: async ({ data }: { data: { tenantId: string } }) => {
        const id = `inv_suelta_${m.facturas.length + 1}`;
        m.facturas.push({ id, tenantId: data.tenantId, status: "PENDING" });
        return { id };
      },
    },
    outboxEvent: {
      create: async () => {
        m.outbox++;
        return {};
      },
    },
  } as unknown as Prisma.TransactionClient;
  return { m, tx };
}

const DATOS = { docTipo: 99, docNro: "0", nombreReceptor: null, descripcionServicio: null };
const FACTURA = (): CreateInvoiceInput => ({
  tenantId: T,
  concepto: 1,
  fecha: "20260924",
  emisor: { cuit: 20111111112, condicionIva: "MONOTRIBUTO", puntoVenta: 1 },
  receptor: { docTipo: 99, docNro: 0, condicionIva: "CONSUMIDOR_FINAL" },
  neto: 5000,
  iva: [],
  total: 5000,
});
const sueltas = (m: { facturas: Factura[] }) => m.facturas.filter((f) => f.id.startsWith("inv_suelta_")).length;

test("aprobar un cobro cuyo turno YA se facturó: no pasa a emitirse, queda no facturable con el motivo verdadero", async () => {
  const { m, tx } = mundo({ turnoFacturado: true });
  const r = await aprobarRevisionEnTx(tx, T, "mov_1", DATOS);
  assert.deepEqual(r, { tipo: "ya-facturada", motivo: "Ya facturado con el turno del 24/09/2026 12:30." });
  assert.equal(m.movs[0].estadoPropuesta, "no_facturable");
  assert.equal(m.movs[0].motivoRevision, "Ya facturado con el turno del 24/09/2026 12:30.");
  assert.equal(sueltas(m), 0);
});

test("aprobado cuando no tenía factura, y el turno se factura ANTES de emitir: la emisión no saca la segunda", async () => {
  const { m, tx } = mundo({ turnoFacturado: false });
  assert.deepEqual(await aprobarRevisionEnTx(tx, T, "mov_1", DATOS), { tipo: "aprobada" });
  assert.equal(m.movs[0].estadoPropuesta, "auto");
  // Mientras tanto, recepción factura el turno por su camino.
  m.facturas.push({ id: "inv_turno", tenantId: T, status: "PENDING", appointmentId: "appt_1" });
  const r = await emitirMovimientoEnTx(tx, T, m.movs[0], FACTURA);
  assert.equal(r.tipo, "ya-facturada");
  assert.equal(sueltas(m), 0, "no hay factura suelta");
  assert.equal(m.outbox, 0);
  assert.equal(m.movs[0].estadoPropuesta, "no_facturable");
});

test("aprobar y emitir un cobro cuyo turno sigue SIN factura: sale UNA factura suelta, como hoy", async () => {
  const { m, tx } = mundo({ turnoFacturado: false });
  await aprobarRevisionEnTx(tx, T, "mov_1", DATOS);
  const r = await emitirMovimientoEnTx(tx, T, m.movs[0], FACTURA);
  assert.deepEqual(r, { tipo: "emitida", invoiceId: "inv_suelta_1" });
  assert.equal(sueltas(m), 1);
  assert.equal(m.outbox, 1);
  assert.deepEqual([m.movs[0].estadoPropuesta, m.movs[0].invoiceId], ["emitida", "inv_suelta_1"]);
  // Una factura rechazada por ARCA no cuenta: con ésa sola, también se emite.
  const rech = mundo({ turnoFacturado: false, estado: "auto" });
  rech.m.facturas.push({ id: "inv_r", tenantId: T, status: "REJECTED", appointmentId: "appt_1" });
  assert.equal((await emitirMovimientoEnTx(rech.tx, T, rech.m.movs[0], FACTURA)).tipo, "emitida");
});

test("doble clic: dos aprobaciones y dos emisiones a la vez del mismo ítem sacan UNA factura", async () => {
  const { m, tx } = mundo({ turnoFacturado: false });
  const aprobaciones = await Promise.all([aprobarRevisionEnTx(tx, T, "mov_1", DATOS), aprobarRevisionEnTx(tx, T, "mov_1", DATOS)]);
  assert.deepEqual(aprobaciones.map((a) => a.tipo).sort(), ["aprobada", "no-esta-en-revision"]);
  const emisiones = await Promise.all([
    emitirMovimientoEnTx(tx, T, m.movs[0], FACTURA),
    emitirMovimientoEnTx(tx, T, m.movs[0], FACTURA),
  ]);
  assert.deepEqual(emisiones.map((e) => e.tipo).sort(), ["emitida", "tomada"]);
  assert.equal(sueltas(m), 1);
  // Y otra vez, más tarde: ya está emitida, no hace nada.
  assert.equal((await emitirMovimientoEnTx(tx, T, m.movs[0], FACTURA)).tipo, "tomada");
  assert.equal(sueltas(m), 1);
});

test("un movimiento del banco o una fila de MP vieja (referencia = id del pago) no tiene venta que mirar: se emite como siempre", async () => {
  assert.equal(referenciaDeVentaDelMovimiento({ hash: "mp:pay_1", referencia: "pay_1" }), null, "fila vieja");
  assert.equal(referenciaDeVentaDelMovimiento({ hash: "bco:abc", referencia: "appt_1" }), null, "banco");
  assert.equal(referenciaDeVentaDelMovimiento({ hash: "mp:pay_1", referencia: " appt_1 " }), "appt_1");
  const { m, tx } = mundo({ turnoFacturado: true, estado: "auto", referencia: "pay_1" });
  assert.equal((await emitirMovimientoEnTx(tx, T, m.movs[0], FACTURA)).tipo, "emitida");
  assert.equal(m.lecturasDeVenta, 0, "ni se consulta");
});
