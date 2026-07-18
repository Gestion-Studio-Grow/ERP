/**
 * Catálogos oficiales de ARCA (ex-AFIP) usados por WSFEv1.
 * Conocimiento ARCA-específico: mapear el dominio del Core a estos códigos es
 * responsabilidad del plugin. Dominio puro (sin I/O, sin framework).
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
 * Código ARCA de la "Condición Frente al IVA del receptor" (campo
 * `CondicionIVAReceptorId` de WSFEv1). OBLIGATORIO desde la RG 5616 (2024): sin
 * este campo, ARCA rechaza el comprobante con la observación 10246. Códigos del
 * método `FEParamGetCondicionIvaReceptor`.
 */
export enum CondicionIvaReceptorId {
  ResponsableInscripto = 1,
  SujetoExento = 4,
  ConsumidorFinal = 5,
  ResponsableMonotributo = 6,
  SujetoNoCategorizado = 7,
  MonotributistaSocial = 13,
  IvaNoAlcanzado = 15,
}

/** Mapea la condición de IVA del dominio al código ARCA del receptor (RG 5616). */
export function condicionIvaReceptorArca(c: CondicionIva): CondicionIvaReceptorId {
  switch (c) {
    case CondicionIva.ResponsableInscripto:
      return CondicionIvaReceptorId.ResponsableInscripto;
    case CondicionIva.Monotributo:
      return CondicionIvaReceptorId.ResponsableMonotributo;
    case CondicionIva.Exento:
      return CondicionIvaReceptorId.SujetoExento;
    case CondicionIva.ConsumidorFinal:
      return CondicionIvaReceptorId.ConsumidorFinal;
  }
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
 * Tipo de FACTURA que corresponde según la condición del emisor y el receptor.
 * Mapeo a la catalogación de ARCA (por eso vive en el plugin):
 *  - Monotributo / Exento  → Factura C.
 *  - Responsable Inscripto → A si el receptor es RI; B en caso contrario.
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

/** ¿El comprobante discrimina IVA? Solo los tipo A. */
export function discriminaIva(tipo: TipoComprobante): boolean {
  return (
    tipo === TipoComprobante.FacturaA ||
    tipo === TipoComprobante.NotaDebitoA ||
    tipo === TipoComprobante.NotaCreditoA
  );
}

/**
 * ¿El comprobante INFORMA IVA en el payload de WSFEv1 (ImpIVA + array `<Iva>`)?
 *
 * Tanto Factura **A** como **B** lo informan: ambos salen de un emisor Responsable
 * Inscripto, así que WSFEv1 exige `ImpNeto` + `ImpIVA` + el bloque `<Iva>` con
 * `ImpTotal = ImpNeto + ImpIVA`. La diferencia entre A y B es solo si el IVA se
 * MUESTRA discriminado al receptor en el impreso (`discriminaIva`, regla del
 * receptor-CUIT) — NO el payload que se manda a ARCA. Solo **C** (emisor
 * Monotributo/Exento) no informa IVA (manda el importe en `ImpNeto`, sin `<Iva>`).
 *
 * ⚠️ Bug latente que cierra: usar `discriminaIva` (solo A) para armar el `<Iva>`
 * dejaba la Factura B sin bloque de IVA y con `ImpIVA=0` → `ImpTotal ≠ ImpNeto`,
 * y ARCA la rechazaba. Emitir el `<Iva>` para A **y** B lo corrige.
 */
export function informaIvaWsfe(tipo: TipoComprobante): boolean {
  return (
    tipo === TipoComprobante.FacturaA ||
    tipo === TipoComprobante.NotaDebitoA ||
    tipo === TipoComprobante.NotaCreditoA ||
    tipo === TipoComprobante.FacturaB ||
    tipo === TipoComprobante.NotaDebitoB ||
    tipo === TipoComprobante.NotaCreditoB
  );
}
