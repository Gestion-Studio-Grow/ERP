/**
 * Emisión de NOTAS DE CRÉDITO (lado Core del Plugin ARCA, ADR-022/024).
 *
 * Una nota de crédito REVIERTE una factura ya autorizada (devolución,
 * anulación, ajuste a la baja). El tipo de nota SIGUE LA CLASE de la factura
 * origen (A→3, B→8, C→13, M→53) — eso lo resuelve la política por contribuyente
 * del plugin; acá el Core arma la operación y la encola por el MISMO camino que
 * una factura (outbox → plugin → CAE), marcándola como `NOTA_CREDITO` y
 * asociándola al comprobante origen (`CbtesAsoc`).
 *
 * SANDBOX: sin credenciales reales, el stub del plugin le da un CAE simulado.
 * NO escribe ARCA real (eso es §C, lo enciende el dueño).
 */

import { prisma } from "@/lib/prisma";
import { createInvoice, type SubtotalIva } from "@/lib/invoice-core";
import {
  condicionDesdeReceptorId,
  resolverPerfilFiscal,
} from "@/lib/fiscal";
import { processArcaOutbox } from "@/lib/arca-dispatch";

/** Fecha de hoy en formato ARCA `AAAAMMDD` (zona horaria del server). */
function fechaHoy(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

/** Motivo por el que no se pudo emitir la nota de crédito. */
export type MotivoNoNota =
  | "factura_inexistente"
  | "factura_no_autorizada"
  | "sin_comprobante_origen";

export interface ResultadoNotaCredito {
  ok: boolean;
  invoiceId?: string;
  motivo?: MotivoNoNota;
}

/**
 * Emite una nota de crédito que reversa TOTALMENTE una factura autorizada.
 * Reconstruye los montos y el receptor de la factura origen y encola la
 * operación (best-effort: despacha el outbox como el resto del flujo sandbox).
 * Devuelve el id de la nota creada, o el motivo por el que no se pudo.
 *
 * Sólo reversa facturas AUTORIZADAS (con tipo y número de ARCA): no tiene
 * sentido acreditar algo que ARCA todavía no autorizó.
 */
export async function emitirNotaCredito(
  facturaId: string,
  tenantId: string,
): Promise<ResultadoNotaCredito> {
  const original = await prisma.invoice.findFirst({
    where: { id: facturaId, tenantId },
  });
  if (!original) return { ok: false, motivo: "factura_inexistente" };
  if (original.status !== "AUTHORIZED") {
    return { ok: false, motivo: "factura_no_autorizada" };
  }
  if (original.tipoComprobante == null || original.numero == null) {
    return { ok: false, motivo: "sin_comprobante_origen" };
  }

  const perfil = await resolverPerfilFiscal(tenantId);
  const receptorCondicion = condicionDesdeReceptorId(
    original.condicionIvaReceptorId,
  );
  const fecha = fechaHoy();

  // Los montos de la nota espejan los de la factura origen (reversa total).
  const iva = (original.ivaDesglose as unknown as SubtotalIva[] | null) ?? [
    { alicuotaId: 3, base: original.neto, importe: 0 },
  ];

  const invoiceId = await createInvoice({
    tenantId,
    concepto: original.concepto,
    fecha,
    emisor: {
      cuit: perfil.cuit,
      condicionIva: perfil.condicionIva,
      puntoVenta: original.puntoVenta,
    },
    receptor: {
      docTipo: original.docTipo,
      docNro: Number(original.docNro),
      condicionIva: receptorCondicion,
    },
    neto: original.neto,
    iva,
    total: original.total,
    condicionIvaReceptorId: original.condicionIvaReceptorId ?? undefined,
    operacion: "NOTA_CREDITO",
    comprobanteAsociado: {
      tipo: original.tipoComprobante,
      puntoVenta: original.puntoVenta,
      numero: original.numero,
    },
    comprobanteAsociadoId: original.id,
    // Concepto Servicios exige fechas de servicio (validación del plugin).
    servicioDesde: fecha,
    servicioHasta: fecha,
    vencimientoPago: fecha,
  });

  // Tick del simulador: en prod lo hace el worker periódico (ADR-002/024).
  await processArcaOutbox();

  return { ok: true, invoiceId };
}
