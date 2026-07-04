// Punto de entrada del Core para emitir un comprobante (ADR-019 D2/D3).
// Crea el FiscalDocument (PENDIENTE) + el evento de outbox en la MISMA
// transacción (nunca uno sin el otro), y hace un intento síncrono best-effort
// (B3) para tener el CAE al toque. Si el síncrono falla, la outbox queda
// PENDIENTE y el drenado la reintenta — por eso un error acá no rompe el cobro.
import { prisma } from "@/lib/prisma";
import type { CondicionIva } from "@/generated/prisma/client";
import type { Prisma } from "@/generated/prisma/client";
import { calcularComprobante, IVA_GENERAL, type AlicuotaCodigo } from "./calculo-fiscal";
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

  const { docId, eventId } = await prisma.$transaction(async (tx) => {
    const doc = await tx.fiscalDocument.create({
      data: {
        tenantId: input.tenantId,
        tipo: imp.tipo,
        puntoVenta: config.puntoVenta,
        fechaEmision: new Date(),
        receptorCondicionIva: imp.receptorCondicionIva,
        receptorTipoDoc: imp.receptorTipoDoc,
        receptorNroDoc: null,
        neto: imp.neto,
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
