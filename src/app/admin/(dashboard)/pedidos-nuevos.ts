"use server";

// ============================================================================
// PEDIDOS NUEVOS — la lectura del chip de la cabecera (reingeniería Magra 1I, E30 · MG-054).
// ============================================================================
//
// UN endpoint, de sólo lectura, con `orders:read` (los pedidos se ven con esa capacidad; el layout
// monta el chip sólo para quien la tiene, así que el `redirect` de `requireCapability` sólo salta
// con la sesión vencida). Lee del negocio de la sesión, con el `tenantId` escrito además de RLS
// (como `getPosData`): con RLS apagado el filtro explícito es lo único que acota.
//
// Barato a propósito (Neon, plan gratuito): dos lecturas chicas en paralelo sobre el índice
// `[tenantId, status]` —el conteo con el número más alto, y el más viejo para abrirlo—. Nada de
// traer pedidos ni renglones. La pantalla pregunta cada 45 s y sólo con la pestaña a la vista
// (ChipDePedidosNuevos.tsx). El interruptor no se vuelve a leer acá: decide si el chip se MONTA
// (layout.tsx); este conteo no expone nada que la bandeja no muestre a la misma persona.

import { requireCapability } from "@/lib/authz";
import { getCurrentTenantId } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { CRITERIO_PEDIDO_NUEVO, type ConteoDePedidosNuevos } from "./pedidos/pedidos-core";

export async function contarPedidosNuevos(): Promise<ConteoDePedidosNuevos> {
  await requireCapability("orders:read");
  const tenantId = await getCurrentTenantId();
  const where = { tenantId, ...CRITERIO_PEDIDO_NUEVO };
  const [resumen, masViejo] = await Promise.all([
    prisma.order.aggregate({ where, _count: { _all: true }, _max: { code: true } }),
    prisma.order.findFirst({ where, orderBy: { createdAt: "asc" }, select: { id: true, code: true, createdAt: true } }),
  ]);
  return {
    cantidad: resumen._count._all,
    masViejo: masViejo ? { id: masViejo.id, code: masViejo.code, creado: masViejo.createdAt.toISOString() } : null,
    ultimoCode: resumen._max.code ?? null,
  };
}
