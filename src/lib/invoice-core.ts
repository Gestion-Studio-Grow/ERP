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
import { tenantTransaction } from "@/lib/rls";
import { round2 } from "@/lib/round";

/** Desglose de IVA por alícuota (calculado por el Core, ADR-006). */
export interface SubtotalIva {
  alicuotaId: number;
  base: number;
  importe: number;
}

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
}

/** Forma del payload del evento `InvoiceCreated` que viaja por el outbox. */
export interface InvoiceCreatedPayload extends Omit<CreateInvoiceInput, "tenantId"> {
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
  return tenantTransaction(async (tx) => {
    const invoice = await tx.invoice.create({
      data: {
        tenantId: input.tenantId,
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
}

/**
 * Comando público (superficie II): el plugin pasa el CAE y el Core lo persiste.
 * Idempotente por diseño: solo autoriza facturas en PENDING (una segunda entrega
 * del mismo evento no vuelve a escribir). Scopeado por `tenantId`.
 */
export async function registerFiscalDocument(
  input: RegisterFiscalDocumentInput,
): Promise<void> {
  const res = await prisma.invoice.updateMany({
    where: { id: input.invoiceId, tenantId: input.tenantId, status: "PENDING" },
    data: {
      status: "AUTHORIZED",
      cae: input.cae,
      caeVencimiento: input.caeVencimiento,
      numero: input.numero,
      tipoComprobante: input.tipoComprobante,
      authorizedAt: new Date(),
    },
  });
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
  await prisma.invoice.updateMany({
    where: { id: invoiceId, tenantId, status: "PENDING" },
    data: { status: "REJECTED", rechazoMotivo: motivo },
  });
}

/** Consulta una factura del tenant. */
export async function getInvoice(id: string, tenantId: string) {
  return prisma.invoice.findFirst({ where: { id, tenantId } });
}
