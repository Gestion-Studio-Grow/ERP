// Localización fiscal argentina (ADR-019 + ADR-020) — API pública del subsistema.
export { requestFiscalComprobante } from "./emit";
export type { RequestComprobanteInput } from "./emit";
export { drainOutbox, procesarEvento } from "./outbox";
export { ensureConnectors } from "./connectors";
export {
  esCuitValido,
  formatearCuit,
  codigoCondicionIvaReceptor,
} from "./identidad-fiscal";
export { calcularComprobante, assertConsistente } from "./calculo-fiscal";
export {
  codigoCbteTipo,
  codigoDocTipoReceptor,
  formatearNumeroComprobante,
  MONEDA_PES,
  CONCEPTO,
} from "./comprobante-arca";
export type { Capability, FiscalNamespace } from "./types";
