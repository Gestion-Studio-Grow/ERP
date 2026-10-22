/**
 * PORT: contrato del cliente de ARCA. El plugin habla contra esta interface,
 * nunca contra SOAP. Adapters: real (WSAA+WSFEv1, pendiente) y stub (memoria).
 * Ver ADR-022.
 */

import { TipoComprobante } from '../domain/catalogos';
import { ComprobanteArca } from '../domain/comprobante';

/** Configuración/credenciales del emisor. Los secretos entran acá, no al repo. */
export interface EmisorConfig {
  /** CUIT del emisor (por tenant). */
  cuit: number;
  /** true = homologación (testing ARCA); false = producción. */
  homologacion: boolean;
}

/** Resultado de una solicitud de CAE exitosa. */
export interface ResultadoCae {
  cae: string;
  /** Vencimiento del CAE, formato `AAAAMMDD`. */
  caeVencimiento: string;
  numero: number;
  puntoVenta: number;
  tipo: TipoComprobante;
}

/** Observación/error devuelto por ARCA. */
export interface ObservacionArca {
  codigo: number;
  mensaje: string;
}

/** El comprobante fue rechazado por ARCA (o por la validación previa). */
export class ArcaRechazoError extends Error {
  constructor(
    message: string,
    readonly observaciones: ObservacionArca[],
  ) {
    super(message);
    this.name = 'ArcaRechazoError';
  }
}

/**
 * ENG-021 · Error que no depende del comprobante: ARCA no contestó a tiempo, contestó con una
 * falla interna (5xx), el token no sirvió, WSAA está caído o la respuesta llegó cortada. La
 * factura NO se rechaza: queda pendiente y se reintenta. Si la respuesta se perdió después de
 * que ARCA autorizó, el reintento lo descubre consultando (ENG-020) y no pide otro CAE.
 */
export class ArcaPasajeroError extends Error {
  /**
   * Motor de facturación · el servicio de ARCA que no contestó (host de WSAA o WSFEv1), cuando la
   * falla es del servicio entero (sin red, sin respuesta a tiempo, HTTP que no es 2xx) y no del
   * comprobante. Lo usa el interruptor por servicio (`interruptor.ts`). Vacío: la falla es pasajera
   * pero ARCA sí contestó (600 token, 10016, 501 interno…).
   */
  readonly servicioCaido?: string;

  constructor(
    message: string,
    readonly observaciones: ObservacionArca[] = [],
    options?: { cause?: unknown; servicioCaido?: string },
  ) {
    super(message, options);
    this.name = 'ArcaPasajeroError';
    this.servicioCaido = options?.servicioCaido;
  }
}

/**
 * Motor de facturación · el interruptor del servicio está ABIERTO (ARCA viene cayéndose): no se
 * mandó nada. No es culpa del comprobante ni cuenta como intento: el envío se pospone hasta que
 * el interruptor deje probar de nuevo (`reabreEn`).
 */
export class ArcaNoDisponibleError extends ArcaPasajeroError {
  constructor(
    readonly servicio: string,
    readonly reabreEn: Date,
  ) {
    super(
      `ARCA (${servicio}) viene sin responder: no se le manda nada hasta las ` +
        `${reabreEn.toISOString()} (interruptor abierto). El comprobante sigue pendiente.`,
      [],
      { servicioCaido: servicio },
    );
    this.name = 'ArcaNoDisponibleError';
  }
}

/**
 * ENG-020 · Un comprobante que ARCA ya tiene autorizado, tal como lo devuelve
 * `FECompConsultar`. Sirve para reconocer el propio cuando la respuesta se perdió.
 */
export interface ComprobanteConsultado {
  puntoVenta: number;
  tipo: TipoComprobante;
  numero: number;
  /** El CAE (`CodAutorizacion`). */
  cae: string;
  /** Vencimiento del CAE (`FchVto`), `AAAAMMDD`. */
  caeVencimiento: string;
  fecha: string;
  docTipo: number;
  docNro: number;
  /** `ImpTotal` en centavos enteros (leído del texto, sin pasar por float). */
  totalCentavos: number;
  /** `ImpNeto` en centavos enteros. */
  netoCentavos: number;
  /** `ImpIVA` en centavos enteros. */
  ivaCentavos: number;
  concepto: number;
}

/**
 * Cliente de ARCA. Un adapter lo implementa contra los web services reales
 * (WSAA + WSFEv1); el stub lo implementa en memoria para dev/test.
 */
export interface AfipClient {
  /** Último número autorizado para (puntoVenta, tipo). Base de la numeración. */
  ultimoAutorizado(puntoVenta: number, tipo: TipoComprobante): Promise<number>;

  /**
   * Solicita el CAE para un comprobante. Si `comp.numero` viene vacío, resuelve
   * el correlativo con `ultimoAutorizado + 1`. Lanza `ArcaRechazoError` si ARCA
   * lo rechaza.
   */
  solicitarCae(comp: ComprobanteArca): Promise<ResultadoCae>;

  /**
   * ENG-020 · El comprobante (puntoVenta, tipo, numero) tal como lo tiene ARCA, o `null` si
   * ARCA no lo tiene autorizado. Lanza `ArcaPasajeroError` si no se pudo averiguar: en ese
   * caso NO se puede pedir otro CAE.
   */
  consultarComprobante(
    puntoVenta: number,
    tipo: TipoComprobante,
    numero: number,
  ): Promise<ComprobanteConsultado | null>;
}
