/**
 * Ingesta de pagos de Mercado Pago (ADR-025). Algoritmo PURO y testeable: no
 * toca la DB ni la red directo — recibe el cliente MP, el registro de
 * conciliación y el comando de facturación por inyección. Las dos fuentes
 * (backfill histórico y webhook) convergen acá; la idempotencia por `payment_id`
 * garantiza que ver un pago dos veces no genere dos facturas.
 */

import { CriterioBusqueda, MercadoPagoClient, PagoMP } from "./port";
import { ReconciliacionPort } from "./reconciliation";

/** Factura un pago MP y devuelve el `invoiceId` (o null si no se pudo). */
export type FacturarPagoMP = (pago: PagoMP, tenantId: string) => Promise<string | null>;

export interface IngestaDeps {
  tenantId: string;
  client: MercadoPagoClient;
  reconciliacion: ReconciliacionPort;
  facturar: FacturarPagoMP;
}

export interface ResumenIngesta {
  leidos: number;
  facturados: number;
  saltados: number; // ya facturados antes (idempotencia) o no aprobados
  errores: number;
}

/** Procesa un único pago (usado por el webhook y por el backfill). Idempotente. */
export async function facturarPagoSiCorresponde(
  pago: PagoMP,
  deps: IngestaDeps,
  resumen: ResumenIngesta,
): Promise<void> {
  if (pago.estado !== "approved") {
    resumen.saltados++;
    return;
  }
  if (await deps.reconciliacion.yaFacturado(pago.id)) {
    resumen.saltados++;
    return;
  }
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
 * Backfill: pagina TODO el historial de la cuenta (desde/hasta) y factura cada
 * pago acreditado que no esté ya facturado. Re-ejecutarlo no duplica (idempotente).
 */
export async function sincronizarPagos(
  deps: IngestaDeps,
  criterio: CriterioBusqueda = {},
): Promise<ResumenIngesta> {
  const resumen: ResumenIngesta = { leidos: 0, facturados: 0, saltados: 0, errores: 0 };

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
