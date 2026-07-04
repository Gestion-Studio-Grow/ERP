// Comandos públicos del Core (ADR-002 / ADR-019 D2): la ÚNICA puerta por la que
// un resultado de ARCA impacta el dominio. Idempotentes por fiscalDocumentId —
// si el documento ya está AUTORIZADO no re-emiten (blinda el doble disparo
// síncrono + outbox de B3).
import type { Prisma } from "@/generated/prisma/client";

export interface AutorizacionInput {
  fiscalDocumentId: string;
  cae: string;
  caeVencimiento: Date;
  nroComprobante: number;
}

export interface RechazoInput {
  fiscalDocumentId: string;
  motivo: string;
}

export async function registerFiscalAuthorization(
  tx: Prisma.TransactionClient,
  input: AutorizacionInput,
): Promise<void> {
  const doc = await tx.fiscalDocument.findUnique({
    where: { id: input.fiscalDocumentId },
  });
  if (!doc || doc.estado === "AUTORIZADO") return;
  await tx.fiscalDocument.update({
    where: { id: input.fiscalDocumentId },
    data: {
      estado: "AUTORIZADO",
      cae: input.cae,
      caeVencimiento: input.caeVencimiento,
      nroComprobante: input.nroComprobante,
      motivoRechazo: null,
    },
  });
}

export async function registerFiscalRejection(
  tx: Prisma.TransactionClient,
  input: RechazoInput,
): Promise<void> {
  const doc = await tx.fiscalDocument.findUnique({
    where: { id: input.fiscalDocumentId },
  });
  if (!doc || doc.estado === "AUTORIZADO") return;
  await tx.fiscalDocument.update({
    where: { id: input.fiscalDocumentId },
    data: { estado: "RECHAZADO", motivoRechazo: input.motivo },
  });
}
