/**
 * Facturación a partir de una Orden (ADR-024 / ADR-020 §6.a). Núcleo del Core
 * que factura un pedido de retail — el gemelo de `invoice-from-appointment.ts`
 * para el vertical Orden/POS. Lo dispara la ingesta de pedidos: hoy la API de
 * front externo (superficie II de ADR-020), mañana también el POS/vidriera.
 *
 * Todo detrás del flag `isInvoicingEnabled()` en los llamadores: este módulo
 * asume que ya se decidió facturar. El Core arma la factura (concepto Productos);
 * el plugin ARCA solo integra.
 */

import { prisma } from "@/lib/prisma";
import { createInvoice } from "@/lib/invoice-core";
import { calcularImpuestos, getFiscalProfile } from "@/lib/fiscal";
import { processArcaOutbox } from "@/lib/arca-dispatch";

// Códigos de catálogo ARCA (ver src/plugins/arca/domain/catalogos.ts).
const CONCEPTO_PRODUCTOS = 1;
const DOC_CONSUMIDOR_FINAL = 99;

/** Fecha de hoy en formato ARCA `AAAAMMDD` (zona horaria del server). */
function fechaHoy(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

/**
 * Crea la factura de una orden y la despacha al plugin ARCA (tick del simulador).
 * Devuelve el `invoiceId`, o `null` si la orden no se pudo facturar (no existe,
 * otro tenant, o total no positivo). NO lanza por fallas de facturación: el
 * llamador decide si es best-effort (intake del pedido) o reintentable.
 *
 * Concepto PRODUCTOS: a diferencia del turno (Servicios), un pedido de retail no
 * lleva fechas de servicio. El receptor es Consumidor Final mientras la Orden no
 * capture CUIT/DNI del comprador (mismo criterio que el turno, ADR-024).
 */
export async function facturarOrden(
  orderId: string,
  tenantId: string,
): Promise<string | null> {
  const order = await prisma.order.findFirst({
    where: { id: orderId, tenantId },
    select: { total: true },
  });
  if (!order) return null;

  const monto = order.total;
  if (!(monto > 0)) return null;

  const perfil = getFiscalProfile(tenantId);
  const { neto, iva, total } = calcularImpuestos(perfil.condicionIva, monto);
  const fecha = fechaHoy();

  const invoiceId = await createInvoice({
    tenantId,
    concepto: CONCEPTO_PRODUCTOS,
    fecha,
    emisor: {
      cuit: perfil.cuit,
      condicionIva: perfil.condicionIva,
      puntoVenta: perfil.puntoVenta,
    },
    // La Orden no captura CUIT/DNI del comprador todavía → Consumidor Final.
    receptor: { docTipo: DOC_CONSUMIDOR_FINAL, docNro: 0, condicionIva: "CONSUMIDOR_FINAL" },
    neto,
    iva,
    total,
    // Concepto Productos no exige fechas de servicio; sí vencimiento de pago.
    vencimientoPago: fecha,
  });

  // Tick del simulador: en prod esto lo hace un worker periódico (ADR-002/024).
  await processArcaOutbox();

  return invoiceId;
}
