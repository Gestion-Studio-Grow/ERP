/**
 * Capability Factura — lado Core del Plugin ARCA (ADR-020 §6.a, ADR-022).
 *
 * Estas son las funciones del Core que el borde del Plugin usa:
 *  - `createInvoice`: crea la factura y ENCOLA el evento `InvoiceCreated` en la
 *    MISMA transacción (patrón outbox, ADR-002). Es la fuente del evento
 *    (superficie III de ADR-020).
 *  - `registerFiscalDocument`: recibe el CAE del plugin y lo persiste. Es el
 *    comando público que el plugin invoca (superficie II).
 *  - `markInvoiceRejected`: registra un rechazo de ARCA.
 *
 * NO es un Server Action ("use server"): lo invoca el worker/dispatcher del
 * Core, no un formulario de cliente. El día que la UI necesite emitir una
 * factura, se expone un comando `"use server"` que llame a `createInvoice`.
 *
 * Tipos Core-propios (no importa el plugin): la dependencia va plugin→Core, no
 * al revés (ADR-002). El dispatcher hace el puente entre estos tipos y los del
 * plugin (structural typing idéntico).
 */

import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { tenantTransaction } from "@/lib/rls";
import { round2 } from "@/lib/round";
import { buildInvoiceOriginLink, type InvoiceOriginType } from "@/lib/settlement/invoice-origin";

/** Desglose de IVA por alícuota (calculado por el Core, ADR-006). */
export interface SubtotalIva {
  alicuotaId: number;
  base: number;
  importe: number;
}

/**
 * Origen (VENTA) de una factura — enlace 1:1 (D10). Es la CLAVE DE IDEMPOTENCIA por venta
 * (I2, ADR-064): una factura por Order/Appointment, un reintento devuelve la misma. El
 * traductor origen→FK es el helper puro `buildInvoiceOriginLink` (settlement/invoice-origin),
 * la MISMA fuente que usa el settlement — no se duplica la lógica.
 */
export type InvoiceOrigin = { type: InvoiceOriginType; id: string };

/** Datos que se guardan en el payload del evento `InvoiceCreated`. */
export interface CreateInvoiceInput {
  tenantId: string;
  concepto: number; // 1=Productos, 2=Servicios, 3=ambos
  fecha: string; // AAAAMMDD
  emisor: { cuit: number; condicionIva: string; puntoVenta: number };
  receptor: { docTipo: number; docNro: number; condicionIva: string };
  neto: number;
  iva: SubtotalIva[];
  total: number;
  servicioDesde?: string;
  servicioHasta?: string;
  vencimientoPago?: string;
  /** Venta de la que sale la factura (I2). Si se pasa, la creación es IDEMPOTENTE por venta. */
  origin?: InvoiceOrigin;
}

/** Forma del payload del evento `InvoiceCreated` que viaja por el outbox. */
export interface InvoiceCreatedPayload extends Omit<CreateInvoiceInput, "tenantId" | "origin"> {
  invoiceId: string;
  tenantId: string;
}

/** Input del comando `registerFiscalDocument` (lo llama el plugin con el CAE). */
export interface RegisterFiscalDocumentInput {
  invoiceId: string;
  tenantId: string;
  cae: string;
  caeVencimiento: string; // AAAAMMDD
  numero: number;
  puntoVenta: number;
  tipoComprobante: number;
}

export const OUTBOX_INVOICE_CREATED = "InvoiceCreated";

/**
 * Crea una factura en estado PENDING y encola `InvoiceCreated` en la misma
 * transacción (outbox, ADR-002). Devuelve el id de la factura.
 *
 * El `tipoComprobante` NO se fija acá: lo deriva el plugin (mapeo a catálogo
 * ARCA, ADR-022) y lo escribe `registerFiscalDocument`.
 */
