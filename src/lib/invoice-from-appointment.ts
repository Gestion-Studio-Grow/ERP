/**
 * Facturación a partir de un turno (ADR-024). Núcleo compartido por los dos
 * disparadores: completar servicio (`completeAppointment`) y pago acreditado por
 * Mercado Pago (plugin MP). El Core arma la factura; los plugins solo disparan.
 *
 * Todo detrás del flag `isInvoicingEnabled()` en los llamadores: este módulo
 * asume que ya se decidió facturar.
 *
 * R1 · UNA FACTURA POR COBRO (src/lib/facturacion/cobros-facturados.ts). Los dos caminos del
 * turno —el aviso de MP de un pago del turno (`mp:<pago>`) y «Completar» (`turno:<turno>`)— usan
 * claves distintas, así que el índice único no los arbitra entre sí: cada uno corre en UNA
 * transacción que primero TOMA EL TURNO (`FOR UPDATE`), y recién ahí lee lo facturado y factura
 * (Auditoría GSG, I-1). El segundo en llegar ve lo que dejó el primero.
 */

import { prisma } from "@/lib/prisma";
import { createInvoice, type CreateInvoiceInput, type InvoiceTx } from "@/lib/invoice-core";
import { calcularImpuestos, getFiscalProfile } from "@/lib/fiscal";
import { procesarEnviosDelNegocio } from "@/lib/arca-dispatch";
import { decidirFacturacion } from "@/lib/invoice-idempotency";
import { fechaFiscalDelDia } from "@/lib/libros/fecha-fiscal";
import { centavosDe } from "@/lib/dinero/redondeo";
import {
  claveCobroMP,
  claveCobroTurno,
  cobradoPorMPDelLibroInTx,
  cobrosYaFacturadosInTx,
  enLaTransaccionDelCobro,
  facturadoDelTurnoInTx,
  facturarCobrosInTx,
  pendienteDelTurno,
  tomarTurnoInTx,
  vincularCobroInTx,
} from "@/lib/facturacion/cobros-facturados";
import { facturarPagoMPInTx } from "@/lib/invoice-from-mp";
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
   * R1 · `true` = el camino real: una transacción con el turno tomado, lo facturado por MP
   * restado y el cobro anotado (`turno:<turno>`). Sin él (tests viejos sin base), el camino de
   * siempre con `leerTurno`/`createInvoice`/`marcarPago`.
   */
  porCobros?: boolean;
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
  porCobros: true,
};

type Perfil = Awaited<ReturnType<typeof getFiscalProfile>>;

/** El comprobante del turno por `monto` (Servicios, consumidor final, con las fechas del día). */
function comprobanteDelTurno(
  appointmentId: string,
  tenantId: string,
  perfil: Perfil,
  monto: number,
  cobradoDelTurno: number | null,
): CreateInvoiceInput {
  const { neto, iva, total } = calcularImpuestos(perfil.condicionIva, monto);
  // El día del NEGOCIO, no el del servidor (ver libros/fecha-fiscal.ts): un turno cobrado
  // a las 22 del último día del mes es de ese mes, también para el comprobante.
  const fecha = fechaFiscalDelDia();
  return {
    tenantId,
    concepto: CONCEPTO_SERVICIOS,
    fecha,
    emisor: { cuit: perfil.cuit, condicionIva: perfil.condicionIva, puntoVenta: perfil.puntoVenta },
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
    // guarda $0 de `decidirFacturacion` (Payment.comprobanteNro).
    origin: { type: "APPOINTMENT", id: appointmentId },
    // ENG-023 compara el cobro del turno contra lo que se leyó, no contra el resto facturado.
    ...(cobradoDelTurno != null ? { cobroDelTurno: cobradoDelTurno } : {}),
  };
}

/**
 * Crea la factura del turno y la despacha al plugin ARCA (tick del simulador).
 * Devuelve el `invoiceId`, o `null` si el turno no se pudo facturar (ej. sin
 * monto). LANZA `CobroDelTurnoCambioError` si el cobro del turno se anuló (entero o en parte)
 * mientras se facturaba (ENG-023). El llamador decide si eso es best-effort (completar turno,
 * que lo registra en el log) o reintentable.
 *
 * R1 · factura lo cobrado MENOS lo que Mercado Pago ya facturó por pagos de este turno (la seña
 * por link), con el turno tomado durante toda la cuenta (I-1).
 */
