// ============================================================================
// Loader SERVER del Libro IVA (ADR-060 D7) — arma las filas desde lo que YA existe.
// ============================================================================
//
// Guard `reports:read`. Deriva el Libro IVA de un período de:
//   - VENTAS: `Invoice` AUTORIZADO (comprobante fiscal exacto) + `Order` pagado (retail) +
//     `Payment` APPROVED → `Appointment` (servicios). Cubre AMBOS caminos de venta.
//   - COMPRAS: `StockPurchase` (kind COMPRA).
//
// DEDUPE fiscal (usando el enlace D10 que YA existe en el schema: `Invoice.orderId` /
// `Invoice.appointmentId`): una venta ya facturada por ARCA se cuenta SOLO en la sección
// fiscal — el Order/Payment de ese mismo origen se excluye para no duplicar. Lo no
// facturado va a la sección "estimado 21%". Read-only, cero schema, cero escritura.

import { prisma } from "@/lib/prisma";
import { getCurrentTenantId } from "@/lib/tenant";
import { requireCapability } from "@/lib/authz";
import { DEFAULT_REPORT_RANGE_DAYS } from "@/lib/report-config";
import {
  buildLibroIva,
  ventaFromInvoice,
  ventaFromGross,
  compraFromPurchase,
  dateToIso,
  type LibroIva,
  type VentaRow,
  type CompraRow,
} from "./libro-iva";

export interface LibroIvaReport {
  libro: LibroIva;
  desde: string; // YYYY-MM-DD
  hasta: string; // YYYY-MM-DD
  rangeDays: number;
}

/** `Date` → "AAAAMMDD" para comparar contra `Invoice.fecha` (string fiscal). */
function toFiscal(d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

/** Recupera CUIT / N° de orden que S4 compuso en `notes` de la compra (formal-order). */
function parseFormalNotes(notes: string | null): { cuit: string | null; oc: string | null } {
  const cuit = notes ? /CUIT\s+([\d-]+)/i.exec(notes)?.[1] ?? null : null;
  const oc = notes ? /OC\s*#(\S+)/i.exec(notes)?.[1] ?? null : null;
  return { cuit, oc };
}

export async function getLibroIva(rangeDays: number = DEFAULT_REPORT_RANGE_DAYS): Promise<LibroIvaReport> {
  await requireCapability("reports:read");
  const tenantId = await getCurrentTenantId();

  const hasta = new Date();
  const desde = new Date(hasta.getTime() - rangeDays * 24 * 60 * 60 * 1000);

  const [invoices, orders, payments, purchases] = await Promise.all([
    prisma.invoice.findMany({
      where: { tenantId, status: "AUTHORIZED", fecha: { gte: toFiscal(desde), lte: toFiscal(hasta) } },
      select: {
        fecha: true, tipoComprobante: true, puntoVenta: true, numero: true,
        docTipo: true, docNro: true, neto: true, iva: true, total: true,
        orderId: true, appointmentId: true,
      },
    }),
    prisma.order.findMany({
      where: { tenantId, paid: true, status: { not: "CANCELLED" }, createdAt: { gte: desde, lte: hasta } },
      select: { id: true, code: true, total: true, createdAt: true, customerName: true },
    }),
    prisma.payment.findMany({
      where: { tenantId, status: "APPROVED", createdAt: { gte: desde, lte: hasta } },
      select: {
        amount: true, createdAt: true, comprobanteNro: true, appointmentId: true,
        appointment: { select: { client: { select: { name: true } } } },
      },
    }),
    prisma.stockPurchase.findMany({
      where: { tenantId, kind: "COMPRA", createdAt: { gte: desde, lte: hasta } },
      select: { code: true, supplier: true, totalCost: true, createdAt: true, notes: true },
    }),
  ]);

  // Orígenes ya facturados (dedupe): no se cuentan como venta "estimada".
  const invoicedOrderIds = new Set(invoices.map((i) => i.orderId).filter(Boolean) as string[]);
  const invoicedApptIds = new Set(invoices.map((i) => i.appointmentId).filter(Boolean) as string[]);

  const ventas: VentaRow[] = [
    ...invoices.map((i) =>
      ventaFromInvoice({
        fecha: i.fecha,
        tipoComprobante: i.tipoComprobante,
        puntoVenta: i.puntoVenta,
        numero: i.numero,
        docTipo: i.docTipo,
        docNro: i.docNro,
        neto: Number(i.neto),
        iva: Number(i.iva),
        total: Number(i.total),
      }),
    ),
    ...orders
      .filter((o) => !invoicedOrderIds.has(o.id))
      .map((o) =>
        ventaFromGross({
          fecha: dateToIso(o.createdAt),
          tipo: "Ticket / mostrador",
          numero: `P-${o.code}`,
          cliente: o.customerName,
          total: o.total,
        }),
      ),
    ...payments
      .filter((p) => !invoicedApptIds.has(p.appointmentId))
      .map((p) =>
        ventaFromGross({
          fecha: dateToIso(p.createdAt),
          tipo: "Ticket / servicio",
          numero: p.comprobanteNro?.trim() || "—",
          cliente: p.appointment?.client?.name ?? "Consumidor final",
          total: p.amount,
        }),
      ),
  ];

  const compras: CompraRow[] = purchases.map((c) => {
    const { cuit, oc } = parseFormalNotes(c.notes);
    return compraFromPurchase({
      fecha: dateToIso(c.createdAt),
      proveedor: c.supplier,
      cuit,
      numero: oc ?? `C-${c.code}`,
      total: c.totalCost,
    });
  });

  return {
    libro: buildLibroIva(ventas, compras),
    desde: dateToIso(desde),
    hasta: dateToIso(hasta),
    rangeDays,
  };
}
