/**
 * RENDÍ — superficie pública del motor de rendiciones (Core, PURO).
 *
 * Las pantallas importan SÓLO de acá (`@/lib/rendiciones`) y del plugin (`@/plugins/sap`).
 * Contrato de funciones: CONTRATO.md. Contrato de tipos: tipos.ts.
 */

export type * from "./tipos";

export { pesos, formatearPesos, formatearPesosCorto, ivaDeLinea, sumar, convertirAPesos } from "./dinero";
export { leerQrArca, claseDesdeTipoArca, tipoArcaDesdeClase, urlQrArca, URL_QR_ARCA } from "./qr-arca";
export { evaluarComprobante, CLASES_QUE_COMPUTAN } from "./motor-fiscal";
export {
  calcularCuadratura,
  aplicarAccion,
  totalRendicion,
  comprobantesDeRendicion,
  lineasQueNoSeRinden,
} from "./rendicion";
export { nivelesDeAprobacion, puedeAprobar } from "./aprobacion";
export {
  armarLoteContable,
  destinoEnLote,
  totalesQueEntran,
  asignacionContable,
  referenciaOficial,
  type ArgsLoteContable,
  type DestinoEnLote,
} from "./lote-contable";
export { conciliarConPrecarga } from "./conciliacion";
export { resumenParaHaberes, type ArgsHaberes } from "./haberes";
export { esFechaIso, diasEntre, estaEnPeriodo, formatearFecha, nombrePeriodo } from "./fechas";
export { nombreJurisdiccion, etiquetaClase } from "./textos";
