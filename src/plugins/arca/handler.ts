/**
 * Orquestación del plugin ARCA: el flujo de punta a punta de una autorización.
 *
 *   InvoiceCreated (Core, superficie III)
 *     → construir comprobante (mapeo a catálogo ARCA)
 *     → validar local (fallar barato, no contra ARCA)
 *     → solicitar CAE (AfipClient: WSAA + WSFEv1)
 *     → RegisterFiscalDocument (Core, superficie II)
 *
 * El plugin no toca la DB ni el Core directo: recibe un evento y llama un
 * comando, ambos por el contrato de `core-contract.ts` (ADR-002/020/022).
 */

import { AfipClient, ResultadoCae } from './afip/port';
import { InvoiceCreatedEvent, RegisterFiscalDocument } from './core-contract';
import { construirComprobante } from './domain/comprobante';
import { validarComprobante } from './domain/validacion';

export interface HandlerDeps {
  /**
   * Resuelve el cliente de ARCA del tenant (sus credenciales/CUIT). En dev/test
   * devuelve un `StubAfipClient`; en producción, el adapter real con el
   * certificado del tenant. El plugin es tenant-agnóstico: pide, no resuelve.
   */
  clientePara: (tenantId: string) => AfipClient | Promise<AfipClient>;
  /** Comando público del Core que registra el CAE (superficie II). */
  registrar: RegisterFiscalDocument;
}

/** Error de validación previa (antes de pegarle a ARCA). */
export class ComprobanteInvalidoError extends Error {
  constructor(
    message: string,
    readonly errores: { campo: string; mensaje: string }[],
  ) {
    super(message);
    this.name = 'ComprobanteInvalidoError';
  }
}

/**
 * Procesa un evento `InvoiceCreated`: autoriza el comprobante en ARCA y devuelve
 * el CAE al Core. Devuelve el resultado para trazabilidad/logging del worker.
 */
export async function procesarInvoiceCreated(
  ev: InvoiceCreatedEvent,
  deps: HandlerDeps,
): Promise<ResultadoCae> {
  const comp = construirComprobante(ev);

  const validacion = validarComprobante(comp);
  if (!validacion.ok) {
    throw new ComprobanteInvalidoError(
      `Comprobante de la factura ${ev.invoiceId} inválido; no se envía a ARCA.`,
      validacion.errores,
    );
  }

  const cliente = await deps.clientePara(ev.tenantId);
  const resultado = await cliente.solicitarCae(comp);

  await deps.registrar({
    invoiceId: ev.invoiceId,
    tenantId: ev.tenantId,
    cae: resultado.cae,
    caeVencimiento: resultado.caeVencimiento,
    numero: resultado.numero,
    puntoVenta: resultado.puntoVenta,
    tipoComprobante: resultado.tipo,
  });

  return resultado;
}
