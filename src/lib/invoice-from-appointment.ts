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
  facturarCobrosInTx,
  pendienteDelTurno,
  vincularCobro,
} from "@/lib/facturacion/cobros-facturados";
import { facturarPagoMP } from "@/lib/invoice-from-mp";
import { Prisma } from "@/generated/prisma/client";
import type { CreateInvoiceInput, InvoiceTx } from "@/lib/invoice-core";
import { bloquearTurnoInTx, facturaDeCobroParaPagoMP, facturarCobrosDelTurno, type ResultadoPorCobro } from "@/lib/facturacion/factura-por-cobro";
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
  /**
   * Opción B de CH (06/11/2026) · una factura por cada cobro del libro del turno. Opcional: sin él
   * (tests viejos), el camino de antes (una factura por turno al completarlo).
   */
  facturarPorCobro?: (appointmentId: string, tenantId: string) => Promise<ResultadoPorCobro>;
  /**
   * Re-certificación del PR #38 (doble factura): lee lo facturado por MP y factura el resto en UNA
   * transacción, con el candado común del turno (`bloquearTurnoInTx`) tomado ANTES de leer. Sin él
   * (dobles de test), `leerCobrosDelTurno` + `facturarCobros` por separado.
   */
  facturarRestoBajoCandado?: typeof facturarRestoBajoCandado;
}

/** Qué facturar con lo que el turno ya tiene facturado por MP, o `null` si no hay resto. */
type DecidirResto = (yaMP: CobrosDelTurno) => { comprobante: CreateInvoiceInput; importe: number } | null;

async function leerCobrosDelTurnoInTx(tx: InvoiceTx, tenantId: string, appointmentId: string): Promise<CobrosDelTurno> {
  const filas = await tx.collection.findMany({
    where: { tenantId, originType: "APPOINTMENT", originId: appointmentId, method: "MERCADOPAGO" },
    select: { amount: true, note: true },
  });
  // Las contrapartidas de anulación son negativas y conservan el medio: suman bien. La
  // condonación no es plata que entró: no cuenta.
  const cobradoPorMP = filas.filter((f) => claseDeCobro(f.note) !== "condonacion").reduce((a, f) => a + f.amount.toNumber(), 0);
  const { facturadoPorMP, ultimaFactura } = await facturadoDelTurnoInTx(tx, tenantId, appointmentId);
  return { cobradoPorMP, facturadoPorMP, ultimaFactura };
}

/**
 * El candado común del turno primero (lo toman también el aviso de MP y la factura de un cobro),
 * después la lectura de lo facturado por MP y la factura del resto, en la MISMA transacción: si el
 * aviso de MP factura la seña a la vez, uno espera al otro y relee. Un reintento si otro
 * disparador ganó la carrera por la misma clave (P2002).
 */
export async function facturarRestoBajoCandado(
  appointmentId: string,
  tenantId: string,
  decidir: DecidirResto,
): Promise<{ invoiceId: string | null; yaMP: CobrosDelTurno }> {
  const correr = () =>
    tenantTransaction(
      async (tx) => {
        if (!(await bloquearTurnoInTx(tx, tenantId, appointmentId))) {
          return { invoiceId: null, yaMP: { cobradoPorMP: 0, facturadoPorMP: 0, ultimaFactura: null } };
        }
        const yaMP = await leerCobrosDelTurnoInTx(tx, tenantId, appointmentId);
        const d = decidir(yaMP);
        if (!d) return { invoiceId: null, yaMP };
        const invoiceId = await facturarCobrosInTx(tx, d.comprobante, [{ clave: claveCobroTurno(appointmentId), importe: d.importe, appointmentId }]);
        return { invoiceId, yaMP };
      },
      { tenantId },
    );
  try {
    return await correr();
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return correr();
    throw e;
  }
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
  return tenantTransaction((tx) => leerCobrosDelTurnoInTx(tx, tenantId, appointmentId), { tenantId });
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
  facturarPorCobro: (appointmentId, tenantId) => facturarCobrosDelTurno(appointmentId, tenantId),
  facturarRestoBajoCandado,
};

