/**
 * Plugin ARCA — facturación electrónica (primer Plugin del Core, ADR-022).
 * Superficie pública del plugin.
 */

export { arcaManifest, type PluginManifest } from './manifest';
export { arcaModule } from './module';
export {
  procesarInvoiceCreated,
  ComprobanteInvalidoError,
  type HandlerDeps,
} from './handler';
export type {
  InvoiceCreatedEvent,
  RegisterFiscalDocumentInput,
  RegisterFiscalDocument,
  SubtotalIvaCore,
  EmisorEvento,
  ReceptorEvento,
  ComprobanteAsociado,
} from './core-contract';
export {
  TipoComprobante,
  TipoDocumento,
  Concepto,
  AlicuotaIvaId,
  CondicionIva,
  CondicionIvaReceptor,
  PORCENTAJE_IVA,
  MONEDA_PESOS,
  conceptoRequiereFechasServicio,
  condicionReceptorId,
  tipoFacturaCorrespondiente,
  tipoNotaCreditoPara,
  esNotaCredito,
  esClaseC,
  discriminaIva,
  comprobanteLlevaIva,
} from './domain/catalogos';
export {
  politicaDe,
  comprobantePara,
  receptorRequiereCuit,
  esOperacionReversa,
  todasLasPoliticas,
  type Operacion,
  type ClaseComprobante,
  type PoliticaContribuyente,
  type ContextoComprobante,
} from './domain/politica-contribuyente';
export {
  urlQrAfip,
  payloadQrAfip,
  base64QrAfip,
  URL_QR_AFIP,
  type DatosQrAfip,
  type PayloadQrAfip,
} from './domain/qr-afip';
export {
  construirComprobante,
  totalIva,
  type ComprobanteArca,
  type SubtotalIva,
} from './domain/comprobante';
export {
  validarComprobante,
  type ResultadoValidacion,
  type ErrorValidacion,
} from './domain/validacion';
export {
  type AfipClient,
  type EmisorConfig,
  type ResultadoCae,
  type ObservacionArca,
  ArcaRechazoError,
} from './afip/port';
export { StubAfipClient } from './afip/stub';
export {
  SoapAfipClient,
  armarFECompConsultarRequest,
  parsearFECompConsultarResponse,
  type SoapAfipClientDeps,
  type TraSigner,
  type ConsultaComprobante,
} from './afip/soap';
export {
  Pkcs7TraSigner,
  credencialDesdeEnv,
  type CredencialEmisor,
} from './afip/signer';
export { crearAfipClient, modoDesdeEnv, configParaModo, type ModoArca } from './afip/factory';
export {
  comprobanteDePrueba,
  emitirFacturaDePrueba,
  fechaDePrueba,
  CUIT_DE_PRUEBA,
  type ResultadoPruebaArca,
} from './afip/prueba';
