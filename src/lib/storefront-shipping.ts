// Cálculo de envío de la vidriera — LÓGICA PURA (sin DB ni red), testeable.
//
// La vidriera genérica del blueprint retail no tenía costo de envío: mostraba el
// total del carrito y "el pago se coordina al recibirlo". Para tenants que venden
// con envío a domicilio y umbral de envío gratis (p. ej. Shine Velas: fijo $3.500,
// gratis desde $25.000), esta capa calcula el costo y el faltante para el envío
// gratis. Es config POR TENANT (en su StorefrontCopy.shipping); sin config, la
// vidriera se comporta como antes (envío 0, sin nudge). No toca el server action
// placeOnlineOrder — el pedido se confirma por el mostrador (pago al recibir); esto
// es una estimación honesta para el cliente en la vidriera.

export type Fulfillment = "PICKUP" | "DELIVERY";

/** Config de envío del tenant. `freeThreshold <= 0` = siempre gratis. */
export interface ShippingConfig {
  /** Costo fijo del envío a domicilio (ARS). */
  flatRate: number;
  /** Subtotal a partir del cual el envío es gratis (ARS). */
  freeThreshold: number;
}

/**
 * Costo de envío para un subtotal y modo de entrega.
 * - Retiro en el local (`PICKUP`) → siempre 0.
 * - Sin config de envío → 0 (comportamiento histórico de la vidriera).
 * - Carrito vacío (subtotal ≤ 0) → 0 (no cobramos envío de la nada).
 * - Envío (`DELIVERY`) → gratis si alcanza el umbral, si no el costo fijo.
 */
export function shippingCost(
  subtotal: number,
  fulfillment: Fulfillment,
  config: ShippingConfig | null | undefined,
): number {
  if (!config) return 0;
  if (fulfillment === "PICKUP") return 0;
  if (subtotal <= 0) return 0;
  return subtotal >= config.freeThreshold ? 0 : Math.max(0, config.flatRate);
}

/**
 * Cuánto falta para el envío gratis (para el nudge "te faltan $X…").
 * 0 cuando ya califica, cuando no hay config, o cuando el carrito está vacío.
 */
export function amountToFreeShipping(
  subtotal: number,
  config: ShippingConfig | null | undefined,
): number {
  if (!config || subtotal <= 0) return 0;
  const missing = config.freeThreshold - subtotal;
  return missing > 0 ? missing : 0;
}

/** ¿El subtotal ya alcanza para envío gratis a domicilio? */
export function qualifiesForFreeShipping(
  subtotal: number,
  config: ShippingConfig | null | undefined,
): boolean {
  if (!config || subtotal <= 0) return false;
  return subtotal >= config.freeThreshold;
}

/** Total final mostrado al cliente = subtotal + envío del modo elegido. */
export function orderTotal(
  subtotal: number,
  fulfillment: Fulfillment,
  config: ShippingConfig | null | undefined,
): number {
  return subtotal + shippingCost(subtotal, fulfillment, config);
}
