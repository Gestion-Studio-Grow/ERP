// ============================================================================
// EL LINK DE PAGO DE UN PEDIDO, pagado: el aviso de Mercado Pago cobra el pedido UNA vez.
// ============================================================================
//
// Se EJECUTA el camino del handler hacia el Core sin red ni base (NO la ruta del webhook ni su
// despacho, que todavía no conectan `cobrarPedido`: ver pedidos/link-de-pago.ts): el handler
// REAL del plugin, con el cliente de Mercado Pago en memoria (un pago aprobado con la referencia del pedido), llama al cobro REAL
// del Core (`cobrarPedidoPorAvisoDePago` → `cobrarPedidoEnTx` → `recordCashSaleMovementInTx`)
// contra una base falsa que guarda el pedido y el libro. Lo que se mira es lo que se ESCRIBE:
// el pedido queda cobrado con Mercado Pago, el libro tiene un asiento VENTA por el total, y el
// mismo aviso repetido no escribe un segundo asiento.

import { test } from "node:test";
import assert from "node:assert/strict";
import type { Prisma } from "@/generated/prisma/client";
import { procesarNotificacionPago } from "./handler";
import { pedidoDeReferencia, referenciaDePedido } from "./core-contract";
import { StubMercadoPagoClient } from "./stub";
import {
  cobrarPedidoEnTx,
  cobrarPedidoPorAvisoDePago,
  decidirCobroPorAviso,
  type DepsAvisoDePedido,
} from "@/lib/order-core";

type Pedido = { id: string; tenantId: string; code: number; total: number; paid: boolean; paymentMethod: string | null; status: string };

/** Una base falsa con UN pedido y el libro de caja. Respeta el `paid: false` del filtro. */
function baseFalsa(pedido: Pedido) {
  const libro: { orderId: string; amount: number; method: string; type: string; createdBy: string }[] = [];
  const tx = {
    order: {
      updateMany: async ({ where, data }: { where: { id: string; tenantId: string; paid?: boolean }; data: { paid: boolean; paymentMethod: string } }) => {
        const coincide = where.id === pedido.id && where.tenantId === pedido.tenantId && (where.paid === undefined || where.paid === pedido.paid);
        if (!coincide) return { count: 0 };
        pedido.paid = data.paid;
        pedido.paymentMethod = data.paymentMethod;
        return { count: 1 };
      },
      findFirst: async ({ where }: { where: { id: string; tenantId: string } }) =>
        where.id === pedido.id && where.tenantId === pedido.tenantId
          ? { id: pedido.id, code: pedido.code, total: pedido.total, paymentMethod: pedido.paymentMethod, status: pedido.status }
          : null,
    },
    cashSession: { findFirst: async () => ({ id: "sess_1" }) },
    cashMovement: {
      findFirst: async ({ where }: { where: { orderId: string; type: string } }) =>
        libro.find((m) => m.orderId === where.orderId && m.type === where.type) ?? null,
      create: async ({ data }: { data: (typeof libro)[number] }) => {
        libro.push(data);
        return { id: `cm_${libro.length}` };
      },
    },
  } as unknown as Prisma.TransactionClient;
  const auditoria: unknown[] = [];
  const deps: DepsAvisoDePedido = {
    leerPedido: async (tenantId, orderId) =>
      tenantId === pedido.tenantId && orderId === pedido.id
        ? { code: pedido.code, total: pedido.total, paid: pedido.paid, status: pedido.status }
        : null,
    cerradoHasta: async () => null,
    hoy: () => "2026-09-23",
    cobrar: (tenantId, args) => cobrarPedidoEnTx(tx, tenantId, args),
    auditar: async (e) => {
      auditoria.push(e);
    },
  };
  return { libro, auditoria, deps };
}

function pedidoDeMagra(over: Partial<Pedido> = {}): Pedido {
  return { id: "ord_77", tenantId: "t_magra", code: 77, total: 23500, paid: false, paymentMethod: null, status: "PENDING", ...over };
}

/** El handler del plugin con un pago aprobado de la referencia del pedido. */
async function avisar(pedido: Pedido, deps: DepsAvisoDePedido, pago: { id: string; monto: number; estado?: "approved" | "pending" }) {
  const mp = new StubMercadoPagoClient();
  mp.simularPago({ id: pago.id, estado: pago.estado ?? "approved", monto: pago.monto, externalReference: referenciaDePedido(pedido.id) });
  let facturados = 0;
  const r = await procesarNotificacionPago(
    { type: "payment", paymentId: pago.id, tenantId: pedido.tenantId },
    {
      clientePara: () => mp,
      facturar: async () => {
        facturados++;
        return null;
      },
      cobrarPedido: (aviso) => cobrarPedidoPorAvisoDePago(aviso, deps),
    },
  );
  return { r, facturados };
}

test("la referencia del link es el pedido, y sólo un pedido se lee como pedido", () => {
  assert.equal(referenciaDePedido("ord_77"), "pedido:ord_77");
  assert.equal(pedidoDeReferencia("pedido:ord_77"), "ord_77");
  assert.equal(pedidoDeReferencia("appt_123"), null, "la referencia de un turno va pelada");
  assert.equal(pedidoDeReferencia("pedido:"), null);
  assert.equal(pedidoDeReferencia("pedido:../../x"), null, "nada raro entra como id");
});

