/**
 * Plugin ARCA — facturación electrónica (primer Plugin del Core, ADR-022).
 * Superficie pública del plugin.
 */

export { arcaManifest, type PluginManifest } from './manifest';
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
} from './core-contract';
export {
  TipoComprobante,
  TipoDocumento,
  Concepto,
  AlicuotaIvaId,
  CondicionIva,
  PORCENTAJE_IVA,
  MONEDA_PESOS,
  conceptoRequiereFechasServicio,
  tipoFacturaCorrespondiente,
  discriminaIva,
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
  type AfipClient,
  type EmisorConfig,
  type ResultadoCae,
  type ObservacionArca,
  ArcaRechazoError,
} from './afip/port';
export { StubAfipClient } from './afip/stub';
export { SoapAfipClient, type SoapAfipClientDeps, type TraSigner } from './afip/soap';
export {
  Pkcs7TraSigner,
  credencialDesdeEnv,
  type CredencialEmisor,
} from './afip/signer';
export { crearAfipClient, modoDesdeEnv, type ModoArca } from './afip/factory';
