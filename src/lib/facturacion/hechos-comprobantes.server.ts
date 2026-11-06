import "server-only";

// Lee los hechos del contrato de estados v1.1 (Invoice + su envío `InvoiceCreated` del outbox) de
// varias facturas de UN negocio, en una sola pasada. Siempre filtra por tenantId (ADR-018): una
// propuesta con un invoiceId ajeno (rastro débil, sin FK) no encuentra nada y se ve EN_COLA.

import type { Prisma } from "@/generated/prisma/client";
import type { HechosDelComprobante } from "@/lib/facturacion/estado-comprobante";

const OUTBOX_INVOICE_CREATED = "InvoiceCreated";

type Lector = Pick<Prisma.TransactionClient, "invoice" | "outboxEvent">;

/** Tope de facturas por lectura (la bandeja muestra pocas; el resto no se consulta). */
export const MAX_FACTURAS_POR_LECTURA = 100;

export async function hechosDeLasFacturas(db: Lector, tenantId: string, invoiceIds: readonly string[]): Promise<Map<string, HechosDelComprobante>> {
  const ids = [...new Set(invoiceIds.filter(Boolean))].slice(0, MAX_FACTURAS_POR_LECTURA);
  const r = new Map<string, HechosDelComprobante>();
  if (ids.length === 0) return r;
  const [facturas, envios] = await Promise.all([
    db.invoice.findMany({ where: { tenantId, id: { in: ids } }, select: { id: true, status: true, rechazoMotivo: true, cae: true } }),
    db.outboxEvent.findMany({
      where: { tenantId, type: OUTBOX_INVOICE_CREATED, OR: ids.map((id) => ({ payload: { path: ["invoiceId"], equals: id } })) },
      select: { payload: true, processedAt: true, attempts: true, lastError: true, proximoIntentoEn: true, bloqueadoHasta: true, muertoEn: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  // Si una factura tuviera más de un envío (reapertura tras un rechazo), manda el último.
  const envioDe = new Map<string, HechosDelComprobante["envio"]>();
  for (const e of envios) {
    const id = (e.payload as { invoiceId?: unknown } | null)?.invoiceId;
    if (typeof id !== "string") continue;
    envioDe.set(id, {
      processedAt: e.processedAt,
      attempts: e.attempts,
      lastError: e.lastError,
      proximoIntentoEn: e.proximoIntentoEn,
      bloqueadoHasta: e.bloqueadoHasta,
      muertoEn: e.muertoEn,
    });
  }
  for (const f of facturas) {
    const status = f.status === "AUTHORIZED" || f.status === "REJECTED" ? f.status : "PENDING";
    r.set(f.id, { status, rechazoMotivo: f.rechazoMotivo ?? null, cae: f.cae ?? null, envio: envioDe.get(f.id) ?? null });
  }
  return r;
}
