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

import { operatorPrisma } from "@/lib/operator-db";
import { tenantTransaction } from "@/lib/rls";
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
  modoDesdeEnv,
  CondicionIva,
  type AfipClient,
  type EmisorConfig,
  type CredencialEmisor,
  type HandlerDeps,
  type InvoiceCreatedEvent,
  type TicketAcceso,
} from "@/plugins/arca";
import { credencialParaTenant } from "@/lib/fiscal/tenant-cert";
import { leerTicketAcceso, guardarTicketAcceso } from "@/lib/fiscal/arca-ta-store";

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

/**
 * Lector real: toma la metadata fiscal del `Tenant` (ADR-022 §5, opción B).
 * `tenantId` EXPLÍCITO vía `tenantTransaction`, no ambiental: lo llama el
 * worker (`processArcaOutbox`), sin request/host — con RLS_ENFORCEMENT on,
 * `getCurrentTenantId()` ambiental rompería con >1 tenant. `Tenant` no tiene
 * policy propia (excluida de RLS, ADR-018), pero la resolución del tenant
 * pasa igual por acá, así que se le da el contexto explícito de todas formas.
 */
const leerConfigFiscalPrisma: LeerConfigFiscal = async (tenantId) => {
  const t = await tenantTransaction(
    (tx) =>
      tx.tenant.findUnique({
        where: { id: tenantId },
        select: { arcaCuit: true, arcaHomologacion: true },
      }),
    { tenantId },
  );
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
  resolverCredencial: (tenantId: string) => Promise<CredencialEmisor> = credencialParaTenant,
  leerTicket: (tenantId: string) => Promise<TicketAcceso | undefined> = leerTicketAcceso,
  guardarTicket: (tenantId: string, ta: TicketAcceso) => Promise<void> = guardarTicketAcceso,
): (tenantId: string) => Promise<AfipClient> {
  return async (tenantId) => {
    const cfg = await leer(tenantId);
    const config: EmisorConfig = cfg ?? { cuit: 0, homologacion: true };
    const modo = modoDesdeEnv(env);

    // En stub NO se firma ni se autentica → no se toca la credencial ni el TA.
    if (modo !== "real" && modo !== "homologacion") {
      return crearAfipClient(config, { env });
    }

    // 🔒 ADR-066: la credencial se resuelve POR TENANT (cifrada en la DB), NUNCA de un env
    // compartido. Si el tenant no tiene credencial cargada, `credencialParaTenant` lanza →
    // fail-closed.
    const credencial = await resolverCredencial(tenantId);
    // Reutilización del TA (ADR-022 §6): si hay un TA vigente persistido, se lo damos al
    // cliente para que NO re-loguee (WSAA bloquea `alreadyAuthenticated` ~10-15 min). Cuando
    // el cliente acuña uno nuevo, `alRenovarTicket` lo persiste (cifrado) para la próxima
    // invocación — el seam que cierra el ciclo en serverless.
    const ticketInicial = await leerTicket(tenantId);
    return crearAfipClient(config, {
      env,
      credencial,
      ticketInicial,
      alRenovarTicket: (ta) => guardarTicket(tenantId, ta),
    });
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
 *
 * AISLAMIENTO DE TENANT (fix async/cron, ADR-018 §4): este worker corre sin
 * request/host — `getCurrentTenantId()` ambiental rompe apenas hay >1 tenant
 * bajo RLS. El barrido CROSS-TENANT (todos los tenants, una sola pasada) usa
 * `operatorPrisma` (rol dueño, bypassa RLS por diseño — nunca el `prisma`
 * conmutado por RLS para esto, ver ADR-021). Cada fila procesada queda atada a
 * SU tenant vía `tenantTransaction(fn, { tenantId: evento.tenantId })` — el
 * dato ya está en la fila del outbox, se lo pasamos explícito en vez de dejar
 * que se intente resolver ambientalmente.
 */
export async function processArcaOutbox(
  limit = 20,
  deps: HandlerDeps = { clientePara, registrar: registerFiscalDocument },
): Promise<DispatchResumen> {
  const pendientes = await operatorPrisma.outboxEvent.findMany({
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
      await procesarInvoiceCreated(aEventoPlugin(payload), deps);
      await tenantTransaction(
        (tx) => tx.outboxEvent.update({ where: { id: evento.id }, data: { processedAt: new Date() } }),
        { tenantId: payload.tenantId },
      );
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
        await tenantTransaction(
          (tx) =>
            tx.outboxEvent.update({
              where: { id: evento.id },
              data: { processedAt: new Date(), lastError: motivo },
            }),
          { tenantId: payload.tenantId },
        );
        resumen.rechazados++;
        resumen.procesados++;
      } else {
        // Error transitorio (red, ARCA caído): dejar pendiente para reintento.
        await tenantTransaction(
          (tx) =>
            tx.outboxEvent.update({
              where: { id: evento.id },
              data: {
                attempts: { increment: 1 },
                lastError: err instanceof Error ? err.message : String(err),
              },
            }),
          { tenantId: payload.tenantId },
        );
        resumen.fallidos++;
      }
    }
  }

  return resumen;
}
