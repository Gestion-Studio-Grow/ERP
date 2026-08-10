/**
 * Catálogos oficiales de ARCA (ex-AFIP) usados por WSFEv1.
 * Conocimiento ARCA-específico: mapear el dominio del Core a estos códigos es
 * responsabilidad del plugin. Dominio puro (sin I/O, sin framework).
 *
 * Zona de-sesgo ESTÁNDAR (ADR-046): los códigos son fiscales, exactos y
 * verificables contra el manual del desarrollador de ARCA (COMPG v4.0) —
 * ninguna "personalidad", solo precisión.
 */

/** Tipo de comprobante (campo `CbteTipo` de WSFEv1). */
export enum TipoComprobante {
  FacturaA = 1,
  NotaDebitoA = 2,
  NotaCreditoA = 3,
  FacturaB = 6,
  NotaDebitoB = 7,
  NotaCreditoB = 8,
  FacturaC = 11,
  NotaDebitoC = 12,
  NotaCreditoC = 13,
  /**
   * Factura M (51/52/53): la emite un Responsable Inscripto habilitado a "A"
   * pero marcado en riesgo fiscal o sin CBU informado. Discrimina IVA como la A,
   * pero el receptor puede retener IVA/Ganancias. Modelada por completitud; el
   * flujo por defecto emite A (ver `politica-contribuyente.ts`).
   */
  FacturaM = 51,
  NotaDebitoM = 52,
  NotaCreditoM = 53,
}

/** Tipo de documento del receptor (campo `DocTipo`). */
export enum TipoDocumento {
  CUIT = 80,
  CUIL = 86,
  DNI = 96,
  /** Consumidor final sin identificar. */
  ConsumidorFinal = 99,
}

/** Concepto del comprobante (campo `Concepto`). */
export enum Concepto {
  Productos = 1,
  Servicios = 2,
  ProductosYServicios = 3,
}

/** Identificador de alícuota de IVA (campo `Iva.Id`). */
export enum AlicuotaIvaId {
  Cero = 3, // 0%
  DiezCinco = 4, // 10,5%
  VeintiUno = 5, // 21%
  VeintiSiete = 6, // 27%
  Cinco = 8, // 5%
  DosCinco = 9, // 2,5%
}

/** Condición del contribuyente frente al IVA (emisor o receptor). */
export enum CondicionIva {
  ResponsableInscripto = 'RESPONSABLE_INSCRIPTO',
  Monotributo = 'MONOTRIBUTO',
  Exento = 'EXENTO',
  ConsumidorFinal = 'CONSUMIDOR_FINAL',
}

/**
 * Condición de IVA del receptor tal como la codifica ARCA en el campo
 * `CondicionIVAReceptorId` (RG 5616/2024, tabla `FEParamGetCondicionIvaReceptor`).
 * OBLIGATORIO en WSFEv1 desde la RG 5616 — su omisión hace que ARCA rechace el
 * comprobante. Se informa SIEMPRE (clases A, B, C, M).
 *
 * Códigos usados por el ERP (subconjunto de la tabla oficial). El resto
 * (No Categorizado=7, Exterior=8/9, Liberado Ley 19.640=10, etc.) se agrega
 * cuando un caso lo requiera.
 */
export enum CondicionIvaReceptor {
  ResponsableInscripto = 1,
  SujetoExento = 4,
  ConsumidorFinal = 5,
  ResponsableMonotributo = 6,
}

/**
 * Porcentaje (0..1) de cada alícuota. Referencia para **verificar** los montos
 * que manda el Core (no para calcularlos — el cálculo vive en el Core, ADR-006).
 */
export const PORCENTAJE_IVA: Record<AlicuotaIvaId, number> = {
  [AlicuotaIvaId.Cero]: 0,
  [AlicuotaIvaId.DiezCinco]: 0.105,
  [AlicuotaIvaId.VeintiUno]: 0.21,
  [AlicuotaIvaId.VeintiSiete]: 0.27,
  [AlicuotaIvaId.Cinco]: 0.05,
  [AlicuotaIvaId.DosCinco]: 0.025,
};

/** Moneda pesos argentinos (campo `MonId`). Default del MVP. */
export const MONEDA_PESOS = 'PES';

/** Conceptos que exigen informar fechas de servicio. */
export function conceptoRequiereFechasServicio(c: Concepto): boolean {
  return c === Concepto.Servicios || c === Concepto.ProductosYServicios;
}

/**
 * Traduce la condición de IVA del receptor (dominio del Core) al código de ARCA
 * `CondicionIVAReceptorId` (RG 5616). El plugin es dueño de este mapeo (es
 * conocimiento ARCA-específico), igual que el mapeo condición→tipo de comprobante.
 */
