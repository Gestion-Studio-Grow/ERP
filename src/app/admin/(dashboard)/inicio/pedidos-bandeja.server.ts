// ============================================================================
// LOS PEDIDOS DE LA BANDEJA — los primeros tres para cobrar y para preparar, con su plata.
// ============================================================================
//
// La bandeja escribe cada pendiente con su SUJETO («Parrilla La Brasa · #478 · $234.800 · Cobrar»),
// no sólo con un número. Para eso lee, del conjunto EXACTO que lista la bandeja de Pedidos
// (`whereEntregadosSinCobrar` y los estados en curso de order-anulacion.ts), los tres primeros de
// cada lado con los campos que se muestran y nada más. Los totales de cada lado siguen saliendo del
// número de Pedidos (src/apps/kpis): acá no se cuenta nada.
//
// No es una Server Action (no lleva "use server": sería un endpoint): lo llama el Inicio, en el
// servidor, detrás de su guardia y sólo si la persona ve la app de Pedidos. Filtro `tenantId`
// explícito además de RLS, como el resto del mostrador. Si falla, `null` y la bandeja sigue con
// los números (no se lleva puesto el Inicio).

import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { getCurrentTenantId } from "@/lib/tenant";
import { logger } from "@/lib/logger";
import { ESTADOS_EN_CURSO, whereEntregadosSinCobrar } from "@/lib/order-anulacion";

export interface PedidoDeBandeja {
  id: string;
  code: number;
  cliente: string;
  total: number;
  envio: boolean;
  direccion: string | null;
  cuando: Date | null;
  creado: Date;
  lineas: number;
}

/** Cuántos pedidos se escriben por lado; el resto, «y N más» con el enlace a Pedidos. */
export const PEDIDOS_POR_LADO = 3;

const SELECT = {
  id: true,
  code: true,
  customerName: true,
  total: true,
  fulfillment: true,
  address: true,
  scheduledFor: true,
  createdAt: true,
  _count: { select: { items: true } },
} as const;

type Fila = {
  id: string;
  code: number;
  customerName: string;
  total: number;
  fulfillment: string;
  address: string | null;
  scheduledFor: Date | null;
  createdAt: Date;
  _count: { items: number };
};

const aPedido = (o: Fila): PedidoDeBandeja => ({
  id: o.id,
  code: o.code,
  cliente: o.customerName,
  total: o.total,
  envio: o.fulfillment === "DELIVERY",
  direccion: o.address,
  cuando: o.scheduledFor,
  creado: o.createdAt,
  lineas: o._count.items,
});

export const pedidosDeLaBandeja = cache(async (): Promise<{ sinCobrar: PedidoDeBandeja[]; paraPreparar: PedidoDeBandeja[] } | null> => {
  try {
    const tenantId = await getCurrentTenantId();
    const [sinCobrar, paraPreparar] = await Promise.all([
      prisma.order.findMany({ where: whereEntregadosSinCobrar(tenantId), orderBy: { createdAt: "desc" }, take: PEDIDOS_POR_LADO, select: SELECT }),
      prisma.order.findMany({
        where: { tenantId, status: { in: [...ESTADOS_EN_CURSO] } },
        // Primero lo que tiene horario (lo más cercano), después por orden de llegada.
        orderBy: [{ scheduledFor: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
        take: PEDIDOS_POR_LADO,
        select: SELECT,
      }),
    ]);
    return { sinCobrar: sinCobrar.map(aPedido), paraPreparar: paraPreparar.map(aPedido) };
  } catch (error) {
    logger.warn("inicio", "no se pudieron leer los pedidos de la bandeja; queda con los números", {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
});
