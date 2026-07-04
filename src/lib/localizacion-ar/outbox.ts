// Procesamiento de la outbox (ADR-019 D2/D3). `procesarEvento` es el paso que
// llama al conector y aplica el comando idempotente; lo usan tanto el intento
// síncrono (emit.ts) como el drenado por Scheduled Function. La outbox es la
// fuente de verdad de "qué falta autorizar": ningún comprobante queda sin CAE.
import { prisma } from "@/lib/prisma";
import { ensureConnectors } from "./connectors";
import { connectorPara } from "./connector";
import { registerFiscalAuthorization, registerFiscalRejection } from "./commands";
import type { EmisionInput } from "./types";
import type { IvaDetalleItem } from "./calculo-fiscal";
import { codigoCondicionIvaReceptor, esCuitValido } from "./identidad-fiscal";

const MAX_INTENTOS = 5;

interface FiscalRequestedPayload {
  fiscalDocumentId: string;
}

export async function procesarEvento(eventId: string): Promise<void> {
  ensureConnectors();

  const ev = await prisma.outboxEvent.findUnique({ where: { id: eventId } });
  if (!ev || ev.estado === "PROCESADO") return;

  const payload = ev.payload as unknown as FiscalRequestedPayload;
  const doc = await prisma.fiscalDocument.findUnique({
    where: { id: payload.fiscalDocumentId },
  });
  if (!doc) {
    await prisma.outboxEvent.update({
      where: { id: ev.id },
      data: {
        estado: "ERROR",
        ultimoError: "FiscalDocument inexistente",
        intentos: { increment: 1 },
      },
    });
    return;
  }
  if (doc.estado === "AUTORIZADO") {
    await prisma.outboxEvent.update({
      where: { id: ev.id },
      data: { estado: "PROCESADO", procesadoAt: new Date() },
    });
    return;
  }

  const config = await prisma.tenantFiscalConfig.findUnique({
    where: { tenantId: doc.tenantId },
  });
  if (!config) {
    await prisma.outboxEvent.update({
      where: { id: ev.id },
      data: {
        estado: "ERROR",
        ultimoError: "Tenant sin config fiscal",
        intentos: { increment: 1 },
      },
    });
    return;
  }
  // Fail-closed: no intentar emitir con un CUIT mal formado (evita un rechazo
  // seguro de ARCA y deja el motivo claro en la outbox).
  if (!esCuitValido(config.cuit)) {
    await prisma.outboxEvent.update({
      where: { id: ev.id },
      data: {
        estado: "ERROR",
        ultimoError: `CUIT del tenant inválido: ${config.cuit}`,
        intentos: { increment: 1 },
      },
    });
    return;
  }

  try {
    const connector = connectorPara("emitir-comprobante", "ar.nacional");
    if (!connector.emitir) throw new Error("El conector no soporta emisión");

    const emisionInput: EmisionInput = {
      tipo: doc.tipo,
      puntoVenta: doc.puntoVenta,
      fechaEmision: doc.fechaEmision,
      receptorCondicionIva: doc.receptorCondicionIva,
      receptorCondicionIvaId: codigoCondicionIvaReceptor(doc.receptorCondicionIva),
      receptorTipoDoc: doc.receptorTipoDoc,
      receptorNroDoc: doc.receptorNroDoc,
      neto: doc.neto,
      exento: doc.exento,
      noGravado: doc.noGravado,
      iva: doc.iva,
      total: doc.total,
      ivaDetalle: (doc.ivaDetalle as unknown as IvaDetalleItem[] | null) ?? [],
    };
    const res = await connector.emitir(emisionInput, {
      cuit: config.cuit,
      ambiente: config.ambiente,
      connectorRef: config.connectorRef,
    });

    await prisma.$transaction(async (tx) => {
      if (res.ok) {
        await registerFiscalAuthorization(tx, {
          fiscalDocumentId: doc.id,
          cae: res.cae,
          caeVencimiento: res.caeVencimiento,
          nroComprobante: res.nroComprobante,
        });
      } else {
        await registerFiscalRejection(tx, {
          fiscalDocumentId: doc.id,
          motivo: res.motivo,
        });
      }
      await tx.outboxEvent.update({
        where: { id: ev.id },
        data: { estado: "PROCESADO", procesadoAt: new Date() },
      });
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const intentos = ev.intentos + 1;
    await prisma.outboxEvent.update({
      where: { id: ev.id },
      data: {
        estado: intentos >= MAX_INTENTOS ? "ERROR" : "PENDIENTE",
        intentos,
        ultimoError: msg,
      },
    });
    throw err;
  }
}

// Drena la outbox: procesa los eventos PENDIENTE. Lo invoca la Scheduled
// Function (`/api/localizacion-ar/drain`). Devuelve un resumen para observabilidad
// — un comprobante en ERROR es un incidente fiscal, no un log más.
export async function drainOutbox(
  limit = 50,
): Promise<{ procesados: number; errores: number; total: number }> {
  const pendientes = await prisma.outboxEvent.findMany({
    where: { estado: "PENDIENTE" },
    orderBy: { createdAt: "asc" },
    take: limit,
  });

  let procesados = 0;
  let errores = 0;
  for (const ev of pendientes) {
    try {
      await procesarEvento(ev.id);
      procesados++;
    } catch {
      errores++;
    }
  }
  return { procesados, errores, total: pendientes.length };
}
