// EL PAGO DIVIDIDO DE UN PEDIDO (Magra, tanda 1 · 1A) — el alta y el cobro, sin base.
//
//   · `decidirAlta`: el pago con varios medios ya no es sólo de la venta COUNTER; lo puede tomar
//     el mostrador también en un pedido con retiro o envío que se registra pagado. La vidriera y
//     la ingesta externa (sin actor de caja) siguen sin poder, y a cuenta tampoco.
//   · `cobrarPedidoEnTx` con asientos: un cobro y un asiento por medio, con la clave
//     `pago-mixto:<orderId>:<medio>`, validados contra el total de la BASE; el segundo toque no
//     escribe nada (MG-005); si no cierran, no queda nada (ni el `paid`).
//
// El cobro corre contra una transacción de mentira que se comporta como Postgres en lo que
// importa acá: `updateMany` con `paid: false` es el árbitro y la clave del cobro es única.

import { test } from "node:test";
import assert from "node:assert/strict";
import { decidirAlta, cobrarPedidoEnTx, CobroDePedidoAnulado, type OrderInput, type OrderProduct } from "@/lib/order-core";
import { RechazoDeDominio } from "@/lib/rechazo-de-dominio";
import { claveDelCobroMixto, MENSAJE_TOTAL_CAMBIO } from "@/lib/supermercado/pago-mixto-tx";
import type { AsientoDePago } from "@/lib/supermercado/pago-mixto";

const VACIO: OrderProduct = { id: "p-vacio", name: "Vacío", saleUnit: "WEIGHT", price: null, pricePerKg: 28600, trackStock: false };

function input(over: Partial<OrderInput> = {}): OrderInput {
  return {
    channel: "ONLINE",
    fulfillment: "PICKUP",
    customerName: "Ana",
    customerPhone: "1155551234",
    address: null,
    notes: null,
    scheduledFor: null,
    paid: true,
    paymentMethod: "EFECTIVO",
    items: [{ productId: VACIO.id, qty: 1.28 }], // 1,28 kg × $28.600 = $36.608
    ...over,
  };
}

const MIXTO: AsientoDePago[] = [
  { medio: "EFECTIVO", monto: 20000 },
  { medio: "MERCADOPAGO", monto: 16608 },
];

test("alta: un pedido con retiro tomado pagado en el mostrador acepta pago dividido", () => {
  const d = decidirAlta({
    tenantId: "t-magra",
    input: input(),
    products: [VACIO],
    opts: { imputarCajaActor: "user:u1", pagosMixtos: { asientos: MIXTO } },
  });
  assert.equal(d.total, 36608);
});

test("alta: la vidriera y la ingesta externa (sin actor de caja) no cobran con varios medios", () => {
  assert.throws(
    () => decidirAlta({ tenantId: "t-magra", input: input(), products: [VACIO], opts: { pagosMixtos: { asientos: MIXTO } } }),
    (e: unknown) => e instanceof RechazoDeDominio && /mostrador/.test(e.message),
  );
});

test("alta: a cuenta no se divide, y el medio de la venta tiene que ser el principal", () => {
  assert.throws(
    () =>
      decidirAlta({
        tenantId: "t-magra",
        input: input({ channel: "COUNTER", paymentMethod: null }),
        products: [VACIO],
        opts: { imputarCajaActor: "user:u1", aCuenta: { createdBy: "user:u1" }, pagosMixtos: { asientos: MIXTO } },
      }),
    RechazoDeDominio,
  );
  assert.throws(
    () =>
      decidirAlta({
        tenantId: "t-magra",
        input: input({ paymentMethod: "MERCADOPAGO" }),
        products: [VACIO],
        opts: { imputarCajaActor: "user:u1", pagosMixtos: { asientos: MIXTO } },
      }),
    (e: unknown) => e instanceof RechazoDeDominio && /principal/.test(e.message),
  );
});

// ── El cobro de un pedido con varios medios ──────────────────────────────────

type Fila = { id: string; tenantId: string; code: number; total: number; paid: boolean; paymentMethod: string | null; status: string };

/** Una transacción de mentira: lo que escribe queda en `escrito` sólo si la tx termina bien. */
function base(pedidos: Fila[]) {
  const estado = {
    pedidos: pedidos.map((p) => ({ ...p })),
    cobros: [] as { tenantId: string; orderId: string; method: string; amount: number; idempotencyKey: string; collectedBy: string }[],
    asientos: [] as { tenantId: string; type: string; method: string; amount: number; collectionId: string; sessionId: string | null }[],
  };
  async function enTx<T>(fn: (tx: never) => Promise<T>): Promise<T> {
    const copia = structuredClone(estado);
    const tx = {
      order: {
        updateMany: async ({ where, data }: { where: { id: string; tenantId: string; paid: boolean }; data: Partial<Fila> }) => {
          const f = copia.pedidos.filter((p) => p.id === where.id && p.tenantId === where.tenantId && p.paid === where.paid);
          for (const p of f) Object.assign(p, data);
          return { count: f.length };
        },
        findFirst: async ({ where }: { where: { id: string; tenantId: string } }) =>
          copia.pedidos.find((p) => p.id === where.id && p.tenantId === where.tenantId) ?? null,
      },
      cashSession: { findFirst: async () => ({ id: "turno-1" }) },
      collection: {
        create: async ({ data }: { data: (typeof estado.cobros)[number] }) => {
          if (copia.cobros.some((c) => c.tenantId === data.tenantId && c.idempotencyKey === data.idempotencyKey)) {
            throw Object.assign(new Error("Unique constraint failed"), { code: "P2002", meta: { target: ["tenantId", "idempotencyKey"] } });
          }
          copia.cobros.push({ ...data, amount: Number(data.amount) });
          return { id: `cobro-${copia.cobros.length}` };
        },
      },
      cashMovement: {
        create: async ({ data }: { data: (typeof estado.asientos)[number] }) => {
          copia.asientos.push({ ...data, amount: Number(data.amount) });
          return { id: `asiento-${copia.asientos.length}` };
        },
      },
    };
    const r = await fn(tx as never);
    Object.assign(estado, copia); // commit
    return r;
  }
  return { estado, enTx };
}

