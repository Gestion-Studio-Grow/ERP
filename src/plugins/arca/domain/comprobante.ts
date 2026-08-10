/**
 * Comprobante normalizado que el plugin le pasa al cliente de ARCA.
 * Se CONSTRUYE a partir del evento `InvoiceCreated` del Core — los montos vienen
 * calculados; el plugin mapea, elige el tipo de comprobante (vía la política por
 * contribuyente) y arma la forma que el WS espera. NO calcula IVA (ADR-006).
 */

import { ComprobanteAsociado, InvoiceCreatedEvent } from '../core-contract';
import {
  AlicuotaIvaId,
  Concepto,
  CondicionIvaReceptor,
  TipoComprobante,
  TipoDocumento,
  condicionReceptorId,
} from './catalogos';
import { comprobantePara } from './politica-contribuyente';

/** Subtotal de IVA por alícuota, como lo espera WSFEv1 (`Iva[]`). */
export interface SubtotalIva {
  id: AlicuotaIvaId;
  baseImponible: number;
  importe: number;
}

/**
 * Comprobante listo para solicitar CAE. `numero` es opcional: si falta, el
 * cliente lo resuelve con `FECompUltimoAutorizado + 1` (ADR-022 §6).
 */
export interface ComprobanteArca {
  puntoVenta: number;
  tipo: TipoComprobante;
  concepto: Concepto;
  docTipo: TipoDocumento;
  docNro: number;
  /**
   * Condición de IVA del receptor codificada para ARCA (`CondicionIVAReceptorId`,
   * RG 5616). Se informa SIEMPRE; ARCA rechaza el comprobante si falta.
   */
  condicionReceptorId: CondicionIvaReceptor;
  /** Fecha del comprobante, formato ARCA `AAAAMMDD`. */
  fecha: string;
  /** Montos calculados por el Core. */
  neto: number;
  iva: SubtotalIva[];
  total: number;
  /** Requeridas si el concepto incluye servicios. Formato `AAAAMMDD`. */
  servicioDesde?: string;
  servicioHasta?: string;
  vencimientoPago?: string;
  /** Correlativo. Si se omite, lo resuelve el cliente contra ARCA. */
  numero?: number;
  /**
   * Comprobante(s) origen que esta nota de crédito corrige (`CbtesAsoc`).
   * Presente solo si `tipo` es una nota de crédito.
   */
  comprobantesAsociados?: ComprobanteAsociado[];
  /** Trazabilidad hacia el Core. */
  invoiceId: string;
  tenantId: string;
}

/**
 * Construye el `ComprobanteArca` a partir del evento del Core.
 * Aplica la política por contribuyente para elegir el tipo (factura o nota de
 * crédito, clase A/B/C/M) y traslada los montos que el Core ya calculó. No hace
 * cuentas de IVA (ADR-006).
 */
export function construirComprobante(ev: InvoiceCreatedEvent): ComprobanteArca {
  const tipo = comprobantePara({
    emisor: ev.emisor.condicionIva,
    receptor: ev.receptor.condicionIva,
    operacion: ev.operacion,
    emisorRiesgoFiscal: ev.emisorRiesgoFiscal,
  });

  return {
    invoiceId: ev.invoiceId,
    tenantId: ev.tenantId,
    puntoVenta: ev.emisor.puntoVenta,
    tipo,
    concepto: ev.concepto as Concepto,
    docTipo: ev.receptor.docTipo as TipoDocumento,
    docNro: ev.receptor.docNro,
    condicionReceptorId: condicionReceptorId(ev.receptor.condicionIva),
    fecha: ev.fecha,
    neto: ev.neto,
    iva: ev.iva.map((s) => ({
      id: s.alicuotaId as AlicuotaIvaId,
      baseImponible: s.base,
      importe: s.importe,
    })),
    total: ev.total,
    servicioDesde: ev.servicioDesde,
    servicioHasta: ev.servicioHasta,
    vencimientoPago: ev.vencimientoPago,
    comprobantesAsociados: ev.comprobanteAsociado
      ? [ev.comprobanteAsociado]
      : undefined,
  };
}

/** Suma de importes de IVA del comprobante. */
export function totalIva(comp: ComprobanteArca): number {
  return comp.iva.reduce((s, x) => s + x.importe, 0);
}
