/**
 * PORT del plugin Mercado Pago (ADR-024 §2.d). El plugin habla con MP solo por
 * esta interface; adapters: real (`http.ts`, API de MP) y stub (memoria).
 *
 * Mercado Pago es el primer PROVEEDOR del CORE PAGOS: el modelo de pago y el
 * cliente son el contrato provider-agnóstico (`@/plugins/pagos`). Acá viven solo
 * las piezas específicas de MP (credenciales OAuth) y los alias con nombre MP
 * que el resto del plugin ya usa (compatibilidad).
 */

import {
  EstadoPago,
  GatewayPagos,
  PagoNormalizado,
  TipoOperacion,
} from "@/plugins/pagos";

// Alias con nomenclatura MP sobre el modelo canónico del core (mismo tipo).
// El modelo de pago es común a todos los gateways; MP no lo redefine.
export type EstadoPagoMP = EstadoPago;
export type TipoOperacionMP = TipoOperacion;
export type PagoMP = PagoNormalizado;

export type { CriterioBusqueda, PaginaPagos } from "@/plugins/pagos";

/**
 * Credenciales OAuth de MP por cliente (ADR-025 §9). Se obtienen del flujo
 * *authorization code* (el comerciante autoriza una vez; NUNCA su contraseña ni
 * scraping). Secretas: cifradas at-rest por cliente, jamás al repo.
 */
export interface MercadoPagoConfig {
  /** Access token (corto). */
  accessToken: string;
  /** Refresh token (largo): renueva el access antes de vencer. */
  refreshToken?: string;
  /** Vencimiento del access token (epoch ms). Dispara el refresh. */
  expiresAt?: number;
  /** Id de la cuenta MP del comerciante (collector id). */
  collectorId?: string;
}

/**
 * Provee y refresca las credenciales OAuth de un cliente (ADR-025 §9).
 * Stub/DB-backed diferido: hoy el simulador no lo necesita (sin red).
 */
export interface CredencialesPort {
  /** Credenciales vigentes del cliente (refresca el token si está por vencer). */
  credencialesDe(tenantId: string): Promise<MercadoPagoConfig>;
}

/**
 * Cliente de Mercado Pago = el gateway de pagos del core, con nombre MP. Es el
 * mismo contrato (`getPayment` / `listPayments`); MP no agrega métodos. Existe
 * como alias para que el resto del plugin siga hablando en términos de MP.
 */
export type MercadoPagoClient = GatewayPagos;
