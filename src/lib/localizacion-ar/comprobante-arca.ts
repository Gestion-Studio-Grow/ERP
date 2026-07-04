// Catálogo de códigos de ARCA para armar la solicitud de WSFEv1 (mapeos puros del
// Core, ADR-006). El conector solo traduce estos códigos al SOAP; no decide nada.
import type {
  TipoComprobante,
  TipoDocReceptor,
} from "@/generated/prisma/client";

// CbteTipo de WSFEv1 (tabla FEParamGetTiposCbte).
const CBTE_TIPO: Record<TipoComprobante, number> = {
  FACTURA_A: 1,
  FACTURA_B: 6,
  FACTURA_C: 11,
  NOTA_CREDITO_B: 8,
  NOTA_CREDITO_C: 13,
};

export function codigoCbteTipo(tipo: TipoComprobante): number {
  return CBTE_TIPO[tipo];
}

// DocTipo del receptor (tabla FEParamGetTiposDoc): 80 CUIT, 86 CUIL, 96 DNI,
// 99 consumidor final / sin identificar.
const DOC_TIPO: Record<TipoDocReceptor, number> = {
  CUIT: 80,
  CUIL: 86,
  DNI: 96,
  CONSUMIDOR_FINAL: 99,
};

export function codigoDocTipoReceptor(tipoDoc: TipoDocReceptor): number {
  return DOC_TIPO[tipoDoc];
}

// Moneda: peso argentino con cotización 1 (WSFEv1 MonId / MonCotiz).
export const MONEDA_PES = { monId: "PES", monCotiz: 1 } as const;

// Concepto de WSFEv1: 1 productos, 2 servicios, 3 ambos. Estética = servicios.
export const CONCEPTO = { PRODUCTOS: 1, SERVICIOS: 2, AMBOS: 3 } as const;

// Formatea el identificador impreso del comprobante: "0001-00000123".
export function formatearNumeroComprobante(
  puntoVenta: number,
  nroComprobante: number,
): string {
  return `${String(puntoVenta).padStart(4, "0")}-${String(nroComprobante).padStart(8, "0")}`;
}
