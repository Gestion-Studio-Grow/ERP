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
import { fechaFiscalDelDia } from "@/lib/libros/fecha-fiscal";

// Códigos de catálogo ARCA (ver src/plugins/arca/domain/catalogos.ts).
const CONCEPTO_PRODUCTOS = 1;
const DOC_CONSUMIDOR_FINAL = 99;

/**
 * Lo que el facturador usa de afuera. Es un parámetro (con los reales por defecto) para que
 * el test lo EJECUTE con el reloj fijo y sin base: la fecha del comprobante es la del día del
 * negocio, y eso se prueba corriendo `facturarOrden`, no sólo la función de la fecha.
 */
export interface DepsFacturarOrden {
  leerOrden: (orderId: string, tenantId: string) => Promise<{ total: number } | null>;
  getFiscalProfile: typeof getFiscalProfile;
  createInvoice: typeof createInvoice;
  processArcaOutbox: typeof processArcaOutbox;
}

const DEPS: DepsFacturarOrden = {
  leerOrden: (orderId, tenantId) =>
    prisma.order.findFirst({ where: { id: orderId, tenantId }, select: { total: true } }),
  getFiscalProfile,
  createInvoice,
  processArcaOutbox,
};

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
  deps: DepsFacturarOrden = DEPS,
): Promise<string | null> {
  const order = await deps.leerOrden(orderId, tenantId);
  if (!order) return null;

  const monto = order.total;
  if (!(monto > 0)) return null;

  const perfil = await deps.getFiscalProfile(tenantId);
  const { neto, iva, total } = calcularImpuestos(perfil.condicionIva, monto);
  // El día del NEGOCIO, no el del servidor: facturado el 31/08 a las 23:30 argentinas es
  // del 31/08 (en UTC ya es 1/09, y la venta caía en el período fiscal siguiente).
  const fecha = fechaFiscalDelDia();

  const invoiceId = await deps.createInvoice({
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
    // I2 (ADR-064): enlace a la venta = idempotencia por pedido. Un reintento de facturación
    // del MISMO pedido devuelve el comprobante ya emitido, no crea un duplicado.
    origin: { type: "ORDER", id: orderId },
  });

  // Tick del simulador: en prod esto lo hace un worker periódico (ADR-002/024).
  await deps.processArcaOutbox();

  return invoiceId;
}
