/**
 * Facturación directa de un pago de Mercado Pago (ADR-025) — camino STANDALONE:
 * una venta MP no es un turno del ERP, se factura como venta directa. Es el
 * comando `facturarPagoMP` que la ingesta (webhook + backfill) invoca por cada
 * pago acreditado. Reusa el cálculo fiscal del Core (ADR-006).
 *
 * Gateado en el llamador por `isInvoicingEnabled()` (la migración de Invoice no
 * está aplicada). El Core es dueño del impuesto; el plugin MP solo detecta.
 */

import { createInvoice } from "@/lib/invoice-core";
import { calcularImpuestos, getFiscalProfile } from "@/lib/fiscal";
import { processArcaOutbox } from "@/lib/arca-dispatch";
import type { PagoMP } from "@/plugins/mercadopago";

// Códigos de catálogo ARCA (ver src/plugins/arca/domain/catalogos.ts).
const CONCEPTO_PRODUCTOS = 1; // venta de productos/servicios sueltos, sin fechas de servicio
const DOC_CONSUMIDOR_FINAL = 99;

function fechaHoy(): string {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Crea la Factura C de un pago MP y la despacha al plugin ARCA (tick del
 * simulador). Devuelve el `invoiceId`, o `null` si el pago no es facturable.
 */
export async function facturarPagoMP(
  pago: PagoMP,
  tenantId: string,
): Promise<string | null> {
  if (pago.estado !== "approved" || !(pago.monto > 0)) return null;

  const perfil = getFiscalProfile(tenantId);
  const { neto, iva, total } = calcularImpuestos(perfil.condicionIva, pago.monto);
  const fecha = pago.fechaAcreditacion ?? fechaHoy();

  const invoiceId = await createInvoice({
    tenantId,
    concepto: CONCEPTO_PRODUCTOS,
    fecha,
    emisor: { cuit: perfil.cuit, condicionIva: perfil.condicionIva, puntoVenta: perfil.puntoVenta },
    // Venta MP a consumidor final (el pagador no está identificado con CUIT).
    receptor: { docTipo: DOC_CONSUMIDOR_FINAL, docNro: 0, condicionIva: "CONSUMIDOR_FINAL" },
    neto,
    iva,
    total,
    // A-6 — IDEMPOTENCIA por pago: la clave es el `payment_id` del gateway. Un webhook MP
    // duplicado (MP reintenta las notificaciones) vuelve a llamar acá con el mismo `pago.id` →
    // `createInvoice` encuentra la factura ya creada (o el @@unique la frena) y devuelve la
    // MISMA, en vez de emitir una segunda factura por el mismo cobro. Antes iba SIN origin →
    // el dedupe estaba deshabilitado y cada reintento facturaba de nuevo.
    origin: { type: "MP_PAYMENT", id: pago.id },
  });

  await processArcaOutbox();
  return invoiceId;
}
