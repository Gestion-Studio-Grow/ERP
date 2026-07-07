/**
 * MERCADO PAGO — COBROS (links de pago / Checkout Pro). Superficie pública del
 * sub-módulo. Complementa la ingesta (../) con la SALIDA: generar links de pago.
 */

export {
  type EstadoPreferencia,
  type SolicitudCobro,
  type LinkDePago,
  type PasarelaCobros,
  type ErrorSolicitud,
  SolicitudCobroInvalidaError,
  validarSolicitud,
} from "./port";

export {
  type TransportePost,
  type HttpPasarelaCobrosDeps,
  type RawPreferenceRequest,
  type RawPreferenceResponse,
  FetchTransportePost,
  HttpPasarelaCobros,
  MONEDA_ARS,
  construirUrlPreferencia,
  armarBodyPreferencia,
  parsearPreferencia,
} from "./http";

export { StubPasarelaCobros, STUB_COBROS_BASE } from "./stub";
