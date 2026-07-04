// Punto de entrada del Core para emitir un comprobante (ADR-019 D2/D3).
// Crea el FiscalDocument (PENDIENTE) + el evento de outbox en la MISMA
// transacción (nunca uno sin el otro), y hace un intento síncrono best-effort
// (B3) para tener el CAE al toque. Si el síncrono falla, la outbox queda
// PENDIENTE y el drenado la reintenta — por eso un error acá no rompe el cobro.
import { prisma } from "@/lib/prisma";
import type {
  CondicionIva,
  ConceptoComprobante,
  Prisma,
} from "@/generated/prisma/client";
import {
  calcularComprobante,
  calcularNotaCredito,
  IVA_GENERAL,
  type AlicuotaCodigo,
  type ResultadoCalculo,
  type IvaDetalleItem,
} from "./calculo-fiscal";
import { conceptoRequiereFechas } from "./comprobante-arca";
import { procesarEvento } from "./outbox";

export interface RequestComprobanteInput {
  tenantId: string;
  origenTipo: string; // ej. "payment"
  origenId: string; // id del origen — base de la idempotencia
  totalFinal: number; // total cobrado, IVA incluido
  // Alícuota de IVA de la operación. Un cobro de estética es una línea a una
  // alícuota; por defecto la general (21%). El motor soporta multi-alícuota
  // cuando el origen tenga varias líneas.
  alicuota?: AlicuotaCodigo;
  // Concepto (WSFEv1). Por defecto SERVICIOS (el caso de la estética). Para
  // servicios/ambos, las fechas por defecto son la fecha de emisión.
  concepto?: ConceptoComprobante;
  servicioDesde?: Date;
  servicioHasta?: Date;
  vencimientoPago?: Date;
}

// Devuelve el id del FiscalDocument, o null si el tenant no tiene identidad
// fiscal configurada (la feature queda inerte hasta configurar ARCA por tenant).
// Idempotente por (origenTipo, origenId): un mismo cobro no genera dos comprobantes.
export async function requestFiscalComprobante(
  input: RequestComprobanteInput,
): Promise<string | null> {
  const config = await prisma.tenantFiscalConfig.findUnique({
    where: { tenantId: input.tenantId },
  });
  if (!config) return null;

  const idempotencyKey = `${input.origenTipo}:${input.origenId}`;
  const existente = await prisma.fiscalDocument.findUnique({
    where: { idempotencyKey },
  });
  if (existente) return existente.id;

  const imp = calcularComprobante(config.condicionIva as CondicionIva, [
    { importe: input.totalFinal, alicuota: input.alicuota ?? IVA_GENERAL, incluyeIva: true },
  ]);

  const fechaEmision = new Date();
  const concepto: ConceptoComprobante = input.concepto ?? "SERVICIOS";
  const requiereFechas = conceptoRequiereFechas(concepto);
  const servicioDesde = requiereFechas ? (input.servicioDesde ?? fechaEmision) : null;
  const servicioHasta = requiereFechas ? (input.servicioHasta ?? fechaEmision) : null;
  const vencimientoPago = requiereFechas ? (input.vencimientoPago ?? fechaEmision) : null;

  const { docId, eventId } = await prisma.$transaction(async (tx) => {
    const doc = await tx.fiscalDocument.create({
      data: {
        tenantId: input.tenantId,
        tipo: imp.tipo,
        puntoVenta: config.puntoVenta,
        fechaEmision,
        concepto,
        servicioDesde,
        servicioHasta,
        vencimientoPago,
        receptorCondicionIva: imp.receptorCondicionIva,
        receptorTipoDoc: imp.receptorTipoDoc,
        receptorNroDoc: null,
        neto: imp.neto,
        exento: imp.exento,
        noGravado: imp.noGravado,
        iva: imp.iva,
        total: imp.total,
        ivaDetalle: imp.ivaDetalle as unknown as Prisma.InputJsonValue,
        origenTipo: input.origenTipo,
        origenId: input.origenId,
        idempotencyKey,
      },
    });
    const ev = await tx.outboxEvent.create({
      data: {
        tenantId: input.tenantId,
        tipo: "FiscalDocumentRequested",
        payload: { fiscalDocumentId: doc.id },
      },
    });
    return { docId: doc.id, eventId: ev.id };
  });

  // Intento síncrono best-effort (B3). El error no se propaga: la outbox es la red.
  await procesarEvento(eventId).catch(() => {
    /* la Scheduled Function lo reintentará */
  });

  return docId;
}

// Emite una nota de crédito TOTAL de un comprobante ya autorizado (anulación /
// devolución). Referencia el original (CbtesAsoc). Idempotente por `nc:<id>`.
// Devuelve el id de la NC, o null si el original no existe.
export async function requestNotaCredito(
  fiscalDocumentIdOriginal: string,
): Promise<string | null> {
  const original = await prisma.fiscalDocument.findUnique({
    where: { id: fiscalDocumentIdOriginal },
  });
  if (!original) return null;
  if (original.estado !== "AUTORIZADO") {
    throw new Error("Solo se puede emitir nota de crédito de un comprobante autorizado.");
  }

  const idempotencyKey = `nc:${original.id}`;
  const existente = await prisma.fiscalDocument.findUnique({ where: { idempotencyKey } });
  if (existente) return existente.id;

  const originalCalc: ResultadoCalculo = {
    tipo: original.tipo,
    neto: original.neto,
    exento: original.exento,
    noGravado: original.noGravado,
    iva: original.iva,
    total: original.total,
    ivaDetalle: (original.ivaDetalle as unknown as IvaDetalleItem[] | null) ?? [],
    receptorCondicionIva: original.receptorCondicionIva,
    receptorTipoDoc: original.receptorTipoDoc,
    receptorNroDoc: original.receptorNroDoc,
  };
  const nc = calcularNotaCredito(originalCalc);

  const { docId, eventId } = await prisma.$transaction(async (tx) => {
    const doc = await tx.fiscalDocument.create({
      data: {
        tenantId: original.tenantId,
        tipo: nc.tipo,
        puntoVenta: original.puntoVenta,
        fechaEmision: new Date(),
        concepto: original.concepto,
        servicioDesde: original.servicioDesde,
        servicioHasta: original.servicioHasta,
        vencimientoPago: original.vencimientoPago,
        receptorCondicionIva: nc.receptorCondicionIva,
        receptorTipoDoc: nc.receptorTipoDoc,
        receptorNroDoc: nc.receptorNroDoc,
        neto: nc.neto,
        exento: nc.exento,
        noGravado: nc.noGravado,
        iva: nc.iva,
        total: nc.total,
        ivaDetalle: nc.ivaDetalle as unknown as Prisma.InputJsonValue,
        origenTipo: "nota_credito",
        origenId: original.id,
        comprobanteAsociadoId: original.id,
        idempotencyKey,
      },
    });
    const ev = await tx.outboxEvent.create({
      data: {
        tenantId: original.tenantId,
        tipo: "FiscalDocumentRequested",
        payload: { fiscalDocumentId: doc.id },
      },
    });
    return { docId: doc.id, eventId: ev.id };
  });

  await procesarEvento(eventId).catch(() => {
    /* la Scheduled Function lo reintentará */
  });

  return docId;
}
