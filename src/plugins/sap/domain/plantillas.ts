/**
 * Planillas de carga masiva para SAP S/4HANA Cloud Public Edition (modo Archivo). Plan §10.1.
 *
 * ⚠ [A VALIDAR] Los ENCABEZADOS son los nombres técnicos relevados en el frente SAP, NO una copia de
 * la plantilla oficial. Antes de la primera carga se validan contra la plantilla real que se baja del
 * arrendatario del cliente (en el frente SAP ya pasó que un archivo escrito por código diera error al
 * subirlo). También a validar: formato de fecha (acá AAAA-MM-DD) y largos de los textos.
 *
 * Las cancelaciones NO son una planilla de carga: la carga masiva de asientos trabaja sólo con cuentas
 * de mayor, así que en modo Archivo la cancelación de cada factura contra la cuenta puente es una
 * INSTRUCCIÓN para Tesorería (compensación manual en SAP). En modo API va por Journal Entry – Post.
 */

import type {
  AltaProveedorPendiente,
  AsientoSap,
  CancelacionFacturaSap,
  FacturaProveedorSap,
  FechaISO,
} from "../core-contract";
import { importeCsv } from "./csv";

/** Largos de texto de SAP [A VALIDAR contra la plantilla]: texto de cabecera 25, de posición 50. */
const LARGO_TEXTO_CABECERA = 25;
const LARGO_TEXTO_POSICION = 50;

/**
 * Texto libre seguro para la planilla: sin caracteres de fórmula al principio (=, +, -, @, tab, CR;
 * una razón social leída de una foto no tiene que poder ejecutar nada en Excel) y cortado al largo.
 */
export function textoSeguro(v: string, largo?: number): string {
  const limpio = v.replace(/^[=+\-@\t\r\s]+/, "");
  return largo === undefined ? limpio : limpio.slice(0, largo);
}

/** Fecha para la planilla. [A VALIDAR]: la plantilla del arrendatario puede pedir AAAAMMDD. */
function fechaSap(f: FechaISO): string {
  return f;
}

export const ENCABEZADO_FACTURAS = [
  "ID_FACTURA",
  "COMPANYCODE",
  "ACCOUNTINGDOCUMENTTYPE",
  "DOCUMENTDATE",
  "POSTINGDATE",
  "INVOICINGPARTY",
  "SUPPLIERINVOICEIDBYINVCGPARTY",
  "BUSINESSPLACE",
  "INVOICEGROSSAMOUNT",
  "DOCUMENTCURRENCY",
  "ASSIGNMENTREFERENCE",
  "GLACCOUNT",
  "SUPPLIERINVOICEITEMAMOUNT",
  "TAXCODE",
  "COSTCENTER",
  "PERSONNELNUMBER",
  "ITEM_ASSIGNMENTREFERENCE",
  "DOCUMENTITEMTEXT",
] as const;

/** Facturas de proveedor: una fila por posición, repitiendo la cabecera (ID_FACTURA las une). */
export function filasFacturas(facturas: readonly FacturaProveedorSap[]): string[][] {
  const filas: string[][] = [[...ENCABEZADO_FACTURAS]];
  for (const f of facturas) {
    const cabecera = [
      f.idFactura,
      f.sociedad,
      f.claseDocumento,
      fechaSap(f.fechaDocumento),
      fechaSap(f.fechaContabilizacion),
      f.emisor,
      f.referencia,
      f.lugarComercial,
      importeCsv(f.importeBruto),
      f.moneda,
      f.asignacion,
    ];
    for (const p of f.posiciones) {
      filas.push([
        ...cabecera,
        p.cuentaMayor,
        importeCsv(p.importe),
        p.indicadorIva,
        p.centroCosto,
        p.numeroPersonal,
        p.asignacion,
        textoSeguro(p.texto, LARGO_TEXTO_POSICION),
      ]);
    }
  }
  return filas;
}

export const ENCABEZADO_ASIENTOS = [
  "TIPO_LINEA",
  "BUKRS",
  "BLART",
  "BLDAT",
  "BUDAT",
  "WAERS",
  "XBLNR",
  "BKTXT",
  "HKONT",
  "SGTXT",
  "WRSOL",
  "WRHAB",
  "MWSKZ",
  "KOSTL",
  "ZUONR",
] as const;

/** Asientos: un bloque por asiento, una fila "Cabecera" y una "Part.ind." por posición. */
export function filasAsientos(asientos: readonly AsientoSap[]): string[][] {
  const filas: string[][] = [[...ENCABEZADO_ASIENTOS]];
  for (const a of asientos) {
    filas.push([
      "Cabecera",
      a.sociedad,
      a.claseDocumento,
      fechaSap(a.fechaDocumento),
      fechaSap(a.fechaContabilizacion),
      a.moneda,
      a.referencia,
      textoSeguro(a.texto, LARGO_TEXTO_CABECERA),
      "",
      "",
      "",
      "",
      "",
      "",
      "",
    ]);
    for (const p of a.posiciones) {
      filas.push([
        "Part.ind.",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        p.cuentaMayor,
        textoSeguro(p.texto, LARGO_TEXTO_POSICION),
        p.debe !== 0 ? importeCsv(p.debe) : "",
        p.haber !== 0 ? importeCsv(p.haber) : "",
        p.indicadorIva ?? "",
        p.centroCosto ?? "",
        p.asignacion,
      ]);
    }
  }
  return filas;
}

export const ENCABEZADO_CANCELACIONES = [
  "ID_FACTURA",
  "COMPROBANTE",
  "PROVEEDOR",
  "REFERENCIA",
  "IMPORTE",
  "CUENTA_CONTRAPARTIDA",
  "ASIGNACION",
  "INSTRUCCION",
] as const;

/** Instrucción para Tesorería: qué factura compensar contra qué cuenta y con qué asignación. */
export function filasCancelaciones(cancelaciones: readonly CancelacionFacturaSap[]): string[][] {
  const filas: string[][] = [[...ENCABEZADO_CANCELACIONES]];
  for (const c of cancelaciones) {
    filas.push([
      c.idFactura,
      c.comprobanteId,
      c.emisor,
      c.referencia,
      importeCsv(c.importe),
      c.cuentaContrapartida,
      c.asignacion,
      `Compensar la factura ${c.referencia} del proveedor ${c.emisor} por ${importeCsv(c.importe)} contra la cuenta ${c.cuentaContrapartida}, asignación ${c.asignacion}`,
    ]);
  }
  return filas;
}

export const ENCABEZADO_ALTAS = ["CUIT", "RAZON_SOCIAL", "COMPROBANTES"] as const;

/** Propuesta de alta para el dueño del maestro: un proveedor por fila, con los comprobantes que lo piden. */
export function filasAltas(altas: readonly AltaProveedorPendiente[]): string[][] {
  const porCuit = new Map<string, { razonSocial: string; comprobantes: string[] }>();
  for (const a of altas) {
    const previo = porCuit.get(a.cuit);
    if (previo) previo.comprobantes.push(a.comprobanteId);
    else porCuit.set(a.cuit, { razonSocial: a.razonSocial, comprobantes: [a.comprobanteId] });
  }
  const filas: string[][] = [[...ENCABEZADO_ALTAS]];
  for (const [cuit, { razonSocial, comprobantes }] of porCuit) {
    filas.push([cuit, textoSeguro(razonSocial), comprobantes.join(" ")]);
  }
  return filas;
}
