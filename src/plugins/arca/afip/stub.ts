/**
 * ADAPTER stub: implementa AfipClient en memoria. Permite testear todo el flujo
 * de emisión (validación → numeración → CAE) sin certificado ni red. NO es
 * válido fiscalmente; es solo para dev/test. Ver ADR-022 §5.
 */

import { TipoComprobante } from '../domain/catalogos';
import { ComprobanteArca } from '../domain/comprobante';
import { validarComprobante } from '../domain/validacion';
import {
  AfipClient,
  ArcaRechazoError,
  EmisorConfig,
  ResultadoCae,
} from './port';

/** Clave de numeración: un contador por (puntoVenta, tipo). */
function clave(puntoVenta: number, tipo: TipoComprobante): string {
  return `${puntoVenta}:${tipo}`;
}

export class StubAfipClient implements AfipClient {
  private contadores = new Map<string, number>();

  /**
   * @param config  emisor (se usa solo para simular; `homologacion` se ignora).
   * @param genCae  generador de CAE determinístico inyectable (para tests).
   */
  constructor(
    private readonly config: EmisorConfig,
    private readonly genCae: (comp: ComprobanteArca, numero: number) => string = (
      _comp,
      numero,
    ) => `STUB${String(numero).padStart(8, '0')}`,
  ) {}

  async ultimoAutorizado(
    puntoVenta: number,
    tipo: TipoComprobante,
  ): Promise<number> {
    return this.contadores.get(clave(puntoVenta, tipo)) ?? 0;
  }

  async solicitarCae(comp: ComprobanteArca): Promise<ResultadoCae> {
    const validacion = validarComprobante(comp);
    if (!validacion.ok) {
      throw new ArcaRechazoError(
        'Comprobante inválido (rechazado por validación local del stub).',
        validacion.errores.map((e, i) => ({
          codigo: 1000 + i,
          mensaje: `${e.campo}: ${e.mensaje}`,
        })),
      );
    }

    const k = clave(comp.puntoVenta, comp.tipo);
    const ultimo = this.contadores.get(k) ?? 0;
    const numero = comp.numero ?? ultimo + 1;

    if (numero !== ultimo + 1) {
      throw new ArcaRechazoError('Numeración no correlativa.', [
        { codigo: 10016, mensaje: `Esperado ${ultimo + 1}, recibido ${numero}.` },
      ]);
    }
    this.contadores.set(k, numero);

    return {
      cae: this.genCae(comp, numero),
      caeVencimiento: comp.fecha, // el stub no calcula vencimiento real
      numero,
      puntoVenta: comp.puntoVenta,
      tipo: comp.tipo,
    };
  }
}
