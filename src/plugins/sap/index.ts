/**
 * Plugin SAP — modo Archivo: convierte el lote contable de Rendí en las planillas de carga masiva de
 * SAP S/4HANA Cloud Public Edition. Puro: no hay red ni integración (plan §10.1, "desde el día uno").
 * Superficie pública del plugin (misma convención que ARCA y BANCOS).
 */

import type { LoteContableSap } from "./core-contract";
import { aCsv } from "./domain/csv";
import { filasAltas, filasAsientos, filasCancelaciones, filasFacturas } from "./domain/plantillas";

export interface ArchivosSap {
  /** Facturas de proveedor (carril 1). */
  facturas: string;
  /** Asientos por rendición (carril 2). */
  asientos: string;
  /** Instrucción de compensación para Tesorería (no es planilla de carga). */
  cancelaciones: string;
  /** Propuesta de alta de proveedores para el dueño del maestro. */
  altas: string;
}

/** Los cuatro CSV del lote (con BOM, separador `;`). Los encabezados son [A VALIDAR]: ver README. */
export function generarArchivosSap(lote: LoteContableSap): ArchivosSap {
  return {
    facturas: aCsv(filasFacturas(lote.facturas)),
    asientos: aCsv(filasAsientos(lote.asientos)),
    cancelaciones: aCsv(filasCancelaciones(lote.cancelaciones)),
    altas: aCsv(filasAltas(lote.altasPendientes)),
  };
}

export { sapManifest } from "./manifest";
export type {
  LoteContableSap,
  FacturaProveedorSap,
  PosicionFacturaSap,
  AsientoSap,
  PosicionAsientoSap,
  CancelacionFacturaSap,
  AltaProveedorPendiente,
} from "./core-contract";
export { aCsv, importeCsv, BOM } from "./domain/csv";
export {
  filasFacturas,
  filasAsientos,
  filasCancelaciones,
  filasAltas,
  textoSeguro,
  ENCABEZADO_FACTURAS,
  ENCABEZADO_ASIENTOS,
  ENCABEZADO_CANCELACIONES,
  ENCABEZADO_ALTAS,
} from "./domain/plantillas";