export async function facturarAppointment(
  appointmentId: string,
  tenantId: string,
  deps: DepsFacturarTurno = DEPS,
): Promise<string | null> {
  if (!deps.porCobros) return facturarAppointmentSinBase(appointmentId, tenantId, deps);

  const perfil = await deps.getFiscalProfile(tenantId);
  const invoiceId = await enLaTransaccionDelCobro(tenantId, async (tx) => {
    if (!(await tomarTurnoInTx(tx, tenantId, appointmentId))) return null;
    const turno = await tx.appointment.findFirst({
      where: { id: appointmentId, tenantId },
      select: {
        priceAtBooking: true,
        service: { select: { price: true } },
        payment: { select: { id: true, amount: true, status: true, comprobanteNro: true } },
      },
    });
    if (!turno) return null;

    // Idempotencia (hardening $0): si el pago del turno ya tiene comprobante, es ése.
    const decision = decidirFacturacion(turno.payment);
    if (decision.accion === "reusar") return decision.comprobante;

    const cobradoDelTurno = turno.payment?.amount ?? null;
    const [cobradoPorMP, facturado] = [
      await cobradoPorMPDelLibroInTx(tx, tenantId, appointmentId),
      await facturadoDelTurnoInTx(tx, tenantId, appointmentId),
    ];
    const { pendiente } = pendienteDelTurno({
      cobrado: cobradoDelTurno,
      precio: turno.priceAtBooking ?? turno.service.price,
      cobradoPorMP,
      facturadoPorMP: facturado.facturadoPorMP,
    });
    // Todo lo cobrado ya está facturado (por MP): no hay otra factura; la del turno es ésa.
    if (!(pendiente > 0)) return facturado.facturadoPorMP > 0 ? facturado.ultimaFactura : null;

    const comprobante = comprobanteDelTurno(appointmentId, tenantId, perfil, pendiente, cobradoDelTurno);
    const id = await facturarCobrosInTx(tx, comprobante, [
      { clave: claveCobroTurno(appointmentId), importe: comprobante.total, appointmentId },
    ]);
    // Marca durable de idempotencia en el `Payment` del turno, en la MISMA transacción.
    if (turno.payment) {
      await tx.payment.updateMany({
        where: { id: turno.payment.id, tenantId },
        data: { status: "APPROVED", comprobanteNro: id },
      });
    }
    return id;
  });

  // Tick del simulador: en prod esto lo hace un worker periódico (ADR-002/024).
  if (invoiceId) await deps.procesarEnviosDelNegocio(tenantId);
  return invoiceId;
}

/** El camino de siempre, sin base (lo ejecutan los tests de la fecha y la idempotencia $0). */
async function facturarAppointmentSinBase(
  appointmentId: string,
  tenantId: string,
  deps: DepsFacturarTurno,
): Promise<string | null> {
  const appointment = await deps.leerTurno(appointmentId, tenantId);
  if (!appointment) return null;
  const decision = decidirFacturacion(appointment.payment);
  if (decision.accion === "reusar") return decision.comprobante;
  const monto = appointment.payment?.amount ?? appointment.priceAtBooking ?? appointment.service.price;
  if (!(monto > 0)) return null;
  const perfil = await deps.getFiscalProfile(tenantId);
  const invoiceId = await deps.createInvoice(comprobanteDelTurno(appointmentId, tenantId, perfil, monto, null));
  if (appointment.payment) await deps.marcarPago(appointment.payment.id, invoiceId);
  await deps.procesarEnviosDelNegocio(tenantId);
  return invoiceId;
}

/**
 * R1 · ¿Este pago de MP ya está ADENTRO de la factura del turno? Sólo si el libro del turno tiene
 * cobrado por MP lo suficiente para cubrir todo lo de MP ya anotado del turno más este pago
 * (Auditoría GSG, I-2): una seña que la recepción NO anotó no está en la factura del turno (que
 * factura lo cobrado en el libro) y se tiene que facturar por su lado. PURA.
 */
export function pagoCubiertoPorLaFacturaDelTurno(x: { cobradoPorMPDelLibro: number; yaAnotadoPorMP: number; pago: number }): boolean {
  return centavosDe(x.cobradoPorMPDelLibro) >= centavosDe(x.yaAnotadoPorMP) + centavosDe(x.pago);
}

/**
 * R1 · El aviso de Mercado Pago de un pago atado a un turno (`external_reference` = turno): se
 * factura ESE pago (la seña), como un cobro `mp:<pago>` del turno, no el turno entero.
 *
 * Con el turno TOMADO (I-1):
 *   · si el pago ya está anotado (aviso repetido), es esa factura;
 *   · si el turno ya tiene su factura y el pago está ADENTRO de lo que facturó (el libro lo tiene
 *     cobrado por MP, I-2), queda anotado contra esa factura sin emitir otra;
 *   · si no, se factura el pago por su lado.
 */
export async function facturarCobroMPDelTurno(
  appointmentId: string,
  tenantId: string,
  pago: PagoMP,
  deps: { getFiscalProfile: typeof getFiscalProfile; procesarEnviosDelNegocio: typeof procesarEnviosDelNegocio } = {
    getFiscalProfile,
    procesarEnviosDelNegocio,
  },
): Promise<string | null> {
  if (pago.estado !== "approved" || !(pago.monto > 0)) return null;
  const perfil = await deps.getFiscalProfile(tenantId);
  const resultado = await enLaTransaccionDelCobro(tenantId, async (tx: InvoiceTx) => {
    const hayTurno = await tomarTurnoInTx(tx, tenantId, appointmentId);
    const cobro = { clave: claveCobroMP(pago.id), importe: pago.monto, appointmentId: hayTurno ? appointmentId : null };
    const [vivo] = await cobrosYaFacturadosInTx(tx, tenantId, [cobro.clave]);
    if (vivo) return { invoiceId: vivo.invoiceId, nueva: false };
    if (hayTurno) {
      const delTurno = await tx.invoice.findFirst({
        where: { tenantId, appointmentId, status: { not: "REJECTED" } },
        select: { id: true },
      });
      if (delTurno) {
        const cubierto = pagoCubiertoPorLaFacturaDelTurno({
          cobradoPorMPDelLibro: await cobradoPorMPDelLibroInTx(tx, tenantId, appointmentId),
          yaAnotadoPorMP: (await facturadoDelTurnoInTx(tx, tenantId, appointmentId)).facturadoPorMP,
          pago: pago.monto,
        });
        if (cubierto) return { invoiceId: await vincularCobroInTx(tx, tenantId, cobro, delTurno.id), nueva: false };
      }
    }
    return { invoiceId: await facturarPagoMPInTx(tx, pago, tenantId, perfil, { appointmentId: cobro.appointmentId }), nueva: true };
  });
  if (resultado.nueva) await deps.procesarEnviosDelNegocio(tenantId);
  return resultado.invoiceId;
}