export function condicionReceptorId(cond: CondicionIva): CondicionIvaReceptor {
  switch (cond) {
    case CondicionIva.ResponsableInscripto:
      return CondicionIvaReceptor.ResponsableInscripto;
    case CondicionIva.Exento:
      return CondicionIvaReceptor.SujetoExento;
    case CondicionIva.Monotributo:
      return CondicionIvaReceptor.ResponsableMonotributo;
    case CondicionIva.ConsumidorFinal:
      return CondicionIvaReceptor.ConsumidorFinal;
    default:
      throw new Error(`Condición de IVA del receptor desconocida: ${cond}`);
  }
}

/**
 * Tipo de FACTURA que corresponde según la condición del emisor y el receptor.
 * Mapeo a la catalogación de ARCA (por eso vive en el plugin):
 *  - Monotributo / Exento  → Factura C (nunca discrimina IVA).
 *  - Responsable Inscripto → A solo si el receptor es RI; B en todo otro caso
 *    (Consumidor Final, Monotributo y Exento reciben B, RG 1415 Anexo IV).
 *
 * Nota fiscal (zona ESTÁNDAR): el Monotributista **receptor** recibe B, no A —
 * no computa crédito fiscal. La Factura M (RI en riesgo fiscal) se resuelve en
 * `politica-contribuyente.ts`, no acá.
 */
export function tipoFacturaCorrespondiente(
  emisor: CondicionIva,
  receptor: CondicionIva,
): TipoComprobante {
  switch (emisor) {
    case CondicionIva.Monotributo:
    case CondicionIva.Exento:
      return TipoComprobante.FacturaC;
    case CondicionIva.ResponsableInscripto:
      return receptor === CondicionIva.ResponsableInscripto
        ? TipoComprobante.FacturaA
        : TipoComprobante.FacturaB;
    default:
      throw new Error(`Condición de emisor no puede emitir facturas: ${emisor}`);
  }
}

/**
 * ¿El comprobante DISCRIMINA IVA en la representación impresa? Solo las clases A
 * y M. Es un concepto de IMPRESIÓN (qué ve el receptor), NO de qué se informa al
 * web service. Se usa para exigir CUIT del receptor (A/M) — no para armar el
 * payload de IVA. Ojo: la B **no discrimina impreso** pero **sí informa IVA al
 * WS** (ver `comprobanteLlevaIva`).
 */
export function discriminaIva(tipo: TipoComprobante): boolean {
  return (
    tipo === TipoComprobante.FacturaA ||
    tipo === TipoComprobante.NotaDebitoA ||
    tipo === TipoComprobante.NotaCreditoA ||
    tipo === TipoComprobante.FacturaM ||
    tipo === TipoComprobante.NotaDebitoM ||
    tipo === TipoComprobante.NotaCreditoM
  );
}

/** ¿El comprobante es clase C (Monotributo/Exento)? */
export function esClaseC(tipo: TipoComprobante): boolean {
  return (
    tipo === TipoComprobante.FacturaC ||
    tipo === TipoComprobante.NotaDebitoC ||
    tipo === TipoComprobante.NotaCreditoC
  );
}

/**
 * ¿El comprobante INFORMA IVA al web service (ImpIVA + array `Iva`)? Las clases
 * A, B y M (emisor Responsable Inscripto) SÍ — aunque la B no lo discrimine en el
 * impreso, fiscalmente contiene IVA y ARCA lo exige en el payload. La clase C
 * (Monotributo/Exento) NO informa IVA. Distinto de `discriminaIva` (impresión).
 */
export function comprobanteLlevaIva(tipo: TipoComprobante): boolean {
  return !esClaseC(tipo);
}

/**
 * Nota de CRÉDITO que corresponde a un comprobante origen, respetando su clase
 * (A→3, B→8, C→13, M→53). Una nota de crédito "sigue la clase" de la factura que
 * corrige (regla fiscal + buena práctica del benchmark). Lanza si el tipo origen
 * no es una factura conocida.
 */
export function tipoNotaCreditoPara(tipoFactura: TipoComprobante): TipoComprobante {
  switch (tipoFactura) {
    case TipoComprobante.FacturaA:
      return TipoComprobante.NotaCreditoA;
    case TipoComprobante.FacturaB:
      return TipoComprobante.NotaCreditoB;
    case TipoComprobante.FacturaC:
      return TipoComprobante.NotaCreditoC;
    case TipoComprobante.FacturaM:
      return TipoComprobante.NotaCreditoM;
    default:
      throw new Error(
        `No hay nota de crédito definida para el comprobante ${tipoFactura}.`,
      );
  }
}

/** ¿El tipo es una nota de crédito (clase A/B/C/M)? */
export function esNotaCredito(tipo: TipoComprobante): boolean {
  return (
    tipo === TipoComprobante.NotaCreditoA ||
    tipo === TipoComprobante.NotaCreditoB ||
    tipo === TipoComprobante.NotaCreditoC ||
    tipo === TipoComprobante.NotaCreditoM
  );
}
