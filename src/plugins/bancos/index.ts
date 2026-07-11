/**
 * Plugin BANCOS — importación de extractos bancarios y propuestas de factura.
 * Superficie pública del plugin (misma convención que ARCA, ADR-022).
 */

export { bancosModule, bancosManifest } from "./module";
export type {
  MovimientoBancario,
  PropuestaFactura,
  EstadoPropuesta,
  OrigenMovimiento,
  CreateInvoiceDesdeBancoInput,
  CreateInvoiceCommand,
} from "./core-contract";
export {
  procesarExtracto,
  detectarFormato,
  type ArchivoExtracto,
  type FormatoExtracto,
  type BancosHandlerDeps,
  type ResultadoExtracto,
} from "./handler";
export { parsearCsv, detectarSeparador, decodificar, type SeparadorCsv } from "./parser/csv";
export { parsearXlsx, esXlsx, type Celda } from "./parser/xlsx";
export {
  mapearColumnas,
  normalizarMovimientos,
  CONFIANZA_MINIMA,
  StubMapeadorAsistido,
  type MapeoColumnas,
  type EsquemaImporte,
  type MapeadorAsistido,
} from "./domain/mapeador";
export {
  TEMPLATES,
  buscarTemplate,
  normalizarHeaders,
  type TemplateBanco,
  type ColumnasTemplate,
} from "./domain/templates";
export {
  ClasificadorBancarioPorReglas,
  AprendizajeBancoEnMemoria,
  registrarCorreccionBanco,
  REGLAS_DEFAULT_BANCO,
  type ClasificacionBanco,
  type ResultadoClasificacionBanco,
  type ClasificadorBancoPort,
  type ReglaClasificacionBanco,
  type ConfigClasificacionBanco,
  type AprendizajeBancoPort,
  type CorreccionBanco,
} from "./domain/clasificador";
export {
  generarPropuestas,
  configConDefaults,
  DeteccionCruzadaEnMemoria,
  UMBRAL_IDENTIFICACION_DEFAULT,
  CAP_FACTURAS_MES_DEFAULT,
  DOC_TIPO_CONSUMIDOR_FINAL,
  DOC_NRO_CONSUMIDOR_FINAL,
  type ConfigBancos,
  type DeteccionCruzadaPort,
  type AlertaBancos,
  type ContextoReglas,
  type ResultadoReglas,
} from "./domain/reglas";
export {
  parsearNumeroAR,
  parsearFecha,
  normalizarTexto,
  hashMovimiento,
  redondear2,
} from "./domain/valores";
export { cuitValido, normalizarCuit } from "./domain/cuit";
