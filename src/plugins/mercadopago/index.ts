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
  type PagoMP,
  type EstadoPagoMP,
} from "./port";
export { StubMercadoPagoClient } from "./stub";
