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
import { procesarEnviosDelNegocio } from "@/lib/arca-dispatch";
import { decidirFacturacion } from "@/lib/invoice-idempotency";
import { fechaFiscalDelDia } from "@/lib/libros/fecha-fiscal";
import { tenantTransaction } from "@/lib/rls";
import { claseDeCobro } from "@/lib/turnos/anulacion";
import {
  claveCobroMP,
  claveCobroTurno,
  facturadoDelTurnoInTx,
  facturarCobros,
  pendienteDelTurno,
  vincularCobro,
} from "@/lib/facturacion/cobros-facturados";
import { facturarPagoMP } from "@/lib/invoice-from-mp";
import type { PagoMP } from "@/plugins/mercadopago";

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
  procesarEnviosDelNegocio: typeof procesarEnviosDelNegocio;
  /**
   * R1 · Lo que el libro del turno cobró por Mercado Pago y lo que MP ya facturó por pagos de
   * este turno. Opcional: sin él (tests viejos), nada facturado por MP.
   */
  leerCobrosDelTurno?: (appointmentId: string, tenantId: string) => Promise<CobrosDelTurno>;
  /** R1 · Factura anotando el cobro (`CobroFacturado`). Opcional: sin él, `createInvoice`. */
  facturarCobros?: typeof facturarCobros;
}

/** Lo que el turno ya cobró por Mercado Pago y lo que MP ya facturó de él (R1). */
export interface CobrosDelTurno {
  cobradoPorMP: number;
  facturadoPorMP: number;
  /** La factura viva más reciente que cubre cobros de este turno. */
  ultimaFactura: string | null;
}

/** Lectura real, parada en el negocio: cobros del libro con medio MP (sin condonaciones) y lo facturado por MP. */
async function leerCobrosDelTurnoPrisma(appointmentId: string, tenantId: string): Promise<CobrosDelTurno> {
  return tenantTransaction(
    async (tx) => {
      const filas = await tx.collection.findMany({
        where: { tenantId, originType: "APPOINTMENT", originId: appointmentId, method: "MERCADOPAGO" },
        select: { amount: true, note: true },
      });
      // Las contrapartidas de anulación son negativas y conservan el medio: suman bien. La
      // condonación no es plata que entró: no cuenta.
      const cobradoPorMP = filas
        .filter((f) => claseDeCobro(f.note) !== "condonacion")
        .reduce((a, f) => a + f.amount.toNumber(), 0);
      const { facturadoPorMP, ultimaFactura } = await facturadoDelTurnoInTx(tx, tenantId, appointmentId);
      return { cobradoPorMP, facturadoPorMP, ultimaFactura };
    },
    { tenantId },
  );
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
  procesarEnviosDelNegocio,
  leerCobrosDelTurno: leerCobrosDelTurnoPrisma,
  facturarCobros,
};

/**
 * Crea la factura del turno y la despacha al plugin ARCA (tick del simulador).
 * Devuelve el `invoiceId`, o `null` si el turno no se pudo facturar (ej. sin
 * monto). LANZA `CobroDelTurnoCambioError` si el cobro del turno se anuló (entero o en parte)
 * mientras se facturaba (ENG-023): el monto se lee acá, fuera de la transacción, y
 * `createInvoiceInTx` lo vuelve a comparar con la fila del turno tomada. El llamador decide si
 * eso es best-effort (completar turno, que lo registra en el log) o reintentable.
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

  // R1 · UNA FACTURA POR COBRO: lo que Mercado Pago ya facturó por pagos de este turno (la
  // seña por link) no se vuelve a facturar al completarlo. Se factura el RESTO.
  const cobradoDelTurno = appointment.payment?.amount ?? null;
  const precio = appointment.priceAtBooking ?? appointment.service.price;
  const yaMP: CobrosDelTurno = deps.leerCobrosDelTurno
    ? await deps.leerCobrosDelTurno(appointmentId, tenantId)
    : { cobradoPorMP: 0, facturadoPorMP: 0, ultimaFactura: null };
  const { pendiente: monto } = pendienteDelTurno({
    cobrado: cobradoDelTurno,
    precio,
    cobradoPorMP: yaMP.cobradoPorMP,
    facturadoPorMP: yaMP.facturadoPorMP,
  });
  // Todo lo cobrado ya está facturado (por MP): no hay otra factura; la del turno es ésa.
  if (!(monto > 0)) return yaMP.facturadoPorMP > 0 ? yaMP.ultimaFactura : null;

  const perfil = await deps.getFiscalProfile(tenantId);
  const { neto, iva, total } = calcularImpuestos(perfil.condicionIva, monto);
  // El día del NEGOCIO, no el del servidor (ver libros/fecha-fiscal.ts): un turno cobrado
  // a las 22 del último día del mes es de ese mes, también para el comprobante.
  const fecha = fechaFiscalDelDia();

  const comprobante = {
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
    origin: { type: "APPOINTMENT" as const, id: appointmentId },
    // ENG-023 compara el cobro del turno contra lo que se leyó, no contra el resto facturado.
    ...(cobradoDelTurno != null ? { cobroDelTurno: cobradoDelTurno } : {}),
  };
  const invoiceId = deps.facturarCobros
    ? await deps.facturarCobros(comprobante, [{ clave: claveCobroTurno(appointmentId), importe: total, appointmentId }])
    : await deps.createInvoice(comprobante);

  // Marca durable de idempotencia: deja el comprobante en el `Payment` del turno
  // (unique por `appointmentId`) → un webhook MP duplicado cae en `reusar` arriba y
  // no vuelve a facturar. Reusa columnas existentes (cero migración).
  if (appointment.payment) {
    await deps.marcarPago(appointment.payment.id, invoiceId);
  }

  // Tick del simulador: en prod esto lo hace un worker periódico (ADR-002/024).
  await deps.procesarEnviosDelNegocio(tenantId);

  return invoiceId;
}

/**
 * R1 · El aviso de Mercado Pago de un pago atado a un turno (`external_reference` = turno): se
 * factura ESE pago (la seña), como un cobro `mp:<pago>` del turno, no el turno entero. Antes
 * corría `facturarAppointment`, que facturaba el precio o lo cobrado hasta ahí con el origen del
 * turno, y el resto del turno no se facturaba nunca (o se facturaba dos veces la seña).
 *
 * Si el turno ya tiene su factura (se completó antes de que llegara el aviso), ese pago ya está
 * adentro de lo cobrado del turno: no se emite otra; el pago queda anotado contra esa factura
 * (así el extracto lo reconoce por la referencia del pago).
 */
export async function facturarCobroMPDelTurno(
  appointmentId: string,
  tenantId: string,
  pago: PagoMP,
  deps: { facturarPagoMP: typeof facturarPagoMP; vincularCobro: typeof vincularCobro } = { facturarPagoMP, vincularCobro },
): Promise<string | null> {
  if (pago.estado !== "approved" || !(pago.monto > 0)) return null;
  const delTurno = await tenantTransaction(
    (tx) =>
      tx.invoice.findFirst({
        where: { tenantId, appointmentId, status: { not: "REJECTED" } },
        select: { id: true },
      }),
    { tenantId },
  );
  if (delTurno) {
    return deps.vincularCobro(tenantId, { clave: claveCobroMP(pago.id), importe: pago.monto, appointmentId }, delTurno.id);
  }
  return deps.facturarPagoMP(pago, tenantId, undefined, { appointmentId });
}
