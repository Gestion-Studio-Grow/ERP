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
import { fechaFiscalDelDia } from "@/lib/libros/fecha-fiscal";

// Códigos de catálogo ARCA (ver src/plugins/arca/domain/catalogos.ts).
const CONCEPTO_SERVICIOS = 2;
const DOC_CONSUMIDOR_FINAL = 99;

/** El turno con lo que hace falta para facturarlo. */
type TurnoAFacturar = {
  priceAtBooking: number | null;
  service: { price: number };
  payment: { id: string; amount: number; status: string; comprobanteNro: string | null } | null;
};

/**
 * Lo que el facturador usa de afuera. Es un parámetro (con los reales por defecto) para que
 * el test lo EJECUTE con el reloj fijo y sin base: la fecha del comprobante es la del día del
 * negocio, y eso se prueba corriendo `facturarAppointment`, no sólo la función de la fecha.
 */
export interface DepsFacturarTurno {
  leerTurno: (appointmentId: string, tenantId: string) => Promise<TurnoAFacturar | null>;
  marcarPago: (paymentId: string, invoiceId: string) => Promise<unknown>;
  getFiscalProfile: typeof getFiscalProfile;
  createInvoice: typeof createInvoice;
  processArcaOutbox: typeof processArcaOutbox;
}

const DEPS: DepsFacturarTurno = {
  leerTurno: (appointmentId, tenantId) =>
    prisma.appointment.findFirst({
      where: { id: appointmentId, tenantId },
      include: { service: true, payment: true },
    }),
  marcarPago: (paymentId, invoiceId) =>
    prisma.payment.update({
      where: { id: paymentId },
      data: { status: "APPROVED", comprobanteNro: invoiceId },
    }),
  getFiscalProfile,
  createInvoice,
  processArcaOutbox,
};

/**
 * Crea la factura del turno y la despacha al plugin ARCA (tick del simulador).
 * Devuelve el `invoiceId`, o `null` si el turno no se pudo facturar (ej. sin
 * monto). NO lanza por fallas de facturación: es responsabilidad del llamador
 * decidir si eso es best-effort (completar turno) o reintentable (webhook MP).
 */
export async function facturarAppointment(
  appointmentId: string,
  tenantId: string,
  deps: DepsFacturarTurno = DEPS,
): Promise<string | null> {
  const appointment = await deps.leerTurno(appointmentId, tenantId);
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

  const perfil = await deps.getFiscalProfile(tenantId);
  const { neto, iva, total } = calcularImpuestos(perfil.condicionIva, monto);
  // El día del NEGOCIO, no el del servidor (ver libros/fecha-fiscal.ts): un turno cobrado
  // a las 22 del último día del mes es de ese mes, también para el comprobante.
  const fecha = fechaFiscalDelDia();

  const invoiceId = await deps.createInvoice({
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
    // I2 (ADR-064): enlace al turno = idempotencia DB-level por venta, complementaria a la
    // guarda $0 de `decidirFacturacion` (Payment.comprobanteNro). Un webhook MP duplicado NO
    // crea un segundo comprobante ni siquiera si escapara a la guarda del Payment.
    origin: { type: "APPOINTMENT", id: appointmentId },
  });

  // Marca durable de idempotencia: deja el comprobante en el `Payment` del turno
  // (unique por `appointmentId`) → un webhook MP duplicado cae en `reusar` arriba y
  // no vuelve a facturar. Reusa columnas existentes (cero migración).
  if (appointment.payment) {
    await deps.marcarPago(appointment.payment.id, invoiceId);
  }

  // Tick del simulador: en prod esto lo hace un worker periódico (ADR-002/024).
  await deps.processArcaOutbox();

  return invoiceId;
}
