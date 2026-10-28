/**
 * Motor de facturación · INTERRUPTOR POR SERVICIO DE ARCA ("circuit breaker").
 *
 * Cuando WSAA o WSFEv1 se caen, seguir mandando comprobantes sólo suma cortes de 15 s por envío,
 * gasta la función serverless y le insiste a un servicio que no está. El interruptor cuenta las
 * caídas SEGUIDAS de cada servicio (host): con `umbral` seguidas se ABRE y nadie le manda nada
 * durante `enfriamientoMs`; pasado ese tiempo deja pasar UNA prueba (medio abierto): si contesta,
 * se cierra; si vuelve a caer, se abre de nuevo con el doble de espera (hasta `enfriamientoTopeMs`).
 *
 * Qué cuenta como caída: sólo la del SERVICIO (sin red, sin respuesta a tiempo, HTTP que no es
 * 2xx). Un rechazo del comprobante o un error pasajero con respuesta (600, 10016, 501) NO: ARCA
 * contestó. Lo marca el transporte (`FetchSoapTransport`).
 *
 * Alcance: vive en la memoria del proceso (una instancia caliente de la función). No hay tabla:
 * la protección entre procesos la dan la espera creciente por envío (`proximoIntentoEn`) y el
 * corte del despacho apenas el interruptor se abre. Un interruptor compartido entre instancias
 * es una tabla nueva (decisión del dueño, ver docs/producto/motor-facturacion/DIAGNOSTICO.md).
 *
 * Reloj inyectable: PURO salvo por el `Map` de estado; testeable sin esperar.
 */

export type EstadoInterruptor = 'cerrado' | 'abierto' | 'medio_abierto';

export interface OpcionesInterruptor {
  /** Caídas seguidas que lo abren. Default 3. */
  umbral?: number;
  /** Primera espera con el interruptor abierto. Default 2 minutos. */
  enfriamientoMs?: number;
  /** Tope de la espera (se duplica en cada reapertura). Default 15 minutos. */
  enfriamientoTopeMs?: number;
  /** Reloj. Default `Date.now`. */
  ahora?: () => number;
}

interface EstadoDelServicio {
  caidasSeguidas: number;
  abiertoHasta: number | null;
  enfriamientoActual: number;
  probando: boolean;
}

export class InterruptorArca {
  private readonly umbral: number;
  private readonly enfriamientoMs: number;
  private readonly enfriamientoTopeMs: number;
  private readonly ahora: () => number;
  private readonly servicios = new Map<string, EstadoDelServicio>();

  constructor(opciones: OpcionesInterruptor = {}) {
    this.umbral = opciones.umbral ?? 3;
    this.enfriamientoMs = opciones.enfriamientoMs ?? 2 * 60_000;
    this.enfriamientoTopeMs = opciones.enfriamientoTopeMs ?? 15 * 60_000;
    this.ahora = opciones.ahora ?? Date.now;
  }

  private de(servicio: string): EstadoDelServicio {
    let e = this.servicios.get(servicio);
    if (!e) {
      e = { caidasSeguidas: 0, abiertoHasta: null, enfriamientoActual: this.enfriamientoMs, probando: false };
      this.servicios.set(servicio, e);
    }
    return e;
  }

  estado(servicio: string): EstadoInterruptor {
    const e = this.servicios.get(servicio);
    if (!e || e.abiertoHasta === null) return 'cerrado';
    return this.ahora() < e.abiertoHasta ? 'abierto' : 'medio_abierto';
  }

  /** Hasta cuándo no se manda nada (sólo con el interruptor abierto). */
  reabreEn(servicio: string): Date | null {
    const e = this.servicios.get(servicio);
    return e?.abiertoHasta != null ? new Date(e.abiertoHasta) : null;
  }

  /**
   * ¿Se puede llamar ahora? Cerrado: sí. Abierto: no. Medio abierto: una sola prueba a la vez
   * (la primera que pregunta la toma; las demás esperan su resultado).
   */
  permitir(servicio: string): boolean {
    const estado = this.estado(servicio);
    if (estado === 'cerrado') return true;
    if (estado === 'abierto') return false;
    const e = this.de(servicio);
    if (e.probando) return false;
    e.probando = true;
    return true;
  }

  /** El servicio contestó: se cierra y se olvidan las caídas. */
  registrarExito(servicio: string): void {
    const e = this.servicios.get(servicio);
    if (!e) return;
    e.caidasSeguidas = 0;
    e.abiertoHasta = null;
    e.enfriamientoActual = this.enfriamientoMs;
    e.probando = false;
  }

  /** El servicio no contestó: suma una caída; con el umbral (o en la prueba) se abre. */
  registrarCaida(servicio: string): void {
    const e = this.de(servicio);
    const eraPrueba = e.probando || (e.abiertoHasta !== null && this.ahora() >= e.abiertoHasta);
    e.caidasSeguidas++;
    e.probando = false;
    if (eraPrueba) {
      e.enfriamientoActual = Math.min(e.enfriamientoActual * 2, this.enfriamientoTopeMs);
      e.abiertoHasta = this.ahora() + e.enfriamientoActual;
    } else if (e.caidasSeguidas >= this.umbral) {
      e.abiertoHasta = this.ahora() + e.enfriamientoActual;
    }
  }
}

/** El interruptor del proceso: lo comparten todos los clientes SOAP reales de esta instancia. */
export const INTERRUPTOR_ARCA = new InterruptorArca();

/** El servicio de una URL de ARCA: su host (`wsaahomo.afip.gov.ar`, `servicios1.afip.gov.ar`…). */
export function servicioDeUrl(url: string): string {
  try {
    return new URL(url).host || url;
  } catch {
    return url;
  }
}
