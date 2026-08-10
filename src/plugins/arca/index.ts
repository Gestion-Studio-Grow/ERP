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
  type AfipClient,
  type EmisorConfig,
  type ResultadoCae,
  type ObservacionArca,
  ArcaRechazoError,
} from './afip/port';
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
