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
  /**
   * Sólo Responsable Inscripto: la clase A que le asignó ARCA (RG 1575): "A", "A_CON_LEYENDA"
   * o "M". Sin el dato ninguna A sale sola (va a revisión). El Core todavía no lo guarda
   * (columna a crear, ver BACKLOG): hoy ningún camino emite como Responsable Inscripto.
   */
  regimenFacturaA?: string | null;
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
  /**
   * ENG-024 · `true` sólo si el desglose de IVA salió de la alícuota de cada producto. Sin el
   * dato (o `false`) es una tasa pareja sobre el total, y un Responsable Inscripto no emite así.
   */
  ivaPorProducto?: boolean;
  /** Fechas de servicio (`AAAAMMDD`), requeridas si el concepto incluye servicios. */
  servicioDesde?: string;
  servicioHasta?: string;
  vencimientoPago?: string;
  /** Importe exento (ImpOpEx) y no gravado (ImpTotConc). Sin dato: no hay. En Factura C, 0. */
  importeExento?: number;
  importeNoGravado?: number;
  /** Default: factura. Nota de crédito o débito, con lo que corrige. */
  clase?: 'factura' | 'nota_debito' | 'nota_credito';
  /** Nota de crédito o débito: la factura que corrige (CbtesAsoc). Fecha AAAAMMDD. */
  asociado?: { cbteTipo: number; puntoVenta: number; numero: number; fecha: string } | null;
  /** Nota de crédito o débito por período (PeriodoAsoc), en vez de una factura. AAAAMMDD. */
  periodoAsociado?: { desde: string; hasta: string; letra?: 'A' | 'B' | 'C' | 'M' | null } | null;
  /**
   * ENG-020 · El número que un envío anterior de ESTE evento le pidió a ARCA. Si está, antes
   * de pedir otro CAE se consulta ese número: si ARCA ya lo autorizó para este comprobante, se
   * adopta (la respuesta se había perdido) y no se emite un segundo comprobante.
   */
  intentoArca?: IntentoArca;
}

/** ENG-020 · Número pedido a ARCA, anotado ANTES de mandar el pedido. */
export interface IntentoArca {
  puntoVenta: number;
  tipo: number;
  numero: number;
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

/**
 * ENG-020 · Consulta pública del Core: ¿ese número (punto de venta, tipo, número) ya lo tiene
 * registrado OTRA factura del negocio? Si sí, el comprobante que ARCA muestra con ese número es
 * de esa otra venta (aunque los datos coincidan: dos ventas iguales a consumidor final el mismo
 * día) y el plugin no lo adopta.
 */
export type NumeroUsadoPorOtraFactura = (
  consulta: IntentoArca & { tenantId: string; invoiceId: string },
) => Promise<boolean>;
