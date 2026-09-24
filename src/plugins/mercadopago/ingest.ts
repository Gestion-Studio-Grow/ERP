/**
 * Ingesta de pagos de Mercado Pago (ADR-025). Algoritmo PURO y testeable: no
 * toca la DB ni la red directo — recibe el cliente MP, el clasificador, el
 * registro de conciliación y el comando de facturación por inyección. Las dos
 * fuentes (backfill histórico y webhook) convergen acá; la idempotencia por
 * `payment_id` garantiza que ver un pago dos veces no genere dos facturas.
 *
 * Pipeline por pago (ADR-025 §12): clasificar → según resultado facturar /
 * descartar / dejar para revisión humana.
 */

import { CriterioBusqueda, MercadoPagoClient, PagoMP } from "./port";
import { ClasificadorPort } from "./classifier";
import { ReconciliacionPort } from "./reconciliation";
import {
  normalizarReferencia,
  ventaDeReferencia,
  type ResolverReferencias,
  type VentaDeReferencia,
} from "./core-contract";

/** Factura un pago MP y devuelve el `invoiceId` (o null si no se pudo). */
export type FacturarPagoMP = (pago: PagoMP, tenantId: string) => Promise<string | null>;

/**
 * Error de facturación con semántica de reintento. `retriable=false` = rechazo
 * determinístico de ARCA (no tiene sentido reintentar → RECHAZADO); `true` =
 * fallo transitorio (ARCA caído, red) → se reintenta hasta el tope.
 */
export class ErrorFacturacion extends Error {
  constructor(message: string, readonly retriable: boolean) {
    super(message);
    this.name = "ErrorFacturacion";
  }
}

export interface IngestaDeps {
  tenantId: string;
  client: MercadoPagoClient;
  /** Clasificador de ingresos (§12.1): decide qué se factura. */
  clasificador: ClasificadorPort;
  reconciliacion: ReconciliacionPort;
  facturar: FacturarPagoMP;
  /**
   * Resuelve las `external_reference` contra los turnos y pedidos del negocio (el Core,
   * mercadopago-referencias.ts). Sin él, un pago CON referencia no se factura ni se descarta
   * solo: va a revisión (classifier.ts, paso 0). Los pagos sin referencia no lo necesitan.
   */
  resolverReferencias?: ResolverReferencias;
  /** Tope de reintentos de un error transitorio antes de escalar a REVISAR. */
  maxIntentos?: number;
}

export interface ResumenIngesta {
  leidos: number;
  facturados: number;
  noFacturables: number; // clasificados como NO_FACTURABLE (transferencias, etc.)
  aRevisar: number; // REVISAR: esperan decisión humana (panel/WhatsApp)
  rechazados: number; // ARCA rechazó (terminal)
  saltados: number; // ya procesados antes (idempotencia)
  errores: number; // fallo transitorio (se reintentará)
}

const MAX_INTENTOS_DEFAULT = 3;

/**
 * Resuelve de una vez las referencias de un lote de pagos (una página del sincronizado, o el
 * único pago del aviso). Sin resolutor o sin referencias, no consulta nada.
 */
export async function resolverLote(
  pagos: readonly PagoMP[],
  deps: Pick<IngestaDeps, "tenantId" | "resolverReferencias">,
): Promise<ReadonlyMap<string, VentaDeReferencia> | undefined> {
  if (!deps.resolverReferencias) return undefined;
  const refs = [...new Set(pagos.map((p) => normalizarReferencia(p.externalReference)).filter(Boolean))];
  if (refs.length === 0) return new Map();
  return deps.resolverReferencias(deps.tenantId, refs);
}

/**
 * Procesa un único pago (usado por el webhook y por el backfill). Idempotente.
 * `resueltas`: las referencias del lote ya resueltas (el sincronizado las pasa por página); sin
 * ellas, se resuelve la de este pago sola.
 */
export async function facturarPagoSiCorresponde(
  pago: PagoMP,
  deps: IngestaDeps,
  resumen: ResumenIngesta,
  resueltas?: ReadonlyMap<string, VentaDeReferencia>,
): Promise<void> {
  if (await deps.reconciliacion.yaProcesado(pago.id)) {
    resumen.saltados++;
    return;
  }

  // Clasificación (§12.1): entre ingesta y facturación. No se factura a ciegas. La venta detrás
  // de la referencia se resuelve antes: el clasificador es puro y no va a la base.
  const venta = ventaDeReferencia(pago.externalReference, resueltas ?? (await resolverLote([pago], deps)));
  const { clasificacion, motivo } = await deps.clasificador.clasificar(pago, deps.tenantId, { venta });

  if (clasificacion === "NO_FACTURABLE") {
    await deps.reconciliacion.marcarNoFacturable(pago.id, motivo);
    resumen.noFacturables++;
    return;
  }
  if (clasificacion === "REVISAR") {
    await deps.reconciliacion.marcarRevisar(pago.id, motivo);
    resumen.aRevisar++;
    return;
  }

  // FACTURABLE → emitir, con manejo de rechazo (terminal) vs error transitorio.
  try {
    const invoiceId = await deps.facturar(pago, deps.tenantId);
    if (invoiceId) {
      await deps.reconciliacion.marcarFacturado(pago.id, invoiceId);
      resumen.facturados++;
    } else {
      // null = no se pudo, sin excepción: se trata como transitorio.
      await registrarFalloTransitorio(pago, "facturación devolvió null", deps, resumen);
    }
  } catch (err) {
    const retriable = !(err instanceof ErrorFacturacion) || err.retriable;
    const motivo = err instanceof Error ? err.message : String(err);
    if (!retriable) {
      await deps.reconciliacion.marcarRechazado(pago.id, motivo);
      resumen.rechazados++;
      return;
    }
    await registrarFalloTransitorio(pago, motivo, deps, resumen);
  }
}

/** Registra un fallo transitorio; tras `maxIntentos` escala a REVISAR (humano). */
async function registrarFalloTransitorio(
  pago: PagoMP,
  motivo: string,
  deps: IngestaDeps,
  resumen: ResumenIngesta,
): Promise<void> {
  const intentos = await deps.reconciliacion.marcarError(pago.id, motivo);
  if (intentos >= (deps.maxIntentos ?? MAX_INTENTOS_DEFAULT)) {
    await deps.reconciliacion.marcarRevisar(pago.id, `Falló ${intentos} intentos: ${motivo}`);
    resumen.aRevisar++;
  } else {
    resumen.errores++;
  }
}

/**
 * Backfill: pagina TODO el historial de la cuenta (desde/hasta), clasifica y
 * factura cada venta. Re-ejecutarlo no duplica (idempotente).
 */
export async function sincronizarPagos(
  deps: IngestaDeps,
  criterio: CriterioBusqueda = {},
): Promise<ResumenIngesta> {
  const resumen: ResumenIngesta = {
    leidos: 0,
    facturados: 0,
    noFacturables: 0,
    aRevisar: 0,
    rechazados: 0,
    saltados: 0,
    errores: 0,
  };

  let cursor = criterio.cursor;
  do {
    const pagina = await deps.client.listPayments({ ...criterio, cursor });
    // Las referencias de la página, resueltas en un solo viaje a la base (no uno por pago).
    const resueltas = await resolverLote(pagina.pagos, deps);
    for (const pago of pagina.pagos) {
      resumen.leidos++;
      await facturarPagoSiCorresponde(pago, deps, resumen, resueltas);
    }
    cursor = pagina.nextCursor;
  } while (cursor);

  return resumen;
}
