/**
 * Comprobante normalizado que el plugin le pasa al cliente de ARCA.
 * Se CONSTRUYE a partir del evento `InvoiceCreated` del Core — los montos vienen
 * calculados; el plugin mapea, elige el tipo de comprobante (catálogo ARCA) y
 * arma la forma que el WS espera. NO calcula IVA (ADR-006).
 */

import { InvoiceCreatedEvent } from '../core-contract';
import { sumarAlCentavo } from '@/lib/dinero/redondeo';
import {
  decidirComprobante,
  type ComprobanteDecidido,
  type Decision,
  type Motivo,
  type Naturaleza,
} from '@/lib/fiscal/decidir-comprobante';
import {
  AlicuotaIvaId,
  CondicionIvaReceptorId,
  Concepto,
  TipoComprobante,
  TipoDocumento,
  informaIvaWsfe,
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
  /**
   * Condición frente al IVA del receptor (código ARCA). OBLIGATORIO desde la
   * RG 5616 — sin este campo ARCA rechaza con la observación 10246.
   */
  condicionIvaReceptorId?: CondicionIvaReceptorId;
  /** ImpOpEx e ImpTotConc: lo exento y lo no gravado. Sin dato, 0. En Factura C, 0. */
  importeExento?: number;
  importeNoGravado?: number;
  /** Nota de crédito o débito: la factura que corrige (CbtesAsoc). Nunca junto con el período. */
  asociado?: { tipo: number; puntoVenta: number; numero: number; fecha: string };
  /** Nota de crédito o débito por período (PeriodoAsoc). AAAAMMDD. Nunca junto con `asociado`. */
  periodoAsociado?: { desde: string; hasta: string };
  /** Leyendas que el impreso tiene que llevar (ej. RG 5003/2021 en la A a monotributista). */
  leyendas?: { codigo: string; texto: string | null; norma: string }[];
  /** Trazabilidad hacia el Core. */
  invoiceId: string;
  tenantId: string;
}

/** Concepto de ARCA (1, 2, 3) → qué se vendió, para la decisión. Otro valor: no se adivina. */
const NATURALEZA: Readonly<Record<number, Naturaleza>> = {
  [Concepto.Productos]: 'productos',
  [Concepto.Servicios]: 'servicios',
  [Concepto.ProductosYServicios]: 'productos_y_servicios',
};

/**
 * La decisión fiscal única (src/lib/fiscal/decidir-comprobante.ts) aplicada al evento del Core:
 * letra y tipo, CondicionIVAReceptorId, documento, concepto y fechas, comprobante asociado.
 * `fechaDeEnvio` (AAAAMMDD) es el día en que se pide el CAE: con ella se controla la ventana de
 * fechas que acepta ARCA. Pura: no mira el reloj. Las fechas del servicio salen de acá: si
 * faltan, no se inventan (exigirPeriodoDeServicio).
 */
export function decidirDelEvento(ev: InvoiceCreatedEvent, fechaDeEnvio: string): Decision {
  return decidirComprobante(
    {
      condicionIva: ev.emisor.condicionIva,
      cuit: ev.emisor.cuit,
      regimenFacturaA: ev.emisor.regimenFacturaA ?? null,
    },
    {
      condicionIva: ev.receptor.condicionIva,
      docTipo: ev.receptor.docTipo,
      docNro: ev.receptor.docNro,
    },
    {
      clase: ev.clase ?? 'factura',
      fecha: ev.fecha,
      fechaDeEnvio,
      importeTotal: ev.total,
      naturaleza: NATURALEZA[ev.concepto] ?? null,
      servicio: {
        desde: ev.servicioDesde ?? null,
        hasta: ev.servicioHasta ?? null,
        vencimientoPago: ev.vencimientoPago ?? null,
      },
      asociado: ev.asociado
        ? {
            cbteTipo: ev.asociado.cbteTipo,
            puntoVenta: ev.asociado.puntoVenta,
            numero: ev.asociado.numero,
            fecha: ev.asociado.fecha,
          }
        : null,
      periodoAsociado: ev.periodoAsociado ?? null,
    },
    // El despacho emite sin una persona mirando: un período de servicio que falta NO se
    // completa con la fecha de la factura (sería un período falso), va a revisión.
    { exigirPeriodoDeServicio: true },
  );
}

