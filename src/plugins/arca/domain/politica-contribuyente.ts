/**
 * Motor de POLÍTICA FISCAL por TIPO DE CONTRIBUYENTE.
 *
 * El corazón de la visión del dueño: "las acciones en ARCA DEPENDEN DEL TIPO DE
 * CONTRIBUYENTE — más o menos pasos según el caso". Este módulo es la fuente de
 * verdad, en CÓDIGO, de la matriz de acciones-por-contribuyente:
 *
 *   emisor (condición IVA) × receptor (condición IVA) × operación
 *        → tipo de comprobante ARCA · discrimina IVA · requisitos del receptor
 *
 * Dominio PURO (sin I/O). El resto del plugin (comprobante, validación, adapter
 * SOAP) DERIVA de acá — no reimplementa la matriz. Zona de-sesgo ESTÁNDAR:
 * reglas fiscales exactas (ADR-046), verificables contra RG 1415 / RG 5616.
 */

import {
  AlicuotaIvaId,
  CondicionIva,
  TipoComprobante,
  discriminaIva,
  esNotaCredito,
  tipoFacturaCorrespondiente,
  tipoNotaCreditoPara,
} from './catalogos';

/** Operación fiscal sobre una venta. */
export type Operacion = 'FACTURA' | 'NOTA_CREDITO';

/** Clase de comprobante que el emisor emite como base (A/B/C/M). */
export type ClaseComprobante = 'A' | 'B' | 'C' | 'M';

/**
 * Política de emisión de un tipo de contribuyente EMISOR. Describe QUÉ hace ARCA
 * para ese contribuyente: qué clases puede emitir, si discrimina IVA, la alícuota
 * por defecto de sus operaciones gravadas y los PASOS del flujo (para el backoffice
 * y el Consultor de Proceso, ADR-035). "Más pasos" = RI (elige A/B según receptor,
 * discrimina IVA); "menos pasos" = Monotributo/Exento (siempre C, sin IVA).
 */
export interface PoliticaContribuyente {
  emisor: CondicionIva;
  /** Clases que este emisor está habilitado a emitir. */
  clasesHabilitadas: ClaseComprobante[];
  /** ¿La clase que emite discrimina IVA en el comprobante? (A/M sí; B/C no). */
  discriminaIva: boolean;
  /** ¿La clase de comprobante depende de la condición del receptor? (solo RI). */
  dependeDelReceptor: boolean;
  /** Alícuota por defecto de las operaciones gravadas de este emisor. */
  alicuotaDefault: AlicuotaIvaId;
  /** Pasos del flujo fiscal para este contribuyente (criollo claro, para la UI). */
  pasos: string[];
}

const POLITICAS: Record<CondicionIva, PoliticaContribuyente> = {
  [CondicionIva.ResponsableInscripto]: {
    emisor: CondicionIva.ResponsableInscripto,
    clasesHabilitadas: ['A', 'B', 'M'],
    discriminaIva: true,
    dependeDelReceptor: true,
    alicuotaDefault: AlicuotaIvaId.VeintiUno,
    pasos: [
      'Mirar la condición de IVA del cliente',
      'Si el cliente es Responsable Inscripto → Factura A (o M si el emisor está en riesgo fiscal); si no → Factura B',
      'Separar el neto y el IVA (21% por defecto) y discriminarlo en el comprobante',
      'Informar la condición de IVA del receptor (RG 5616)',
      'Pedir el CAE a ARCA y numerar en la serie del punto de venta',
    ],
  },
  [CondicionIva.Monotributo]: {
    emisor: CondicionIva.Monotributo,
    clasesHabilitadas: ['C'],
    discriminaIva: false,
    dependeDelReceptor: false,
    alicuotaDefault: AlicuotaIvaId.Cero,
    pasos: [
      'Siempre Factura C (el monotributista no discrimina IVA)',
      'El total va sin desglose de IVA (alícuota 0%)',
      'Informar la condición de IVA del receptor (RG 5616)',
      'Pedir el CAE a ARCA y numerar en la serie del punto de venta',
    ],
  },
  [CondicionIva.Exento]: {
    emisor: CondicionIva.Exento,
    clasesHabilitadas: ['C'],
    discriminaIva: false,
    dependeDelReceptor: false,
    alicuotaDefault: AlicuotaIvaId.Cero,
    pasos: [
      'Siempre Factura C (el sujeto exento no genera crédito fiscal)',
      'El total va sin desglose de IVA (alícuota 0%)',
      'Informar la condición de IVA del receptor (RG 5616)',
      'Pedir el CAE a ARCA y numerar en la serie del punto de venta',
    ],
  },
  // Consumidor Final no es un emisor válido: no factura. Se incluye para
  // exhaustividad del Record; `politicaDe` lo rechaza explícitamente.
  [CondicionIva.ConsumidorFinal]: {
    emisor: CondicionIva.ConsumidorFinal,
    clasesHabilitadas: [],
    discriminaIva: false,
    dependeDelReceptor: false,
    alicuotaDefault: AlicuotaIvaId.Cero,
    pasos: [],
  },
};

