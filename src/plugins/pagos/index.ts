/**
 * CORE PAGOS — abstracción provider-agnóstica del gateway de cobros (ADR-024).
 * Superficie pública: el contrato del gateway + el registro de proveedores.
 * Los adapters concretos viven en cada plugin de proveedor (p.ej. mercadopago).
 */

export type {
  GatewayPagos,
  PagoNormalizado,
  EstadoPago,
  TipoOperacion,
  CriterioBusqueda,
  PaginaPagos,
} from "./port";

export {
  RegistroGateways,
  ProveedorPagoDesconocidoError,
  type ClaveProveedor,
  type FabricaGateway,
} from "./registry";
