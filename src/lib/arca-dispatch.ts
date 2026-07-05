/**
 * Dispatcher del Plugin ARCA (Integration Engine, ADR-006 / ADR-002 / ADR-022).
 *
 * Es el GLUE del borde: lee el outbox del Core, arma el evento que el plugin
 * entiende y corre su handler, inyectándole el cliente de ARCA del tenant y el
 * comando `registerFiscalDocument` del Core. Es el único módulo que conoce a los
 * dos lados (por eso importa el plugin); el Core (`invoice-core`) no importa el
 * plugin — la dependencia va plugin→Core (ADR-002).
 *
 * Hoy corre a demanda (`processArcaOutbox()`); mañana lo dispara un worker
 * periódico (pg-boss/graphile-worker, ADR-002/005). No está enganchado a ningún
 * cron todavía a propósito: la emisión de facturas reales es un follow-up.
 */

import { prisma } from "@/lib/prisma";
import {
  markInvoiceRejected,
  registerFiscalDocument,
  OUTBOX_INVOICE_CREATED,
  type InvoiceCreatedPayload,
} from "@/lib/invoice-core";
import {
  procesarInvoiceCreated,
  ArcaRechazoError,
  ComprobanteInvalidoError,
  StubAfipClient,
  CondicionIva,
  type AfipClient,
  type InvoiceCreatedEvent,
} from "@/plugins/arca";

/**
 * Resuelve el cliente de ARCA de un tenant (sus credenciales/CUIT).
 *
 * TODO(lado-Core, ADR-022 §5): hoy devuelve el STUB en memoria. La versión real
 * lee la config del tenant (certificado X.509 + CUIT + punto de venta, ver
 * `configSchema` del manifiesto) y devuelve el adapter SOAP real
 * (`src/plugins/arca/afip/soap.ts`, todavía sin construir). El plugin es
 * tenant-agnóstico: acá es donde entra el tenant.
 */
export function clientePara(_tenantId: string): AfipClient {
  return new StubAfipClient({ cuit: 0, homologacion: true });
}

/** Convierte el payload guardado (condicionIva como texto) al evento del plugin. */
function aEventoPlugin(p: InvoiceCreatedPayload): InvoiceCreatedEvent {
  return {
    invoiceId: p.invoiceId,
    tenantId: p.tenantId,
    concepto: p.concepto,
    fecha: p.fecha,
    emisor: {
      cuit: p.emisor.cuit,
      condicionIva: p.emisor.condicionIva as CondicionIva,
      puntoVenta: p.emisor.puntoVenta,
    },
    receptor: {
      docTipo: p.receptor.docTipo,
      docNro: p.receptor.docNro,
      condicionIva: p.receptor.condicionIva as CondicionIva,
    },
    neto: p.neto,
    iva: p.iva,
    total: p.total,
    servicioDesde: p.servicioDesde,
    servicioHasta: p.servicioHasta,
    vencimientoPago: p.vencimientoPago,
  };
}

export interface DispatchResumen {
  procesados: number;
  autorizados: number;
  rechazados: number;
  fallidos: number;
}

/**
 * Drena eventos `InvoiceCreated` pendientes del outbox y los manda al plugin.
 * - Éxito → `registerFiscalDocument` (lo hace el handler) + marca procesado.
 * - Rechazo de ARCA → marca la factura REJECTED + marca el evento procesado.
 * - Otro error → deja el evento pendiente, incrementa `attempts` y guarda el error.
 */
export async function processArcaOutbox(limit = 20): Promise<DispatchResumen> {
  const pendientes = await prisma.outboxEvent.findMany({
    where: { type: OUTBOX_INVOICE_CREATED, processedAt: null },
    orderBy: { createdAt: "asc" },
    take: limit,
  });

  const resumen: DispatchResumen = {
    procesados: 0,
    autorizados: 0,
    rechazados: 0,
    fallidos: 0,
  };

  for (const evento of pendientes) {
    const payload = evento.payload as unknown as InvoiceCreatedPayload;
    try {
      await procesarInvoiceCreated(aEventoPlugin(payload), {
        clientePara,
        registrar: registerFiscalDocument,
      });
      await prisma.outboxEvent.update({
        where: { id: evento.id },
        data: { processedAt: new Date() },
      });
      resumen.autorizados++;
      resumen.procesados++;
    } catch (err) {
      if (err instanceof ArcaRechazoError || err instanceof ComprobanteInvalidoError) {
        // Rechazo determinístico: no tiene sentido reintentar. Marca la factura
        // rechazada y el evento como procesado.
        const motivo =
          err instanceof ArcaRechazoError
            ? err.observaciones.map((o) => `${o.codigo}: ${o.mensaje}`).join("; ")
            : err.errores.map((e) => `${e.campo}: ${e.mensaje}`).join("; ");
        await markInvoiceRejected(payload.invoiceId, payload.tenantId, motivo);
        await prisma.outboxEvent.update({
          where: { id: evento.id },
          data: { processedAt: new Date(), lastError: motivo },
        });
        resumen.rechazados++;
        resumen.procesados++;
      } else {
        // Error transitorio (red, ARCA caído): dejar pendiente para reintento.
        await prisma.outboxEvent.update({
          where: { id: evento.id },
          data: {
            attempts: { increment: 1 },
            lastError: err instanceof Error ? err.message : String(err),
          },
        });
        resumen.fallidos++;
      }
    }
  }

  return resumen;
}
