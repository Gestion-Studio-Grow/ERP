/**
 * Código QR de ARCA/AFIP para la representación impresa del comprobante
 * (RG 4291). Obligatorio en la factura impresa/PDF: codifica un JSON en base64
 * embebido en la URL oficial de verificación.
 *
 * Dominio PURO: arma el payload, lo codifica y devuelve la URL. NO genera la
 * imagen del QR (eso es del render del PDF, fuera del plugin) ni toca I/O.
 * Zona de-sesgo ESTÁNDAR (ADR-046): campos y formato exactos según la
 * especificación oficial del QR.
 */

/** Base de la URL oficial de verificación de comprobantes (RG 4291). */
export const URL_QR_AFIP = 'https://www.afip.gob.ar/fe/qr/';

/**
 * Datos mínimos del comprobante AUTORIZADO para el QR. Los nombres del payload
 * los fija ARCA; acá se reciben en el dominio del plugin y se mapean.
 */
export interface DatosQrAfip {
  /** Fecha del comprobante en formato ARCA `AAAAMMDD`. */
  fecha: string;
  /** CUIT del emisor. */
  cuit: number;
  puntoVenta: number;
  /** Tipo de comprobante ARCA (`TipoComprobante`). */
  tipoComprobante: number;
  /** Número correlativo autorizado. */
  numero: number;
  /** Importe total del comprobante. */
  importe: number;
  /** Tipo de documento del receptor (`TipoDocumento`). */
  tipoDocReceptor: number;
  /** Número de documento del receptor (0 si consumidor final sin identificar). */
  nroDocReceptor: number;
  /** CAE (Código de Autorización Electrónico). */
  cae: string;
}

/** Payload del QR tal como lo define ARCA (RG 4291). Los nombres son los oficiales. */
export interface PayloadQrAfip {
  ver: number;
  fecha: string; // AAAA-MM-DD
  cuit: number;
  ptoVta: number;
  tipoCmp: number;
  nroCmp: number;
  importe: number;
  moneda: string;
  ctz: number;
  tipoDocRec: number;
  nroDocRec: number;
  tipoCodAut: string; // "E" = CAE
  codAut: number; // CAE como número
}

/** Convierte una fecha `AAAAMMDD` al formato `AAAA-MM-DD` que pide el QR. */
function fechaConGuiones(aaaammdd: string): string {
  if (!/^\d{8}$/.test(aaaammdd)) {
    throw new Error(`Fecha inválida para el QR (se esperaba AAAAMMDD): ${aaaammdd}`);
  }
  return `${aaaammdd.slice(0, 4)}-${aaaammdd.slice(4, 6)}-${aaaammdd.slice(6, 8)}`;
}

/** Arma el payload JSON del QR (RG 4291) a partir de los datos del comprobante. */
export function payloadQrAfip(d: DatosQrAfip): PayloadQrAfip {
  return {
    ver: 1,
    fecha: fechaConGuiones(d.fecha),
    cuit: d.cuit,
    ptoVta: d.puntoVenta,
    tipoCmp: d.tipoComprobante,
    nroCmp: d.numero,
    importe: d.importe,
    moneda: 'PES',
    ctz: 1,
    tipoDocRec: d.tipoDocReceptor,
    nroDocRec: d.nroDocReceptor,
    tipoCodAut: 'E',
    codAut: Number(d.cae),
  };
}

/** Codifica el payload del QR en base64 (JSON → base64), como pide ARCA. */
export function base64QrAfip(payload: PayloadQrAfip): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');
}

/**
 * URL oficial de verificación del comprobante para embeber en el QR impreso
 * (`https://www.afip.gob.ar/fe/qr/?p=<json_base64>`). Es lo que se convierte en
 * imagen QR al renderizar el PDF.
 */
export function urlQrAfip(d: DatosQrAfip): string {
  const p = base64QrAfip(payloadQrAfip(d));
  return `${URL_QR_AFIP}?p=${p}`;
}
