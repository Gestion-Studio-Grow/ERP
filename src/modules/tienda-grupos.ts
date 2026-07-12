// ============================================================================
// GRUPOS DE LA TIENDA DE MÓDULOS — orden + textos de la vidriera (ADR-089 §Decisión 3).
// ============================================================================
//
// Metadata de PRESENTACIÓN de los 6 grupos de proceso de `/admin/modulos`. Es un eje
// DISTINTO de los grupos de NAV (`nav-groups.ts`): acá se ordena la tienda por proceso
// comercial para evaluar el fit antes de instalar. PURO y client-safe (solo datos/tipos):
// lo puede importar la page server y cualquier test.

import type { ModuleGroupId } from "./contract";

export interface TiendaGrupoMeta {
  id: ModuleGroupId;
  /** Título del grupo en la vidriera (criollo). */
  titulo: string;
  /** Bajada corta: de qué se trata el proceso. */
  descripcion: string;
}

/** Los 6 grupos en el ORDEN de la vidriera (facturación primero: es el núcleo). */
export const TIENDA_GRUPOS: readonly TiendaGrupoMeta[] = [
  {
    id: "facturacion-cobros",
    titulo: "Facturación y cobros",
    descripcion: "Facturar con validez fiscal y cobrar por banco o Mercado Pago.",
  },
  {
    id: "ventas-mostrador",
    titulo: "Ventas y mostrador",
    descripcion: "Caja, pedidos y catálogo para vender de mostrador.",
  },
  {
    id: "agenda-turnos",
    titulo: "Agenda y turnos",
    descripcion: "Reservas por profesional y cola de espera.",
  },
  {
    id: "clientes-fidelizacion",
    titulo: "Clientes y fidelización",
    descripcion: "La ficha del cliente, el fiado, recordatorios y reseñas.",
  },
  {
    id: "compras-stock",
    titulo: "Compras y stock",
    descripcion: "Inventario, proveedores y devoluciones.",
  },
  {
    id: "personal-comisiones",
    titulo: "Personal y comisiones",
    descripcion: "Liquidación de comisiones por profesional.",
  },
] as const;

/** Etiqueta de red de seguridad para descriptores sin `grupo` (no debería pasar). */
export const TIENDA_GRUPO_OTROS = {
  id: "otros" as const,
  titulo: "Otros",
  descripcion: "Módulos sin grupo de proceso asignado.",
};
