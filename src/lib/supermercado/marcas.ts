// ============================================================================
// MARCAS Y ENTIDADES DEL SUPERMERCADO — constantes puras, sin importar nada.
// ============================================================================
//
// Viven solas para que las lean el libro de caja (caja/libro-caja.ts), la retención de la
// auditoría (audit-retention.ts, que tiene que correr con un doble de base) y los módulos del
// súper sin ciclos de importación.

/**
 * Marca del asiento de una venta cobrada con VARIOS medios (`CashMovement.createdBy`):
 * `venta-pago-mixto:<orderId>`. El libro la muestra como "Venta del mostrador" y no deja
 * borrarla (se corrige anulando la venta). Quién cobró está en el cobro (`Collection.collectedBy`)
 * y en la auditoría de la venta.
 */
export const PAGO_MIXTO_ACTOR_PREFIX = "venta-pago-mixto:";

/** ¿Este asiento lo escribió el cobro de una venta con varios medios? */
export function esAsientoDePagoMixto(m: { createdBy?: string | null }): boolean {
  return String(m.createdBy ?? "").startsWith(PAGO_MIXTO_ACTOR_PREFIX);
}

/**
 * Entidades de `AuditLog` que GUARDAN CONFIGURACIÓN del súper (mismo patrón que "Interruptor" y
 * "RegimenFacturaA"): la fila más nueva de cada una es el estado vigente. La purga de la
 * auditoría no las borra: purgada la fila, la promo, la balanza o los encargados desaparecerían solos.
 */
export const ENTIDAD_PROMOCION = "Promocion";
export const ENTIDAD_CONFIG_CAJA = "ConfigCajaRapida";
export const ENTIDAD_LISTA_PROVEEDOR = "ListaDeProveedor";

/** Acción de la fila con las promos que aplicó una venta (entity "Order"). */
export const ACCION_PROMOS_DE_LA_VENTA = "promociones-de-la-venta";

/** Acción de la fila de un renglón anulado en la caja antes de cobrar (entity "CajaRenglon"). */
export const ENTIDAD_RENGLON_DE_CAJA = "CajaRenglon";
export const ACCION_ANULAR_RENGLON = "anular-renglon";
