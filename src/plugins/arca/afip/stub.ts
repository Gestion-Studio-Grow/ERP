/**
 * ADAPTER stub: implementa AfipClient en memoria. Permite testear todo el flujo
 * de emisión (validación → numeración → CAE) sin certificado ni red. NO es
 * válido fiscalmente; es solo para dev/test. Ver ADR-022 §5.
 */

import { TipoComprobante } from '../domain/catalogos';
import { ComprobanteArca, ivaInformadoAArca } from '../domain/comprobante';
import { validarComprobante } from '../domain/validacion';
import { centavosDe } from '@/lib/dinero/redondeo';
import {
  AfipClient,
  ArcaRechazoError,
  ComprobanteConsultado,
  EmisorConfig,
  ResultadoCae,
} from './port';

/** Clave de numeración: un contador por (puntoVenta, tipo). */
function clave(puntoVenta: number, tipo: TipoComprobante): string {
  return `${puntoVenta}:${tipo}`;
}

export class StubAfipClient implements AfipClient {
  private contadores = new Map<string, number>();
  /** Lo autorizado, por `puntoVenta:tipo:numero`, para `consultarComprobante` (ENG-020). */
  private autorizados = new Map<string, ComprobanteConsultado>();

  /**
   * @param config  emisor (se usa solo para simular; `homologacion` se ignora).
   * @param genCae  generador de CAE determinístico inyectable (para tests).
   * @param ultimoEmitido  el último número que el negocio YA tiene autorizado para ese punto de
   *   venta y tipo (lo guardado en la base). ARCA recuerda lo que autorizó; un stub nuevo por
   *   pedido no: sin esto, cada factura del modo prueba volvía a pedir el número 1 (QA 26/09) y
   *   la segunda chocaba con la primera. Sin pasarlo, el stub cuenta sólo en memoria (tests).
   */
  constructor(
    private readonly config: EmisorConfig,
    private readonly genCae: (comp: ComprobanteArca, numero: number) => string = (
      _comp,
      numero,
    ) => `STUB${String(numero).padStart(8, '0')}`,
    private readonly ultimoEmitido?: (puntoVenta: number, tipo: TipoComprobante) => Promise<number>,
  ) {}

  async ultimoAutorizado(
    puntoVenta: number,
    tipo: TipoComprobante,
  ): Promise<number> {
    const enMemoria = this.contadores.get(clave(puntoVenta, tipo)) ?? 0;
    const guardado = this.ultimoEmitido ? await this.ultimoEmitido(puntoVenta, tipo) : 0;
    return Math.max(enMemoria, guardado);
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
    const ultimo = await this.ultimoAutorizado(comp.puntoVenta, comp.tipo);
    const numero = comp.numero ?? ultimo + 1;

    if (numero !== ultimo + 1) {
      throw new ArcaRechazoError('Numeración no correlativa.', [
        { codigo: 10016, mensaje: `Esperado ${ultimo + 1}, recibido ${numero}.` },
      ]);
    }
    this.contadores.set(k, numero);

    const cae = this.genCae(comp, numero);
    const caeVencimiento = comp.fecha; // el stub no calcula vencimiento real
    this.autorizados.set(`${k}:${numero}`, {
      puntoVenta: comp.puntoVenta,
      tipo: comp.tipo,
      numero,
      cae,
      caeVencimiento,
      fecha: comp.fecha,
      docTipo: comp.docTipo,
      docNro: comp.docNro,
      totalCentavos: centavosDe(comp.total),
      netoCentavos: centavosDe(comp.neto),
      ivaCentavos: centavosDe(ivaInformadoAArca(comp)),
      concepto: comp.concepto,
    });
    return { cae, caeVencimiento, numero, puntoVenta: comp.puntoVenta, tipo: comp.tipo };
  }

  async consultarComprobante(
    puntoVenta: number,
    tipo: TipoComprobante,
    numero: number,
  ): Promise<ComprobanteConsultado | null> {
    return this.autorizados.get(`${clave(puntoVenta, tipo)}:${numero}`) ?? null;
  }
}