const PEDIDO_128: Fila = { id: "o-128", tenantId: "t-magra", code: 128, total: 25700, paid: false, paymentMethod: null, status: "READY" };
const DIVIDIDO_128: AsientoDePago[] = [
  { medio: "EFECTIVO", monto: 10000 },
  { medio: "TRANSFERENCIA", monto: 15700 },
];

test("MG-006: el pedido #128 de $25.700 se cobra con Efectivo $10.000 + Transferencia $15.700; principal Transferencia", async () => {
  const b = base([PEDIDO_128]);
  const r = await b.enTx((tx) =>
    cobrarPedidoEnTx(tx, "t-magra", { orderId: "o-128", method: "TRANSFERENCIA", actor: "user:u1", asientos: DIVIDIDO_128 }),
  );
  assert.deepEqual(r, { tipo: "cobrado", order: { id: "o-128", code: 128, total: 25700 } });
  assert.equal(b.estado.pedidos[0].paid, true);
  assert.equal(b.estado.pedidos[0].paymentMethod, "TRANSFERENCIA");
  assert.deepEqual(
    b.estado.cobros.map((c) => [c.method, c.amount, c.idempotencyKey]),
    [
      ["EFECTIVO", 10000, claveDelCobroMixto("o-128", "EFECTIVO")],
      ["TRANSFERENCIA", 15700, "pago-mixto:o-128:TRANSFERENCIA"],
    ],
  );
  // Un asiento VENTA por medio, colgado de su cobro y del turno abierto; suman EXACTO el total.
  // El libro junta Mercado Pago y transferencia en su columna MP (cierre-diario.ts, a propósito).
  assert.deepEqual(
    b.estado.asientos.map((a) => [a.type, a.method, a.amount, a.collectionId, a.sessionId]),
    [
      ["VENTA", "EFECTIVO", 10000, "cobro-1", "turno-1"],
      ["VENTA", "MP", 15700, "cobro-2", "turno-1"],
    ],
  );
  assert.equal(b.estado.asientos.reduce((s, a) => s + Math.round(a.amount * 100), 0), 2570000);
});

test("MG-005: el segundo «Cobrar» (doble toque) no escribe nada: sale por ya-cobrado con el medio que quedó", async () => {
  const b = base([PEDIDO_128]);
  const cobrar = () =>
    b.enTx((tx) => cobrarPedidoEnTx(tx, "t-magra", { orderId: "o-128", method: "TRANSFERENCIA", actor: "user:u1", asientos: DIVIDIDO_128 }));
  await cobrar();
  const segundo = await cobrar();
  assert.deepEqual(segundo, { tipo: "ya-cobrado", code: 128, medioRegistrado: "TRANSFERENCIA" });
  assert.equal(b.estado.cobros.length, 2);
  assert.equal(b.estado.asientos.length, 2);
});

test("si los pagos no suman el total de la BASE (el pedido se pesó mientras se cobraba), no queda nada, ni el `paid`", async () => {
  const b = base([{ ...PEDIDO_128, total: 29132 }]);
  await assert.rejects(
    b.enTx((tx) => cobrarPedidoEnTx(tx, "t-magra", { orderId: "o-128", method: "TRANSFERENCIA", actor: "user:u1", asientos: DIVIDIDO_128 })),
    (e: unknown) => e instanceof RechazoDeDominio && e.message === MENSAJE_TOTAL_CAMBIO,
  );
  assert.equal(b.estado.pedidos[0].paid, false);
  assert.equal(b.estado.cobros.length, 0);
  assert.equal(b.estado.asientos.length, 0);
});

test("el medio de la venta tiene que ser el principal del pago dividido (se rechaza antes de tocar nada)", async () => {
  const b = base([PEDIDO_128]);
  await assert.rejects(
    b.enTx((tx) => cobrarPedidoEnTx(tx, "t-magra", { orderId: "o-128", method: "EFECTIVO", actor: "user:u1", asientos: DIVIDIDO_128 })),
    (e: unknown) => e instanceof RechazoDeDominio && /principal/.test(e.message),
  );
  assert.equal(b.estado.pedidos[0].paid, false);
});

test("MG-038: un pedido de otro negocio no se encuentra ni se cobra", async () => {
  const b = base([{ ...PEDIDO_128, tenantId: "t-beauty" }]);
  const r = await b.enTx((tx) =>
    cobrarPedidoEnTx(tx, "t-magra", { orderId: "o-128", method: "TRANSFERENCIA", actor: "user:u1", asientos: DIVIDIDO_128 }),
  );
  assert.deepEqual(r, { tipo: "no-existe" });
  assert.equal(b.estado.pedidos[0].paid, false);
  assert.equal(b.estado.cobros.length, 0);
});

test("un pedido anulado no se cobra con varios medios: la transacción vuelve atrás", async () => {
  const b = base([{ ...PEDIDO_128, status: "CANCELLED" }]);
  await assert.rejects(
    b.enTx((tx) => cobrarPedidoEnTx(tx, "t-magra", { orderId: "o-128", method: "TRANSFERENCIA", actor: "user:u1", asientos: DIVIDIDO_128 })),
    CobroDePedidoAnulado,
  );
  assert.equal(b.estado.pedidos[0].paid, false);
  assert.equal(b.estado.cobros.length, 0);
});
