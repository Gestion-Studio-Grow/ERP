/**
 * Contrato del plugin ARCA con el Core (superficies II y III de ADR-020).
 *
 * Este archivo es la ÚNICA vista que el plugin tiene del Core: tipos, no código.
 * NO importa nada del Core (`src/lib/*`). Cuando el lado Core exista (modelo
 * Invoice + outbox + comando `RegisterFiscalDocument`, ver ADR-022 §5), quien lo
 * construya implementa estas formas. Hasta entonces el plugin compila y se
 * testea contra ellas sin acoplarse al Core.
 */

import { CondicionIva } from './domain/catalogos';

/** Desglose de IVA calculado por el Core (el plugin NO lo calcula, ADR-006). */
export interface SubtotalIvaCore {
  /** Id de alícuota de ARCA (ver `AlicuotaIvaId`). */
  alicuotaId: number;
  /** Base imponible de esa alícuota. */
  base: number;
  /** Importe de IVA de esa alícuota, ya calculado por el Core. */
  importe: number;
}

/** Datos del emisor tal como el Core los conoce (por tenant). */
export interface EmisorEvento {
  cuit: number;
  condicionIva: CondicionIva;
  puntoVenta: number;
}

/** Datos del receptor tal como el Core los conoce. */
export interface ReceptorEvento {
  /** Código de tipo de documento de ARCA (`TipoDocumento`). */
  docTipo: number;
  docNro: number;
  condicionIva: CondicionIva;
}

/**
 * Superficie III — Core → Plugin.
 * Evento `InvoiceCreated` que el Core emite (vía outbox) cuando nace una
 * factura. Trae los montos YA calculados; el plugin solo autoriza.
 */
export interface InvoiceCreatedEvent {
  invoiceId: string;
  tenantId: string;
  /** Código de concepto de ARCA (`Concepto`). */
  concepto: number;
  /** Fecha del comprobante, formato ARCA `AAAAMMDD`. */
  fecha: string;
  emisor: EmisorEvento;
  receptor: ReceptorEvento;
  /** Neto total (suma de bases), calculado por el Core. */
  neto: number;
  /** Desglose de IVA por alícuota, calculado por el Core. */
  iva: SubtotalIvaCore[];
  /** Total del comprobante (neto + IVA), calculado por el Core. */
  total: number;
  /** Fechas de servicio (`AAAAMMDD`), requeridas si el concepto incluye servicios. */
  servicioDesde?: string;
  servicioHasta?: string;
  vencimientoPago?: string;
}

/**
 * Superficie II — Plugin → Core.
 * Input del comando público `RegisterFiscalDocument`: el plugin se lo pasa al
 * Core con el CAE en mano. El Core lo persiste; el plugin nunca escribe la DB.
 */
export interface RegisterFiscalDocumentInput {
  invoiceId: string;
  tenantId: string;
  cae: string;
  /** Vencimiento del CAE, formato `AAAAMMDD`. */
  caeVencimiento: string;
  numero: number;
  puntoVenta: number;
  /** Código de tipo de comprobante de ARCA (`TipoComprobante`). */
  tipoComprobante: number;
}

/**
 * Firma del comando público del Core que el plugin invoca. La implementación
 * real (Server Action de la capability Factura) se inyecta al handler; el
 * plugin depende solo de esta firma.
 */
export type RegisterFiscalDocument = (
  input: RegisterFiscalDocumentInput,
) => Promise<void>;