/** La decisión no dejó un comprobante para emitir: los motivos dicen por qué y cómo seguir. */
export class ComprobanteSinDecisionError extends Error {
  constructor(
    readonly motivos: Motivo[],
    readonly estado: Decision['estado'],
  ) {
    const bloqueantes = motivos.filter((m) => m.gravedad !== 'aviso');
    super(
      bloqueantes.length > 0
        ? bloqueantes.map((m) => m.mensaje).join(' ')
        : 'La decisión fiscal no dejó un comprobante para emitir.',
    );
    this.name = 'ComprobanteSinDecisionError';
  }
}

/**
 * Arma el `ComprobanteArca` con lo que resolvió la decisión (tipo, condición, documento,
 * concepto, fechas, asociado) y los montos que el Core ya calculó (ADR-006: acá no se hacen
 * cuentas de IVA).
 */
export function comprobanteDeLaDecision(
  ev: InvoiceCreatedEvent,
  d: ComprobanteDecidido,
): ComprobanteArca {
  return {
    invoiceId: ev.invoiceId,
    tenantId: ev.tenantId,
    puntoVenta: ev.emisor.puntoVenta,
    tipo: d.cbteTipo as TipoComprobante,
    concepto: d.concepto as Concepto,
    docTipo: d.docTipo as TipoDocumento,
    docNro: d.docNro,
    condicionIvaReceptorId: d.condicionIvaReceptorId as CondicionIvaReceptorId,
    fecha: d.cbteFch,
    neto: ev.neto,
    iva: ev.iva.map((s) => ({
      id: s.alicuotaId as AlicuotaIvaId,
      baseImponible: s.base,
      importe: s.importe,
    })),
    total: ev.total,
    importeExento: ev.importeExento ?? 0,
    importeNoGravado: ev.importeNoGravado ?? 0,
    servicioDesde: d.fchServDesde,
    servicioHasta: d.fchServHasta,
    vencimientoPago: d.fchVtoPago,
    ...(d.asociado
      ? {
          asociado: {
            tipo: d.asociado.cbteTipo,
            puntoVenta: d.asociado.puntoVenta,
            numero: d.asociado.numero,
            fecha: d.asociado.cbteFch,
          },
        }
      : {}),
    ...(d.periodoAsociado ? { periodoAsociado: { ...d.periodoAsociado } } : {}),
    leyendas: d.leyendas.map((l) => ({ codigo: l.codigo, texto: l.texto, norma: l.norma })),
  };
}

/**
 * Construye el `ComprobanteArca` que se puede emitir SIN que nadie mire: sólo si la decisión
 * quedó "lista". Si quedó en revisión o bloqueada, lanza `ComprobanteSinDecisionError` con los
 * motivos (identificar al comprador, cargar la clase A, fecha fuera de la ventana…).
 * `fechaDeEnvio`: el día en que se pide el CAE (AAAAMMDD); sin él, el día del comprobante.
 */
export function construirComprobante(
  ev: InvoiceCreatedEvent,
  fechaDeEnvio: string = ev.fecha,
): ComprobanteArca {
  const decision = decidirDelEvento(ev, fechaDeEnvio);
  if (decision.estado !== 'lista' || !decision.comprobante) {
    throw new ComprobanteSinDecisionError(decision.motivos, decision.estado);
  }
  return comprobanteDeLaDecision(ev, decision.comprobante);
}

/** Suma de importes de IVA del comprobante, al centavo: el mismo número que viaja como ImpIVA (ENG-109). */
export function totalIva(comp: ComprobanteArca): number {
  return sumarAlCentavo(comp.iva.map((x) => x.importe));
}

/**
 * ENG-020 · El ImpIVA que viaja a ARCA en `FECAESolicitar`: la suma de las alícuotas al centavo
 * en los tipos que informan IVA (A y B), 0 en los que no (C). Una sola regla para armar el pedido
 * (`soap.ts`) y para reconocer, en la consulta del reintento, que el comprobante es éste.
 */
export function ivaInformadoAArca(comp: ComprobanteArca): number {
  return informaIvaWsfe(comp.tipo) ? totalIva(comp) : 0;
}
