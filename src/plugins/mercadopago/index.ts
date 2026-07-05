/**
 * Plugin Mercado Pago — cobros + auto-facturación (ADR-024). Superficie pública.
 */

export { mercadopagoManifest } from "./manifest";
export {
  procesarNotificacionPago,
  type MpHandlerDeps,
  type ResultadoNotificacion,
} from "./handler";
export type { NotificacionPagoMP, FacturarPorPago } from "./core-contract";
export {
  type MercadoPagoClient,
  type MercadoPagoConfig,
  type CredencialesPort,
  type PagoMP,
  type EstadoPagoMP,
  type CriterioBusqueda,
  type PaginaPagos,
} from "./port";
export { StubMercadoPagoClient } from "./stub";
export {
  sincronizarPagos,
  facturarPagoSiCorresponde,
  type IngestaDeps,
  type ResumenIngesta,
  type FacturarPagoMP,
} from "./ingest";
export {
  ReconciliacionEnMemoria,
  type ReconciliacionPort,
  type RegistroConciliacion,
  type EstadoConciliacion,
} from "./reconciliation";
export {
  ClasificadorPorReglas,
  REGLAS_DEFAULT,
  type ClasificadorPort,
  type Clasificacion,
  type ResultadoClasificacion,
  type ReglaClasificacion,
} from "./classifier";
export {
  NotificacionWhatsAppStub,
  type NotificacionPort,
  type SolicitudConfirmacion,
  type MensajeEnviado,
} from "./notification";
export { type TipoOperacionMP } from "./port";
