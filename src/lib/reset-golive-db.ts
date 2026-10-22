// RESETEO DE GO-LIVE — leer la foto y ejecutar el plan, SIEMPRE con la `tx` del llamador.
//
// La decisión de qué se borra es de `reset-golive.ts` (pura). Acá sólo se lee lo necesario para
// decidir (ids y enlaces, nada de contenido) y se ejecuta el plan paso por paso, contando: si un
// `deleteMany` borra otra cantidad que la planificada, se tira un error y la transacción entera
// vuelve atrás. Después de ejecutar, se relee la foto y se vuelve a planificar: tiene que dar
// CERO (patrón dry-run → apply → re-dry-run de docs/lecciones-aprendidas/registro.md DX-7).
//
// Nunca abre su propia transacción: el llamador la abre con `tenantTransaction` (RLS + GUC del
// negocio) y además todas las consultas llevan `tenantId` explícito.

import type { Prisma } from "@/generated/prisma/client";
import { lastClosedDayTx } from "@/lib/caja/frontera-cierre";
import { dateStrInBusinessTz } from "@/lib/datetime";
import { ACCION_CUPON_DEL_PEDIDO } from "@/lib/venta-reglas";
import {
  ACCION_RESETEO,
  ACTOR_RESETEO,
  MOTIVO_AJUSTE_STOCK,
  conteoPorTabla,
  planificarReseteo,
  totalABorrar,
  type FotoNegocio,
  type OpcionesReseteo,
  type PlanReseteo,
} from "@/lib/reset-golive";

type Tx = Prisma.TransactionClient;

/** Tablas que existen en la base (una base atrasada en migraciones puede no tener todas). */
export async function tablasExistentes(tx: Tx): Promise<Set<string>> {
  const rows = await tx.$queryRaw<{ relname: string }[]>`
    SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = current_schema() AND c.relkind IN ('r', 'p')`;
  return new Set(rows.map((r) => r.relname));
}

