/**
 * Mercado Pago como PROVEEDOR del CORE PAGOS: expone una `FabricaGateway` que el
 * glue de cobros registra bajo la clave `"mercadopago"`. Elige el adapter según
 * las credenciales del tenant:
 *   - con access token real → adapter HTTP (`HttpMercadoPagoClient`).
 *   - sin credenciales → stub en memoria (dev/test; prod queda inerte tras el flag).
 *
 * "El día de las credenciales es encender, no construir": el mismo registro sirve
 * para stub y real; solo cambia si hay token.
 */

import type { FabricaGateway } from "@/plugins/pagos";
import { HttpMercadoPagoClient, tokenFijo } from "./http";
import { MercadoPagoConfig } from "./port";
import { StubMercadoPagoClient } from "./stub";

/** Clave del proveedor MP en el registro de gateways. */
export const CLAVE_MERCADOPAGO = "mercadopago";

/**
 * Config esperada por la fábrica (opaca para el registro). Si trae `accessToken`,
 * se usa el adapter real; si no, el stub.
 */
export interface ConfigGatewayMP {
  credenciales?: MercadoPagoConfig;
}

/** ¿La config trae un access token utilizable? */
function tieneToken(config: unknown): config is ConfigGatewayMP & { credenciales: MercadoPagoConfig } {
  const c = config as ConfigGatewayMP | undefined;
  return !!c?.credenciales?.accessToken;
}

/**
 * Fábrica del gateway de Mercado Pago. Con credenciales devuelve el adapter real;
 * sin ellas, el stub (no falla al construir — falla recién si se lo usa sin token,
 * con un mensaje de "credencial requerida").
 */
export const fabricaGatewayMP: FabricaGateway = (_tenantId, config) => {
  if (tieneToken(config)) {
    return new HttpMercadoPagoClient(tokenFijo(config.credenciales));
  }
  return new StubMercadoPagoClient();
};
