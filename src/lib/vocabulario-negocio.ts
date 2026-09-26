// ============================================================================
// EL VOCABULARIO DEL NEGOCIO EN EL PANEL — cómo se llama el retiro y qué ejemplo lleva la nota.
// ============================================================================
//
// Lo arma el layout del panel UNA vez por pedido, con el rubro que ya lee (`getCurrentTenantRubro`,
// cacheado: cero viajes nuevos a la base), y lo reparte por contexto (VocabularioDelNegocio.tsx).
// Antes, el alta manual de pedidos decía "Ej.: cortar en milanesas, sin grasa" en TODAS las tiendas
// (velas, pádel, una estética) y "Retira en el local" a una perfumería que no tiene local.
//
// PURO y client-safe: sólo importa configuración del rubro.

import {
  ENTREGA_POR_DEFECTO,
  GENERIC_RETAIL_WORDING,
  type EntregaWording,
  type RetailRubro,
} from "@/blueprints/retail/rubros";

export type VocabularioDelNegocio = EntregaWording & {
  /** Ejemplo del campo "Nota" del alta manual de pedido. */
  notasEjemplo: string;
  /** ¿El rubro vende algo por kilo? Si no, el panel no habla de "cargá el peso". */
  porPeso: boolean;
};

export const VOCABULARIO_POR_DEFECTO: VocabularioDelNegocio = vocabularioDelNegocio(null);

export function vocabularioDelNegocio(rubro: Pick<RetailRubro, "wording" | "catalog"> | null | undefined): VocabularioDelNegocio {
  const notas = rubro?.wording.notesPlaceholder ?? GENERIC_RETAIL_WORDING.notesPlaceholder;
  return {
    ...(rubro?.wording.entrega ?? ENTREGA_POR_DEFECTO),
    notasEjemplo: notas.charAt(0).toUpperCase() + notas.slice(1),
    // Sin rubro (una estética) queda como siempre: el mostrador puede vender por kilo.
    porPeso: rubro ? rubro.catalog.some((i) => i.sale === "kg") : true,
  };
}

/** "Retiro / envío", "Punto de encuentro / envío": el título de la columna de entrega. */
export function tituloDeEntrega(v: Pick<EntregaWording, "nombre">): string {
  return `${v.nombre.charAt(0).toUpperCase()}${v.nombre.slice(1)} / envío`;
}
