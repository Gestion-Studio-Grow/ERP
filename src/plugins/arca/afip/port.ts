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
}
