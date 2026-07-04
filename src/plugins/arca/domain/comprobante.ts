/**
 * Comprobante normalizado que el plugin le pasa al cliente de ARCA.
 * Se CONSTRUYE a partir del evento `InvoiceCreated` del Core — los montos vienen
 * calculados; el plugin mapea, elige el tipo de comprobante (catálogo ARCA) y
 * arma la forma que el WS espera. NO calcula IVA (ADR-006).
 */

import { InvoiceCreatedEvent } from '../core-contract';
import {
  AlicuotaIvaId,
  Concepto,
  TipoComprobante,
  TipoDocumento,
  tipoFacturaCorrespondiente,
} from './catalogos';

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
  /** Trazabilidad hacia el Core. */
  invoiceId: string;
  tenantId: string;
}

/**
 * Construye el `ComprobanteArca` a partir del evento del Core.
 * Mapea condición→tipo de comprobante (catálogo ARCA) y traslada los montos
 * que el Core ya calculó. No hace cuentas de IVA.
 */
export function construirComprobante(ev: InvoiceCreatedEvent): ComprobanteArca {
  const tipo = tipoFacturaCorrespondiente(
    ev.emisor.condicionIva,
    ev.receptor.condicionIva,
  );

  return {
    invoiceId: ev.invoiceId,
    tenantId: ev.tenantId,
    puntoVenta: ev.emisor.puntoVenta,
    tipo,
    concepto: ev.concepto as Concepto,
    docTipo: ev.receptor.docTipo as TipoDocumento,
    docNro: ev.receptor.docNro,
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
  };
}

/** Suma de importes de IVA del comprobante. */
export function totalIva(comp: ComprobanteArca): number {
  return comp.iva.reduce((s, x) => s + x.importe, 0);
}
