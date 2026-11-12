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
// coordenadas, radio y horario. MARCA: Bitácora tiene autorización registrada
// (docs/tenants/bitacora/AUTORIZACION-MARCA.md), pero todavía no hay material (logo, colores, fotos:
// marca-y-material.md). Mientras `marca` no traiga nada, la vidriera va con la piel GSG y el nombre
// del local en texto. Un negocio SIN autorización registrada no lleva `marca` (ADR-042).

import type { MedioPreferido } from "./pago";
import type { MarcaDelLocal } from "./marca";

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
  /**
   * Demora típica de un envío, en minutos desde que se manda el pedido. Con ella el seguimiento
   * promete un rango («llega entre las 18:20 y 18:35», src/lib/delivery-local/reloj.ts); sin ella,
   * no promete hora.
   */
  demoraMin?: number;
  medios: readonly MedioPreferido[];
  transferencia: { alias: string; titular: string; banco: string } | null;
  /** Titular legal del comercio (vendedor) para las condiciones de venta. */
  razonSocial: string;
  cuit: string | null;
  /** Se marca en pantalla cuando algún dato todavía no lo confirmó el local. */
  provisional: boolean;
  /**
   * Identidad del local en SU vidriera, todo opcional (src/lib/delivery-local/marca.ts decide qué se
   * puede usar sin romper el contraste). Sin esto, piel GSG. Sólo con autorización registrada.
   */
  marca?: MarcaDelLocal;
};

const PROVISIONAL = "provisional a confirmar";

export const CONFIGS_DELIVERY_LOCAL: Readonly<Record<string, ConfigDeliveryLocal>> = Object.freeze({
  bitacora: {
    nombre: "Bitácora Café",
    bajada: "Café de especialidad, pastelería y brunch",
    localidad: "Monte Grande",
    direccion: `Florentino Ameghino 166, Monte Grande (${PROVISIONAL})`, // de su ficha pública en Rappi: ver docs/tenants/bitacora/marca-y-material.md
    // Centro de Monte Grande (plaza), PROVISIONAL: se reemplaza por la puerta del local.
    ubicacionDelLocal: { lat: -34.8183, lng: -58.4683 },
    radioKm: 4,
    horario: `Lunes a sábado de 8 a 20 (${PROVISIONAL})`,
    demoraMin: 35, // provisional a confirmar con el local
    medios: ["transferencia", "efectivo", "mercadopago"],
    transferencia: { alias: "ALIAS.PROVISIONAL.A.CONFIRMAR", titular: `Titular ${PROVISIONAL}`, banco: "Mercado Pago" },
    razonSocial: `Bitácora Café (${PROVISIONAL})`,
    cuit: null,
    provisional: true,
    // Autorizada (AUTORIZACION-MARCA.md), sin material todavía: cuando el local pase logo, colores y
    // la foto de portada (Drive, no Git), se cargan acá. Vacío = piel GSG.
    marca: {},
  },
});

/** La configuración del negocio, o null si no tiene el delivery local prendido. */
export function configDeliveryLocal(slug: string | null | undefined): ConfigDeliveryLocal | null {
  if (!slug) return null;
  return Object.prototype.hasOwnProperty.call(CONFIGS_DELIVERY_LOCAL, slug) ? CONFIGS_DELIVERY_LOCAL[slug] : null;
}