export async function createInvoice(input: CreateInvoiceInput): Promise<string> {
  // Enlace a la venta (D10) vía el helper puro compartido; `hasOrigin` = la creación es
  // idempotente por venta. Sin origen (MP standalone/histórico) no hay dedupe → crea siempre.
  const originLink = input.origin ? buildInvoiceOriginLink(input.origin.type, input.origin.id) : {};
  const hasOrigin = "orderId" in originLink || "appointmentId" in originLink;
  try {
    return await tenantTransaction(async (tx) => {
      // IDEMPOTENCIA POR VENTA (I2, ADR-064): si ya existe una factura para este origen,
      // devolverla — nunca DOS comprobantes para la misma venta. Sin outbox nuevo (no
      // re-despacha).
      if (hasOrigin) {
        const existing = await tx.invoice.findFirst({
          where: { tenantId: input.tenantId, ...originLink },
          select: { id: true },
        });
        if (existing) return existing.id;
      }

      const invoice = await tx.invoice.create({
        data: {
          tenantId: input.tenantId,
          ...originLink, // enlace a la venta (D10) = clave de idempotencia
          puntoVenta: input.emisor.puntoVenta,
          concepto: input.concepto,
          docTipo: input.receptor.docTipo,
          docNro: String(input.receptor.docNro),
          fecha: input.fecha,
          neto: input.neto,
          // Total de IVA = suma de las alícuotas, redondeada a 2 decimales (ADR-057): cada
          // `importe` ya viene redondeado del Core, pero la SUMA puede arrastrar deriva binaria.
          iva: round2(input.iva.reduce((s, x) => s + x.importe, 0)),
          ivaDesglose: input.iva as unknown as object, // desglose por alícuota (audit)
          total: input.total,
          status: "PENDING",
        },
        select: { id: true },
      });

      const payload: InvoiceCreatedPayload = {
        invoiceId: invoice.id,
        tenantId: input.tenantId,
        concepto: input.concepto,
        fecha: input.fecha,
        emisor: input.emisor,
        receptor: input.receptor,
        neto: input.neto,
        iva: input.iva,
        total: input.total,
        servicioDesde: input.servicioDesde,
        servicioHasta: input.servicioHasta,
        vencimientoPago: input.vencimientoPago,
      };

      await tx.outboxEvent.create({
        data: {
          tenantId: input.tenantId,
          type: OUTBOX_INVOICE_CREATED,
          payload: payload as unknown as object,
        },
      });

      return invoice.id;
    }, { tenantId: input.tenantId });
  } catch (e) {
    // CARRERA: dos createInvoice simultáneos para la MISMA venta pasan el check y ambos
    // crean → el índice único (tenantId, orderId/appointmentId) hace fallar al 2º (P2002).
    // La tx aborta; refetcheamos (query nueva) y devolvemos el ganador → idempotente igual.
    if (hasOrigin && e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const existing = await prisma.invoice.findFirst({
        where: { tenantId: input.tenantId, ...originLink },
        select: { id: true },
      });
      if (existing) return existing.id;
    }
    throw e;
  }
}

/**
 * Comando público (superficie II): el plugin pasa el CAE y el Core lo persiste.
 * Idempotente por diseño: solo autoriza facturas en PENDING (una segunda entrega
 * del mismo evento no vuelve a escribir). Scopeado por `tenantId`.
 */
export async function registerFiscalDocument(
  input: RegisterFiscalDocumentInput,
): Promise<void> {
  // `tenantTransaction` con `tenantId` EXPLÍCITO (no ambiental): este comando lo
  // invoca el worker/dispatcher (processArcaOutbox), sin request/host — con
  // RLS_ENFORCEMENT on, resolverlo ambientalmente (getCurrentTenantId) rompería
  // apenas hubiera >1 tenant. El `tenantId` ya lo trae el caller (viene del
  // payload del outbox), así que se lo pasamos directo (ADR-018 §4).
  const res = await tenantTransaction(
    (tx) =>
      tx.invoice.updateMany({
        where: { id: input.invoiceId, tenantId: input.tenantId, status: "PENDING" },
        data: {
          status: "AUTHORIZED",
          cae: input.cae,
          caeVencimiento: input.caeVencimiento,
          numero: input.numero,
          tipoComprobante: input.tipoComprobante,
          authorizedAt: new Date(),
        },
      }),
    { tenantId: input.tenantId },
  );
  if (res.count === 0) {
    // No estaba PENDING: ya autorizada (reintento del evento) o no existe / otro
    // tenant. No es error del flujo; el dispatcher lo trata como procesado.
    return;
  }
}

/** Registra que ARCA rechazó la factura (status REJECTED + motivo). */
export async function markInvoiceRejected(
  invoiceId: string,
  tenantId: string,
  motivo: string,
): Promise<void> {
  // Mismo criterio que registerFiscalDocument: tenantId explícito, sin depender
  // de la resolución ambiental (worker sin request).
  await tenantTransaction(
    (tx) =>
      tx.invoice.updateMany({
        where: { id: invoiceId, tenantId, status: "PENDING" },
        data: { status: "REJECTED", rechazoMotivo: motivo },
      }),
    { tenantId },
  );
}

/** Consulta una factura del tenant. */
export async function getInvoice(id: string, tenantId: string) {
  return prisma.invoice.findFirst({ where: { id, tenantId } });
}
