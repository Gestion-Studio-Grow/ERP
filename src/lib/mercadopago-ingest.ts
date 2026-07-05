/**
 * Glue Core de la ingesta de Mercado Pago (ADR-025 §2/§12/§8) — SIMULADO.
 *
 * Une las DOS fuentes en el MISMO camino idempotente: el webhook (pago
 * acreditado en tiempo real) y el backfill (historial) comparten conciliación y
 * aprendizaje por tenant, así ver un pago por los dos lados NO duplica la factura.
 *
 * Hoy arma un entorno con stubs (cliente MP simulado + facturación contra el
 * stub de ARCA con CAE). Para producción se cambian los stubs por: el cliente MP
 * real (credenciales OAuth por tenant), la conciliación en DB (unique por
 * payment_id) y `facturarPagoMP` (createInvoice). El resto del flujo no cambia.
 */

import {
  StubMercadoPagoClient,
  ClasificadorPorReglas,
  ReconciliacionEnMemoria,
  AprendizajeEnMemoria,
  sincronizarPagos,
  facturarPagoSiCorresponde,
  type IngestaDeps,
  type ResumenIngesta,
  type CriterioBusqueda,
  type ConfigClasificacion,
} from "@/plugins/mercadopago";
import { crearFacturarConArcaStub, type FacturaSimulada } from "@/lib/mercadopago-simulador";

export interface EntornoIngesta {
  deps: IngestaDeps;
  reconciliacion: ReconciliacionEnMemoria;
  aprendizaje: AprendizajeEnMemoria;
  client: StubMercadoPagoClient;
  facturas: FacturaSimulada[];
}

function resumenVacio(): ResumenIngesta {
  return { leidos: 0, facturados: 0, noFacturables: 0, aRevisar: 0, rechazados: 0, saltados: 0, errores: 0 };
}

/**
 * Arma un entorno de ingesta simulado por tenant: conciliación + aprendizaje
 * compartidos entre webhook y backfill. `config` es la config de clasificación
 * del comercio (cuentas propias, reglas extra).
 */
export function crearEntornoSimulado(tenantId: string, config?: ConfigClasificacion): EntornoIngesta {
  const reconciliacion = new ReconciliacionEnMemoria();
  const aprendizaje = new AprendizajeEnMemoria();
  const client = new StubMercadoPagoClient();
  const facturas: FacturaSimulada[] = [];
  const deps: IngestaDeps = {
    tenantId,
    client,
    clasificador: new ClasificadorPorReglas({ config, aprendizaje }),
    reconciliacion,
    facturar: crearFacturarConArcaStub(tenantId, facturas),
  };
  return { deps, reconciliacion, aprendizaje, client, facturas };
}

/**
 * Webhook: llega una notificación de pago acreditado; se verifica contra MP
 * (getPayment), se clasifica y se factura si corresponde. Idempotente y compartido
 * con el backfill vía la conciliación del entorno.
 */
export async function procesarWebhookPago(
  entorno: EntornoIngesta,
  paymentId: string,
): Promise<ResumenIngesta> {
  const resumen = resumenVacio();
  const pago = await entorno.client.getPayment(paymentId);
  resumen.leidos++;
  await facturarPagoSiCorresponde(pago, entorno.deps, resumen);
  return resumen;
}

/** Backfill: sincroniza todo el historial de la cuenta por el mismo camino. */
export async function sincronizarHistorico(
  entorno: EntornoIngesta,
  criterio: CriterioBusqueda = {},
): Promise<ResumenIngesta> {
  return sincronizarPagos(entorno.deps, criterio);
}
