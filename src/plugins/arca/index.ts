/**
 * Plugin ARCA — facturación electrónica (primer Plugin del Core, ADR-022).
 * Superficie pública del plugin.
 */

export { arcaManifest, type PluginManifest } from './manifest';
export { arcaModule } from './module';
export {
  procesarInvoiceCreated,
  ComprobanteInvalidoError,
  autorizarSinDuplicar,
  esElMismoComprobante,
  type HandlerDeps,
  type RegistroDeIntentos,
} from './handler';
export type {
  InvoiceCreatedEvent,
  IntentoArca,
  NumeroUsadoPorOtraFactura,
  RegisterFiscalDocumentInput,
  RegisterFiscalDocument,
  SubtotalIvaCore,
  EmisorEvento,
  ReceptorEvento,
} from './core-contract';
export {
  TipoComprobante,
  TipoDocumento,
  Concepto,
  AlicuotaIvaId,
  CondicionIva,
  CondicionIvaReceptorId,
  PORCENTAJE_IVA,
  MONEDA_PESOS,
  conceptoRequiereFechasServicio,
  tipoFacturaCorrespondiente,
  condicionIvaReceptorArca,
  discriminaIva,
  informaIvaWsfe,
} from './domain/catalogos';
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
  urlQrAfip,
  payloadQrAfip,
  base64QrAfip,
  URL_QR_AFIP,
  type DatosQrAfip,
  type PayloadQrAfip,
} from './domain/qr-afip';
export {
  type AfipClient,
  type EmisorConfig,
  type ResultadoCae,
  type ObservacionArca,
  type ComprobanteConsultado,
  ArcaRechazoError,
  ArcaPasajeroError,
} from './afip/port';
export { esErrorPasajero, CODIGOS_PASAJEROS_ARCA } from './domain/errores-arca';
export { StubAfipClient } from './afip/stub';
export {
  SoapAfipClient,
  ticketVigente,
  type SoapAfipClientDeps,
  type TraSigner,
  type TicketAcceso,
} from './afip/soap';
export {
  Pkcs7TraSigner,
  credencialDesdeEnv,
  type CredencialEmisor,
} from './afip/signer';
export {
  crearAfipClient,
  modoDesdeEnv,
  configParaModo,
  type ModoArca,
  type CrearAfipClientOpts,
} from './afip/factory';
export {
  cuitDesdeCertPem,
  vencimientoDesdeCertPem,
  assertCertCoincideConCuit,
  CredencialCuitMismatchError,
} from './afip/cert-inspect';
export {
  comprobanteDePrueba,
  emitirFacturaDePrueba,
  fechaDePrueba,
  CUIT_DE_PRUEBA,
  type ResultadoPruebaArca,
} from './afip/prueba';
