// ============================================================================
// DELIVERY LOCAL · QUÉ NEGOCIOS LO TIENEN Y CON QUÉ DATOS — configuración por slug. PURA.
// ============================================================================
//
// «Pedí Local» (nombre PROVISIONAL A CONFIRMAR) es la vidriera de pedidos y delivery propio de un
// comercio del barrio, sin comisión por pedido. Prender el producto en un negocio = una entrada acá.
// Lo que no está acá sigue exactamente como antes (la vidriera de su rubro, sin campos nuevos).
//
// DEUDA ANOTADA: estos datos (alias, radio, horario) pasan a una pantalla de Ajustes guardada en
// AuditLog (patrón de src/lib/envios/config.ts) cuando haya un segundo comercio. Hoy, uno solo.
//
// LOS DATOS DE BITÁCORA CAFÉ SON PROVISIONALES A CONFIRMAR con el local: alias, titular, dirección,
// coordenadas, radio y horario. Sin la autorización registrada del cliente para usar su marca, la
// vidriera va con la marca GSG y el nombre del local en texto (norma «Preset de cliente»).

import type { MedioPreferido } from "./pago";

export type ConfigDeliveryLocal = {
  /** Nombre que se muestra del comercio. */
  nombre: string;
  /** Una línea que dice qué es el local. */
  bajada: string;
  /** Localidad, para los textos («delivery propio en Monte Grande»). */
  localidad: string;
  direccion: string;
  /** Punto de salida del repartidor: con él se calcula la distancia al cliente. */
  ubicacionDelLocal: { lat: number; lng: number } | null;
  /** Hasta dónde llega el reparto (km en línea recta). null = no se controla. */
  radioKm: number | null;
  horario: string;
  medios: readonly MedioPreferido[];
  transferencia: { alias: string; titular: string; banco: string } | null;
  /** Titular legal del comercio (vendedor) para las condiciones de venta. */
  razonSocial: string;
  cuit: string | null;
  /** Se marca en pantalla cuando algún dato todavía no lo confirmó el local. */
  provisional: boolean;
};

const PROVISIONAL = "provisional a confirmar";

export const CONFIGS_DELIVERY_LOCAL: Readonly<Record<string, ConfigDeliveryLocal>> = Object.freeze({
  bitacora: {
    nombre: "Bitácora Café",
    bajada: "Café de especialidad, pastelería y brunch",
    localidad: "Monte Grande",
    direccion: `Monte Grande, Esteban Echeverría (${PROVISIONAL})`,
    // Centro de Monte Grande (plaza), PROVISIONAL: se reemplaza por la puerta del local.
    ubicacionDelLocal: { lat: -34.8183, lng: -58.4683 },
    radioKm: 4,
    horario: `Lunes a sábado de 8 a 20 (${PROVISIONAL})`,
    medios: ["transferencia", "efectivo", "mercadopago"],
    transferencia: { alias: "ALIAS.PROVISIONAL.A.CONFIRMAR", titular: `Titular ${PROVISIONAL}`, banco: "Mercado Pago" },
    razonSocial: `Bitácora Café (${PROVISIONAL})`,
    cuit: null,
    provisional: true,
  },
});

/** La configuración del negocio, o null si no tiene el delivery local prendido. */
export function configDeliveryLocal(slug: string | null | undefined): ConfigDeliveryLocal | null {
  if (!slug) return null;
  return Object.prototype.hasOwnProperty.call(CONFIGS_DELIVERY_LOCAL, slug) ? CONFIGS_DELIVERY_LOCAL[slug] : null;
}
