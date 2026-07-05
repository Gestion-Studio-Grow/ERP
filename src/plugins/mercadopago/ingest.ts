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

/** Factura un pago MP y devuelve el `invoiceId` (o null si no se pudo). */
export type FacturarPagoMP = (pago: PagoMP, tenantId: string) => Promise<string | null>;

export interface IngestaDeps {
  tenantId: string;
  client: MercadoPagoClient;
  /** Clasificador de ingresos (§12.1): decide qué se factura. */
  clasificador: ClasificadorPort;
  reconciliacion: ReconciliacionPort;
  facturar: FacturarPagoMP;
}

export interface ResumenIngesta {
  leidos: number;
  facturados: number;
  noFacturables: number; // clasificados como NO_FACTURABLE (transferencias, etc.)
  aRevisar: number; // REVISAR: esperan decisión humana (panel/WhatsApp)
  saltados: number; // ya procesados antes (idempotencia)
  errores: number; // fallo transitorio (reintentable)
}

/** Procesa un único pago (usado por el webhook y por el backfill). Idempotente. */
export async function facturarPagoSiCorresponde(
  pago: PagoMP,
  deps: IngestaDeps,
  resumen: ResumenIngesta,
): Promise<void> {
  if (await deps.reconciliacion.yaProcesado(pago.id)) {
    resumen.saltados++;
    return;
  }

  // Clasificación (§12.1): entre ingesta y facturación. No se factura a ciegas.
  const { clasificacion, motivo } = await deps.clasificador.clasificar(pago, deps.tenantId);

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

  // FACTURABLE → emitir.
  try {
    const invoiceId = await deps.facturar(pago, deps.tenantId);
    if (invoiceId) {
      await deps.reconciliacion.marcarFacturado(pago.id, invoiceId);
      resumen.facturados++;
    } else {
      await deps.reconciliacion.marcarError(pago.id, "facturación devolvió null");
      resumen.errores++;
    }
  } catch (err) {
    await deps.reconciliacion.marcarError(pago.id, err instanceof Error ? err.message : String(err));
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
    saltados: 0,
    errores: 0,
  };

  let cursor = criterio.cursor;
  do {
    const pagina = await deps.client.listPayments({ ...criterio, cursor });
    for (const pago of pagina.pagos) {
      resumen.leidos++;
      await facturarPagoSiCorresponde(pago, deps, resumen);
    }
    cursor = pagina.nextCursor;
  } while (cursor);

  return resumen;
}
