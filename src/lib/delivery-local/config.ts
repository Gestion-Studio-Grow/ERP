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
// (docs/tenants/bitacora/AUTORIZACION-MARCA.md), sólo para su tienda. Su carta, sus opciones y su
// piel (colores, logo, portada y letra) salen de su menú público de Fudo (13/11/2026): carta en
// carta-bitacora.ts, opciones en opciones-bitacora.ts; todo provisional a confirmar con el local.
// Un negocio SIN autorización registrada no lleva `marca` (ADR-042).

import type { MedioPreferido } from "./pago";
import type { MarcaDelLocal } from "./marca";
import type { HorarioDelLocal } from "./horario";
import type { OpcionesDeProducto } from "./opciones";
import type { CartaDelLocal } from "./carta-del-local";
import { CARTA_BITACORA } from "./carta-bitacora";
import { OPCIONES_BITACORA } from "./opciones-bitacora";

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
  /**
   * Franjas por día en la hora argentina (horario.ts). Con él la vidriera dice «Abierto · cierra
   * 20:00» y el alta rechaza fuera de horario. El texto («Lunes a sábado de 8 a 20») sale de acá.
   */
  horario: HorarioDelLocal;
  /**
   * Opciones por producto (id o nombre): «Tamaño», «Leche y extras», con recargo en pesos enteros.
   * El servidor recalcula el recargo desde ACÁ (opciones.ts); el navegador sólo dice qué eligió.
   */
  opciones?: readonly OpcionesDeProducto[];
  /**
   * La carta del local: categorías en su orden, descripción, foto y destacados, por NOMBRE de
   * producto (carta-del-local.ts). Sin esto (o para lo que no figura), la regla por palabras.
   */
  carta?: CartaDelLocal;
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
    // PROVISIONAL A CONFIRMAR con el local: lunes a sábado de 8 a 20, domingo cerrado.
    horario: {
      porDia: {
        lun: [["08:00", "20:00"]],
        mar: [["08:00", "20:00"]],
        mie: [["08:00", "20:00"]],
        jue: [["08:00", "20:00"]],
        vie: [["08:00", "20:00"]],
        sab: [["08:00", "20:00"]],
      },
      provisional: true,
    },
    // Del mapeo de Fudo (opciones-bitacora.ts): lo que no dice «real» es PROVISIONAL A CONFIRMAR.
    // El producto se busca por nombre en la carta (sin tildes ni mayúsculas).
    opciones: OPCIONES_BITACORA,
    carta: CARTA_BITACORA,
    demoraMin: 35, // provisional a confirmar con el local
    medios: ["transferencia", "efectivo", "mercadopago"],
    transferencia: { alias: "ALIAS.PROVISIONAL.A.CONFIRMAR", titular: `Titular ${PROVISIONAL}`, banco: "Mercado Pago" },
    razonSocial: `Bitácora Café (${PROVISIONAL})`,
    cuit: null,
    provisional: true,
    // Autorizada (AUTORIZACION-MARCA.md). Su cara en Fudo: azul marino, crema, terracota y Manrope
    // (contrastes AA calculados en marca.ts). Logo y portada por URL de Fudo (no se bajan a Git):
    // PROVISIONAL A CONFIRMAR, pasarlos a almacenamiento propio antes de salir de la prueba.
    marca: {
      colorPrimario: "#323977",
      colorFondo: "#FCF5F0",
      colorBanda: "#323977",
      colorAcento: "#B37C57",
      letra: "manrope",
      logoUrl: "https://fudo-apps-storage.s3.sa-east-1.amazonaws.com/production/354552/qr-menu/logo?updatedAt=1786545600271",
      fotoPortada: "https://fudo-apps-storage.s3.sa-east-1.amazonaws.com/production/354552/qr-menu/background-image?updatedAt=1786545600271",
    },
  },
});

/** La configuración del negocio, o null si no tiene el delivery local prendido. */
export function configDeliveryLocal(slug: string | null | undefined): ConfigDeliveryLocal | null {
  if (!slug) return null;
  return Object.prototype.hasOwnProperty.call(CONFIGS_DELIVERY_LOCAL, slug) ? CONFIGS_DELIVERY_LOCAL[slug] : null;
}