/** Candado consultivo por negocio: dos corridas del reseteo del mismo negocio no se pisan. */
export async function candadoDelReseteo(tx: Tx, tenantId: string): Promise<void> {
  await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"reset-golive:" + tenantId}))`;
}

export async function leerFoto(tx: Tx, tenantId: string, tablas: Set<string>, ahora: Date): Promise<FotoNegocio> {
  const hay = (t: string) => tablas.has(t);
  const w = { tenantId };
  const vacio = async <T>(): Promise<T[]> => [];
  const si = <T>(t: string, f: () => Promise<T[]>) => (hay(t) ? f() : vacio<T>());

  const [
    frontera, appointments, payments, reviews, collections, orders, orderItems, cashMovements, cashSessions, invoices,
    envios, commissionPayouts, stockMovements, stockPurchases, stockPurchaseItems, payables, cheques, receivables, outbox,
    eventosIntegracion, conversaciones, mensajes, extractos, importaciones, movimientosImportados, leads, waitlist,
    professionalBlocks, boxBlocks, clients, coupons, cuponesAudit, cobrosFacturados,
  ] = await Promise.all([
    lastClosedDayTx(tx, tenantId),
    si("Appointment", () => tx.appointment.findMany({ where: w, select: { id: true, clientId: true, startsAt: true, commissionPayoutId: true, couponCode: true } })),
    si("Payment", () => tx.payment.findMany({ where: w, select: { id: true, appointmentId: true } })),
    si("Review", () => tx.review.findMany({ where: w, select: { id: true, appointmentId: true } })),
    si("Collection", () => tx.collection.findMany({ where: w, select: { id: true, orderId: true, appointmentId: true, originType: true, originId: true } })),
    si("Order", () => tx.order.findMany({ where: w, select: { id: true, clientId: true } })),
    si("OrderItem", () => tx.orderItem.findMany({ where: w, select: { id: true, orderId: true } })),
    si("CashMovement", () => tx.cashMovement.findMany({ where: w, select: { id: true, sessionId: true, orderId: true, paymentId: true, collectionId: true, createdBy: true, occurredAt: true } })),
    si("CashSession", () => tx.cashSession.findMany({ where: w, select: { id: true, openedAt: true, status: true } })),
    si("Invoice", () => tx.invoice.findMany({ where: w, select: { id: true, orderId: true, appointmentId: true, status: true, cae: true, comprobanteAsociadoId: true, docNro: true } })),
    si("EnvioComprobante", () => tx.envioComprobante.findMany({ where: w, select: { id: true, invoiceId: true } })),
    si("CommissionPayout", () => tx.commissionPayout.findMany({ where: w, select: { id: true } })),
    si("StockMovement", () => tx.stockMovement.findMany({ where: w, select: { id: true, productId: true, type: true, qty: true, orderId: true, appointmentId: true, purchaseId: true } })),
    si("StockPurchase", () => tx.stockPurchase.findMany({ where: w, select: { id: true } })),
    si("StockPurchaseItem", () => tx.stockPurchaseItem.findMany({ where: w, select: { id: true, purchaseId: true } })),
    si("AccountPayable", () => tx.accountPayable.findMany({ where: w, select: { id: true, purchaseId: true } })),
    si("PayableCheque", () => tx.payableCheque.findMany({ where: w, select: { id: true, payableId: true } })),
    si("AccountReceivable", () => tx.accountReceivable.findMany({ where: w, select: { id: true, clientId: true } })),
    si("OutboxEvent", () => tx.outboxEvent.findMany({ where: w, select: { id: true, processedAt: true, muertoEn: true } })),
    si("EventoIntegracion", () => tx.eventoIntegracion.findMany({ where: w, select: { id: true } })),
    si("ConversacionWhatsapp", () => tx.conversacionWhatsapp.findMany({ where: w, select: { id: true } })),
    si("MensajeWhatsapp", () => tx.mensajeWhatsapp.findMany({ where: w, select: { id: true, conversacionId: true } })),
    si("ExtractoRecibido", () => tx.extractoRecibido.findMany({ where: { tenantId, mensajeId: { not: null } }, select: { mensajeId: true } })),
    si("ImportacionBancaria", () => tx.importacionBancaria.findMany({ where: w, select: { id: true } })),
    si("MovimientoImportado", () => tx.movimientoImportado.findMany({ where: w, select: { id: true, importacionId: true } })),
    si("LeadCampania", () => tx.leadCampania.findMany({ where: w, select: { id: true } })),
    si("WaitlistEntry", () => tx.waitlistEntry.findMany({ where: w, select: { id: true } })),
    si("ProfessionalBlock", () => tx.professionalBlock.findMany({ where: w, select: { id: true, endsAt: true } })),
    si("BoxBlock", () => tx.boxBlock.findMany({ where: w, select: { id: true, endsAt: true } })),
    si("Client", () => tx.client.findMany({ where: w, select: { id: true, createdAt: true, docNro: true } })),
    si("Coupon", () => tx.coupon.findMany({ where: w, select: { id: true, code: true, usedCount: true } })),
    si("AuditLog", () => tx.auditLog.findMany({ where: { tenantId, action: ACCION_CUPON_DEL_PEDIDO, entity: "Order" }, select: { entityId: true, changes: true } })),
    // R1 · sin esto, borrar un comprobante con cobros anotados chocaba con la FK RESTRICT (P2003).
    si("CobroFacturado", () => tx.cobroFacturado.findMany({ where: w, select: { id: true, invoiceId: true } })),
  ]);

  // Clientes con datos de otros módulos (taller, inmobiliaria): nunca se borran.
  const otros = await Promise.all([
    si("TallerVehiculo", () => tx.tallerVehiculo.findMany({ where: w, select: { clientId: true } })).then((r) => r.map((x) => x.clientId)),
    si("TallerOrden", () => tx.tallerOrden.findMany({ where: w, select: { clientId: true } })).then((r) => r.map((x) => x.clientId)),
    si("InmoPropiedad", () => tx.inmoPropiedad.findMany({ where: w, select: { propietarioId: true } })).then((r) => r.map((x) => x.propietarioId)),
    si("InmoConsulta", () => tx.inmoConsulta.findMany({ where: w, select: { clientId: true } })).then((r) => r.map((x) => x.clientId)),
    si("InmoContrato", () => tx.inmoContrato.findMany({ where: w, select: { inquilinoId: true, propietarioId: true } })).then((r) => r.flatMap((x) => [x.inquilinoId, x.propietarioId])),
    si("InmoLiquidacion", () => tx.inmoLiquidacion.findMany({ where: w, select: { propietarioId: true } })).then((r) => r.map((x) => x.propietarioId)),
  ]);

  const productIds = [...new Set(stockMovements.map((s) => s.productId).filter((x): x is string => !!x))];
  const products = productIds.length && hay("Product")
    ? await tx.product.findMany({ where: { tenantId, id: { in: productIds } }, select: { id: true, name: true, stock: true } })
    : [];

  const cuponesDePedidos = cuponesAudit.flatMap((a) => {
    const c = (a.changes ?? {}) as { codigo?: unknown; cuponId?: unknown };
    return a.entityId && typeof c.codigo === "string"
      ? [{ orderId: a.entityId, codigo: c.codigo, cuponId: typeof c.cuponId === "string" ? c.cuponId : null }]
      : [];
  });

  return {
    frontera,
    ahora,
    appointments,
    payments,
    reviews,
    collections: collections.map((c) => ({ ...c, originType: String(c.originType) })),
    orders,
    orderItems,
    cashMovements: cashMovements.map(({ occurredAt, ...m }) => ({ ...m, dia: dateStrInBusinessTz(occurredAt) })),
    cashSessions: cashSessions.map((s) => ({ id: s.id, diaApertura: dateStrInBusinessTz(s.openedAt), status: String(s.status) })),
    invoices: invoices.map((i) => ({
      id: i.id,
      orderId: i.orderId,
      appointmentId: i.appointmentId,
      status: String(i.status),
      // Misma condición que el WHEN del trigger de inmutabilidad.
      conCae: i.status === "AUTHORIZED" || i.cae !== null,
      comprobanteAsociadoId: i.comprobanteAsociadoId,
      docNro: i.docNro,
    })),
    envios,
    cobrosFacturados,
    commissionPayouts,
    stockMovements: stockMovements.map((s) => ({ ...s, type: String(s.type) })),
    stockPurchases,
    stockPurchaseItems,
    payables,
    cheques,
    receivables,
    outbox: outbox.map((o) => ({ id: o.id, pendiente: o.processedAt === null && o.muertoEn === null })),
    eventosIntegracion,
    conversaciones,
    mensajes,
    mensajesConExtracto: extractos.map((e) => e.mensajeId).filter((x): x is string => !!x),
    importaciones,
    movimientosImportados,
    leads,
    waitlist,
    professionalBlocks,
    boxBlocks,
    clients,
    clientesConOtrosModulos: [...new Set(otros.flat().filter((x): x is string => !!x))],
    coupons,
    cuponesDePedidos,
    products,
  };
}

// Prisma delegate por tabla. Explícito (no `tx[nombre]` armado a mano) para que tsc lo revise.
function borrarPorIds(tx: Tx, tabla: string, tenantId: string, ids: string[]): Promise<Prisma.BatchPayload> {
  const where = { tenantId, id: { in: ids } };
  switch (tabla) {
    case "EnvioComprobante": return tx.envioComprobante.deleteMany({ where });
    case "CobroFacturado": return tx.cobroFacturado.deleteMany({ where });
    case "Invoice": return tx.invoice.deleteMany({ where });
    case "EventoIntegracion": return tx.eventoIntegracion.deleteMany({ where });
    case "OutboxEvent": return tx.outboxEvent.deleteMany({ where });
    case "MensajeWhatsapp": return tx.mensajeWhatsapp.deleteMany({ where });
    case "ConversacionWhatsapp": return tx.conversacionWhatsapp.deleteMany({ where });
    case "MovimientoImportado": return tx.movimientoImportado.deleteMany({ where });
    case "ImportacionBancaria": return tx.importacionBancaria.deleteMany({ where });
    case "LeadCampania": return tx.leadCampania.deleteMany({ where });
    case "WaitlistEntry": return tx.waitlistEntry.deleteMany({ where });
    case "Review": return tx.review.deleteMany({ where });
    case "CashMovement": return tx.cashMovement.deleteMany({ where });
    case "CashSession": return tx.cashSession.deleteMany({ where });
    case "Collection": return tx.collection.deleteMany({ where });
    case "Payment": return tx.payment.deleteMany({ where });
    case "StockMovement": return tx.stockMovement.deleteMany({ where });
    case "StockPurchaseItem": return tx.stockPurchaseItem.deleteMany({ where });
    case "StockPurchase": return tx.stockPurchase.deleteMany({ where });
    case "PayableCheque": return tx.payableCheque.deleteMany({ where });
    case "AccountPayable": return tx.accountPayable.deleteMany({ where });
    case "AccountReceivable": return tx.accountReceivable.deleteMany({ where });
    case "OrderItem": return tx.orderItem.deleteMany({ where });
    case "Order": return tx.order.deleteMany({ where });
    case "Appointment": return tx.appointment.deleteMany({ where });
    case "CommissionPayout": return tx.commissionPayout.deleteMany({ where });
    case "ProfessionalBlock": return tx.professionalBlock.deleteMany({ where });
    case "BoxBlock": return tx.boxBlock.deleteMany({ where });
    case "Client": return tx.client.deleteMany({ where });
    default: throw new Error(`tabla sin borrado definido: ${tabla}`);
  }
}

const LOTE = 1000;

export interface ResultadoReseteo {
  borradas: Record<string, number>;
  cupones: number;
  ajustesStock: number;
}

/**
 * Ejecuta el plan dentro de la `tx` del llamador. Cualquier diferencia entre lo planificado y lo
 * borrado tira un error: el llamador no captura, la transacción vuelve atrás y no se borra nada.
 */
export async function aplicarPlan(
  tx: Tx,
  tenantId: string,
  plan: PlanReseteo,
  ctx: { opciones: OpcionesReseteo; frontera: string | null; ahora: Date },
): Promise<ResultadoReseteo> {
  const borradas: Record<string, number> = {};
  for (const paso of plan.pasos) {
    let n = 0;
    for (let i = 0; i < paso.ids.length; i += LOTE) {
      n += (await borrarPorIds(tx, paso.tabla, tenantId, paso.ids.slice(i, i + LOTE))).count;
    }
    if (n !== paso.ids.length) {
      throw new Error(`${paso.paso}: se planificó borrar ${paso.ids.length} y se borraron ${n}. No se borra nada (vuelve todo atrás).`);
    }
    if (n > 0) borradas[paso.tabla] = (borradas[paso.tabla] ?? 0) + n;
  }

  for (const c of plan.cupones) {
    const r = await tx.coupon.updateMany({ where: { tenantId, id: c.id, usedCount: c.de }, data: { usedCount: c.a } });
    if (r.count !== 1) throw new Error(`cupón ${c.code}: cambió el uso mientras corría el reseteo. No se borra nada.`);
  }

  if (plan.ajustesStock.length > 0) {
    await tx.stockMovement.createMany({
      data: plan.ajustesStock.map((a) => ({
        tenantId,
        productId: a.productId,
        type: "AJUSTE" as const,
        qty: a.qty,
        unitCost: null,
        balanceAfter: a.stock,
        reason: MOTIVO_AJUSTE_STOCK,
        createdBy: ACTOR_RESETEO,
      })),
    });
  }

  await tx.auditLog.create({
    data: {
      tenantId,
      actor: ACTOR_RESETEO,
      action: ACCION_RESETEO,
      entity: "Tenant",
      entityId: tenantId,
      channel: "operator",
      changes: {
        borradas: conteoPorTabla(plan),
        conservado: plan.conserva,
        comprobantesConCae: plan.comprobantesConCae.length,
        cupones: plan.cupones,
        ajustesStock: plan.ajustesStock,
        clientesConservados: plan.clientesConservados.length,
        frontera: ctx.frontera,
        opciones: {
          clientesCreadosDesde: ctx.opciones.clientesCreadosDesde?.toISOString() ?? null,
          conservarFuturo: ctx.opciones.conservarFuturo,
          stock: "conservar",
        },
        ejecutadoEn: ctx.ahora.toISOString(),
      },
    },
  });

  return { borradas, cupones: plan.cupones.length, ajustesStock: plan.ajustesStock.length };
}

/** Relee y replanifica: después de aplicar, el plan tiene que quedar vacío. */
export async function verificarVacio(tx: Tx, tenantId: string, tablas: Set<string>, op: OpcionesReseteo, ahora: Date): Promise<PlanReseteo> {
  const despues = planificarReseteo(await leerFoto(tx, tenantId, tablas, ahora), op);
  if (totalABorrar(despues) !== 0 || despues.cupones.length !== 0 || despues.ajustesStock.length !== 0) {
    throw new Error(
      `la verificación posterior no dio cero (quedan ${totalABorrar(despues)} fila(s), ${despues.cupones.length} cupón(es), ` +
        `${despues.ajustesStock.length} ajuste(s) de stock). No se borra nada (vuelve todo atrás).`,
    );
  }
  return despues;
}