test("link pagado → el pedido queda cobrado con Mercado Pago y el libro asienta el total; el aviso repetido no asienta de nuevo", async () => {
  const pedido = pedidoDeMagra();
  const { libro, auditoria, deps } = baseFalsa(pedido);

  const primero = await avisar(pedido, deps, { id: "mp_1", monto: 23500 });
  assert.deepEqual(primero.r.pedido, { cobrado: true, code: 77, total: 23500 });
  assert.equal(primero.facturados, 0, "el pago de un pedido no se factura como un turno");
  assert.equal(pedido.paid, true);
  assert.equal(pedido.paymentMethod, "MERCADOPAGO");
  assert.equal(libro.length, 1);
  assert.deepEqual(
    { orderId: libro[0].orderId, amount: libro[0].amount, type: libro[0].type, createdBy: libro[0].createdBy },
    { orderId: "ord_77", amount: 23500, type: "VENTA", createdBy: "mercadopago:mp_1" },
  );
  assert.equal(auditoria.length, 1);

  // Mercado Pago reintenta el MISMO aviso: el pedido ya está cobrado, no hay segundo asiento.
  const repetido = await avisar(pedido, deps, { id: "mp_1", monto: 23500 });
  assert.equal(repetido.r.pedido?.cobrado, false);
  assert.equal(repetido.r.pedido && !repetido.r.pedido.cobrado ? repetido.r.pedido.motivo : null, "ya-cobrado");
  assert.equal(libro.length, 1, "un solo asiento en el libro");
  assert.equal(auditoria.length, 1, "y un solo rastro de cobro");
});

test("un pago pendiente no cobra; uno aprobado después, sí", async () => {
  const pedido = pedidoDeMagra();
  const { libro, deps } = baseFalsa(pedido);
  const pendiente = await avisar(pedido, deps, { id: "mp_2", monto: 23500, estado: "pending" });
  assert.equal(pendiente.r.pedido, undefined);
  assert.equal(pedido.paid, false);
  assert.equal(libro.length, 0);
  await avisar(pedido, deps, { id: "mp_2", monto: 23500 });
  assert.equal(pedido.paid, true);
  assert.equal(libro.length, 1);
});

test("el pedido se pesó y cambió después del link: el aviso NO cobra solo y dice por qué", async () => {
  const pedido = pedidoDeMagra({ total: 25100 });
  const { libro, deps } = baseFalsa(pedido);
  const { r } = await avisar(pedido, deps, { id: "mp_3", monto: 23500 });
  assert.equal(r.pedido?.cobrado, false);
  assert.match(r.pedido && !r.pedido.cobrado ? r.pedido.detalle : "", /\$ ?23\.500,00.*\$ ?25\.100,00/);
  assert.equal(pedido.paid, false);
  assert.equal(libro.length, 0);
});

test("un pedido anulado no se cobra aunque llegue el pago; un pedido de otro negocio, tampoco", async () => {
  const anulado = pedidoDeMagra({ status: "CANCELLED" });
  const a = baseFalsa(anulado);
  const r1 = await avisar(anulado, a.deps, { id: "mp_4", monto: 23500 });
  assert.equal(r1.r.pedido && !r1.r.pedido.cobrado ? r1.r.pedido.motivo : null, "anulado");
  assert.equal(a.libro.length, 0);

  // El webhook resolvió OTRO negocio que el del pedido: no lo encuentra, no escribe nada.
  const ajeno = pedidoDeMagra({ tenantId: "t_otro" });
  const b = baseFalsa(ajeno);
  const r2 = await cobrarPedidoPorAvisoDePago({ tenantId: "t_magra", orderId: "ord_77", paymentId: "mp_5", monto: 23500 }, b.deps);
  assert.deepEqual(r2.cobrado ? null : r2.motivo, "no-existe");
  assert.equal(b.libro.length, 0);
});

test("con la caja de hoy cerrada, el aviso no mete plata en un día contado", async () => {
  const pedido = pedidoDeMagra();
  const { libro, deps } = baseFalsa(pedido);
  const r = await cobrarPedidoPorAvisoDePago(
    { tenantId: "t_magra", orderId: "ord_77", paymentId: "mp_6", monto: 23500 },
    { ...deps, cerradoHasta: async () => "2026-09-23" },
  );
  assert.equal(r.cobrado ? null : r.motivo, "dia-cerrado");
  assert.equal(pedido.paid, false);
  assert.equal(libro.length, 0);
});

test("la decisión del aviso, pura", () => {
  const p = { code: 5, total: 1000, paid: false, status: "READY" };
  assert.deepEqual(decidirCobroPorAviso({ pedido: p, monto: 1000 }), { cobrar: true });
  assert.deepEqual(decidirCobroPorAviso({ pedido: p, monto: 1000.004 }), { cobrar: true }, "centavos de redondeo no frenan");
  assert.equal(decidirCobroPorAviso({ pedido: { ...p, paid: true }, monto: 1000 }).cobrar, false);
  assert.equal(decidirCobroPorAviso({ pedido: null, monto: 1000 }).cobrar, false);
});

test("sin el cobro de pedidos conectado, el pago de un pedido no se factura como si fuera un turno", async () => {
  const mp = new StubMercadoPagoClient();
  mp.simularPago({ id: "mp_7", estado: "approved", monto: 100, externalReference: referenciaDePedido("ord_1") });
  let facturados = 0;
  const r = await procesarNotificacionPago(
    { type: "payment", paymentId: "mp_7", tenantId: "t" },
    { clientePara: () => mp, facturar: async () => (facturados++, "inv") },
  );
  assert.equal(facturados, 0);
  assert.equal(r.facturado, false);
  // El turno (referencia pelada) sigue facturándose como siempre.
  mp.simularPago({ id: "mp_8", estado: "approved", monto: 100, externalReference: "appt_9" });
  const turno = await procesarNotificacionPago(
    { type: "payment", paymentId: "mp_8", tenantId: "t" },
    { clientePara: () => mp, facturar: async (id) => (id === "appt_9" ? "inv_9" : null) },
  );
  assert.equal(turno.invoiceId, "inv_9");
});