export interface OpcionesFacturarTurno {
  /**
   * Disparo después de UN cobro (seña, cobro parcial, saldo): sólo se facturan cobros del libro.
   * Un turno sin libro no se factura por el precio (sin plata cobrada no hay factura).
   */
  soloCobros?: boolean;
}

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
  opciones: OpcionesFacturarTurno = {},
): Promise<string | null> {
  const appointment = await deps.leerTurno(appointmentId, tenantId);
  if (!appointment) return null;

  // Idempotencia (hardening $0, sin migración): si el pago del turno ya tiene
  // comprobante, un webhook MP duplicado devuelve el MISMO comprobante sin crear
  // otra factura. La decisión pura está en `decidirFacturacion` (testeada).
  // Con la opción B nunca se escribe `comprobanteNro`: esto sólo agarra turnos facturados antes.
  const decision = decidirFacturacion(appointment.payment);
  if (decision.accion === "reusar") return decision.comprobante;

  // Opción B (CH, 06/11/2026): cada cobro del libro, su factura. Un turno ya facturado por el camino
  // de antes (`legado`) sigue por abajo, donde `createInvoice` devuelve su misma factura.
  if (deps.facturarPorCobro) {
    const porCobro = await deps.facturarPorCobro(appointmentId, tenantId);
    if (porCobro.modo === "por-cobro") {
      if (porCobro.nuevas.length > 0) await deps.procesarEnviosDelNegocio(tenantId);
      return porCobro.ultima;
    }
    if (porCobro.modo === "legado") return porCobro.factura;
  }
  if (opciones.soloCobros) return null;

  // R1 · UNA FACTURA POR COBRO: lo que Mercado Pago ya facturó por pagos de este turno (la
  // seña por link) no se vuelve a facturar al completarlo. Se factura el RESTO.
  const cobradoDelTurno = appointment.payment?.amount ?? null;
  const precio = appointment.priceAtBooking ?? appointment.service.price;
  // El perfil se lee FUERA de la transacción del candado (no ocupa otra conexión mientras espera);
  // si está incompleto, el error sale sólo si hay algo que facturar (como antes).
  const perfilLeido = await deps.getFiscalProfile(tenantId).then(
    (perfil) => ({ perfil }),
    (error: unknown) => ({ error }),
  );
  const decidir: DecidirResto = (yaMP) => {
    const { pendiente: monto } = pendienteDelTurno({
      cobrado: cobradoDelTurno,
      precio,
      cobradoPorMP: yaMP.cobradoPorMP,
      facturadoPorMP: yaMP.facturadoPorMP,
    });
    if (!(monto > 0)) return null;
    if ("error" in perfilLeido) throw perfilLeido.error;
    const { perfil } = perfilLeido;
    const { neto, iva, total } = calcularImpuestos(perfil.condicionIva, monto);
    // El día del NEGOCIO, no el del servidor (ver libros/fecha-fiscal.ts): un turno cobrado
    // a las 22 del último día del mes es de ese mes, también para el comprobante.
    const fecha = fechaFiscalDelDia();
    const comprobante: CreateInvoiceInput = {
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
    return { comprobante, importe: total };
  };

  let invoiceId: string;
  if (deps.facturarRestoBajoCandado) {
    // Lectura de lo facturado por MP y factura del resto bajo el candado común del turno.
    const r = await deps.facturarRestoBajoCandado(appointmentId, tenantId, decidir);
    // Todo lo cobrado ya está facturado (por MP): no hay otra factura; la del turno es ésa.
    if (!r.invoiceId) return r.yaMP.facturadoPorMP > 0 ? r.yaMP.ultimaFactura : null;
    invoiceId = r.invoiceId;
  } else {
    const yaMP: CobrosDelTurno = deps.leerCobrosDelTurno
      ? await deps.leerCobrosDelTurno(appointmentId, tenantId)
      : { cobradoPorMP: 0, facturadoPorMP: 0, ultimaFactura: null };
    const d = decidir(yaMP);
    if (!d) return yaMP.facturadoPorMP > 0 ? yaMP.ultimaFactura : null;
    invoiceId = deps.facturarCobros
      ? await deps.facturarCobros(d.comprobante, [{ clave: claveCobroTurno(appointmentId), importe: d.importe, appointmentId }])
      : await deps.createInvoice(d.comprobante);
  }

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
  deps: {
    facturarPagoMP: typeof facturarPagoMP;
    vincularCobro: typeof vincularCobro;
    facturaDeCobroParaPagoMP?: typeof facturaDeCobroParaPagoMP;
  } = { facturarPagoMP, vincularCobro, facturaDeCobroParaPagoMP },
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
  // Opción B: la recepción ya anotó ese pago en el libro y su cobro ya tiene factura → se ata a ella.
  const delCobro = await (deps.facturaDeCobroParaPagoMP ?? facturaDeCobroParaPagoMP)(tenantId, appointmentId, pago.monto);
  if (delCobro) {
    return deps.vincularCobro(tenantId, { clave: claveCobroMP(pago.id), importe: pago.monto, appointmentId }, delCobro);
  }
  return deps.facturarPagoMP(pago, tenantId, undefined, { appointmentId });
}