/** Devuelve la política del contribuyente EMISOR. Lanza si no puede facturar. */
export function politicaDe(emisor: CondicionIva): PoliticaContribuyente {
  if (emisor === CondicionIva.ConsumidorFinal) {
    throw new Error(
      'Un Consumidor Final no puede emitir comprobantes: no es un emisor válido.',
    );
  }
  return POLITICAS[emisor];
}

/** Entrada para resolver el comprobante concreto de una operación. */
export interface ContextoComprobante {
  emisor: CondicionIva;
  receptor: CondicionIva;
  /** FACTURA (default) o NOTA_CREDITO (reversa de una factura). */
  operacion?: Operacion;
  /**
   * RI marcado en riesgo fiscal / sin CBU informado: emite M en lugar de A.
   * Default false. No aplica a B/C.
   */
  emisorRiesgoFiscal?: boolean;
}

/**
 * Resuelve el tipo de comprobante ARCA concreto para una operación, aplicando la
 * matriz de contribuyente de punta a punta:
 *  1. clase base según emisor×receptor (`tipoFacturaCorrespondiente`);
 *  2. si el emisor RI está en riesgo fiscal y correspondería A → M;
 *  3. si la operación es NOTA_CREDITO → la NC de esa clase (A→3, B→8, C→13, M→53).
 */
export function comprobantePara(ctx: ContextoComprobante): TipoComprobante {
  // Valida que el emisor pueda facturar.
  politicaDe(ctx.emisor);

  let factura = tipoFacturaCorrespondiente(ctx.emisor, ctx.receptor);

  // Riesgo fiscal: el RI que emitiría A pasa a M.
  if (ctx.emisorRiesgoFiscal && factura === TipoComprobante.FacturaA) {
    factura = TipoComprobante.FacturaM;
  }

  return ctx.operacion === 'NOTA_CREDITO'
    ? tipoNotaCreditoPara(factura)
    : factura;
}

/**
 * ¿La clase del comprobante exige un receptor identificado con CUIT? Las clases A
 * y M sí (operación entre inscriptos); B y C admiten Consumidor Final. Se deriva
 * de `discriminaIva` (misma regla fiscal), no se duplica.
 */
export function receptorRequiereCuit(tipo: TipoComprobante): boolean {
  return discriminaIva(tipo);
}

/** ¿La operación es una reversa (nota de crédito)? Útil para el flujo del Core. */
export function esOperacionReversa(tipo: TipoComprobante): boolean {
  return esNotaCredito(tipo);
}

/** Todas las políticas (para docs/UI: la matriz por contribuyente renderizable). */
export function todasLasPoliticas(): PoliticaContribuyente[] {
  return [
    politicaDe(CondicionIva.ResponsableInscripto),
    politicaDe(CondicionIva.Monotributo),
    politicaDe(CondicionIva.Exento),
  ];
}
