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
  crearAfipClient,
  CondicionIva,
  type AfipClient,
  type EmisorConfig,
  type InvoiceCreatedEvent,
} from "@/plugins/arca";

/**
 * Config fiscal no sensible del tenant (lo que la DB SÍ guarda). El cert/clave
 * NO están acá: los resuelve la factory desde env/secret (ADR-022 §5).
 */
export interface ConfigFiscalTenant {
  cuit: number;
  homologacion: boolean;
}

/** Lee la config fiscal de un tenant. Seam inyectable (default: Prisma). */
export type LeerConfigFiscal = (
  tenantId: string,
) => Promise<ConfigFiscalTenant | null>;

/** Lector real: toma la metadata fiscal del `Tenant` (ADR-022 §5, opción B). */
const leerConfigFiscalPrisma: LeerConfigFiscal = async (tenantId) => {
  const t = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { arcaCuit: true, arcaHomologacion: true },
  });
  if (!t) return null;
  // `arcaCuit` es texto en DB (no entra en Int32); el emisor lo maneja como número.
  return {
    cuit: t.arcaCuit ? Number(t.arcaCuit) : 0,
    homologacion: t.arcaHomologacion,
  };
};

/**
 * Construye el resolvedor `clientePara(tenantId)` a partir de un lector de
 * config y el entorno. Testeable offline sin DB (se le inyecta un lector fake).
 *
 * "Encender, no construir" (ADR-022): arma el `EmisorConfig` del tenant desde su
 * metadata y delega en `crearAfipClient`, que elige STUB vs SOAP real según
 * `ARCA_MODO`. Con `ARCA_MODO` sin setear (default), SIEMPRE devuelve el stub —
 * ARCA queda apagado aunque el enganche esté completo. Un tenant sin config
 * fiscal cargada cae a un stub `cuit:0` (inofensivo en modo stub).
 */
export function crearClientePara(
  leer: LeerConfigFiscal = leerConfigFiscalPrisma,
  env: Record<string, string | undefined> = process.env,
): (tenantId: string) => Promise<AfipClient> {
  return async (tenantId) => {
    const cfg = await leer(tenantId);
    const config: EmisorConfig = cfg ?? { cuit: 0, homologacion: true };
    return crearAfipClient(config, env);
  };
}

/**
 * Resuelve el cliente de ARCA de un tenant (su config fiscal). Default de
 * producción: lee del `Tenant` y respeta `ARCA_MODO` (stub mientras no se
 * encienda). El plugin es tenant-agnóstico: acá es donde entra el tenant.
 */
export const clientePara = crearClientePara();

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
