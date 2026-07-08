/**
 * Facturación a partir de un turno (ADR-024). Núcleo compartido por los dos
 * disparadores: completar servicio (`completeAppointment`) y pago acreditado por
 * Mercado Pago (plugin MP). El Core arma la factura; los plugins solo disparan.
 *
 * Todo detrás del flag `isInvoicingEnabled()` en los llamadores: este módulo
 * asume que ya se decidió facturar.
 */

import { prisma } from "@/lib/prisma";
import { createInvoice } from "@/lib/invoice-core";
import { calcularImpuestos, getFiscalProfile } from "@/lib/fiscal";
import { processArcaOutbox } from "@/lib/arca-dispatch";
import { decidirFacturacion } from "@/lib/invoice-idempotency";

// Códigos de catálogo ARCA (ver src/plugins/arca/domain/catalogos.ts).
const CONCEPTO_SERVICIOS = 2;
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
 * Crea la factura del turno y la despacha al plugin ARCA (tick del simulador).
 * Devuelve el `invoiceId`, o `null` si el turno no se pudo facturar (ej. sin
 * monto). NO lanza por fallas de facturación: es responsabilidad del llamador
 * decidir si eso es best-effort (completar turno) o reintentable (webhook MP).
 */
export async function facturarAppointment(
  appointmentId: string,
  tenantId: string,
): Promise<string | null> {
  const appointment = await prisma.appointment.findFirst({
    where: { id: appointmentId, tenantId },
    include: { service: true, payment: true },
  });
  if (!appointment) return null;

  // Idempotencia (hardening $0, sin migración): si el pago del turno ya tiene
  // comprobante, un webhook MP duplicado devuelve el MISMO comprobante sin crear
  // otra factura. La decisión pura está en `decidirFacturacion` (testeada).
  const decision = decidirFacturacion(appointment.payment);
  if (decision.accion === "reusar") return decision.comprobante;

  const monto =
    appointment.payment?.amount ??
    appointment.priceAtBooking ??
    appointment.service.price;
  if (!(monto > 0)) return null;

  const perfil = getFiscalProfile(tenantId);
  const { neto, iva, total } = calcularImpuestos(perfil.condicionIva, monto);
  const fecha = fechaHoy();

  const invoiceId = await createInvoice({
    tenantId,
    concepto: CONCEPTO_SERVICIOS,
    fecha,
    emisor: {
      cuit: perfil.cuit,
      condicionIva: perfil.condicionIva,
      puntoVenta: perfil.puntoVenta,
    },
    // El modelo Client no captura CUIT/DNI todavía → Consumidor Final (ADR-024).
    receptor: { docTipo: DOC_CONSUMIDOR_FINAL, docNro: 0, condicionIva: "CONSUMIDOR_FINAL" },
    neto,
    iva,
    total,
    // Concepto Servicios exige fechas de servicio (validación del plugin).
    servicioDesde: fecha,
    servicioHasta: fecha,
    vencimientoPago: fecha,
  });

  // Marca durable de idempotencia: deja el comprobante en el `Payment` del turno
  // (unique por `appointmentId`) → un webhook MP duplicado cae en `reusar` arriba y
  // no vuelve a facturar. Reusa columnas existentes (cero migración).
  if (appointment.payment) {
    await prisma.payment.update({
      where: { id: appointment.payment.id },
      data: { status: "APPROVED", comprobanteNro: invoiceId },
    });
  }

  // Tick del simulador: en prod esto lo hace un worker periódico (ADR-002/024).
  await processArcaOutbox();

  return invoiceId;
}
