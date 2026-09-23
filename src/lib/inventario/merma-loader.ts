// ============================================================================
// Loader del tablero de MERMA Y FALTANTE de Inventario — lee, no escribe.
// ============================================================================
//
// Trae los AJUSTE del ledger de la semana elegida (en hora del negocio) y los resume con
// `resumirMerma` (stock/merma-core.ts, puro y testeado). El costo NO se calcula acá: sale de
// las mismas filas que ya cargó la pantalla de Inventario (`getInventory`, el último costo de
// compra) y del costo de referencia del catálogo (`getProductExtras`), así la merma se valúa
// con el mismo número que la valuación de al lado.
//
// Server-only y sin "use server": no es un endpoint. Guard `catalog:read`, como el resto de
// Inventario; el `where` lleva `tenantId` explícito además del scope del cliente.

import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/authz";
import { getCurrentTenantId } from "@/lib/tenant";
import { businessWallTimeToUtc } from "@/lib/datetime";
import type { InventoryRow } from "@/lib/inventario/valuation";
import {
  costoDeReferencia,
  resumirMerma,
  sumarDias,
  type ProductoDeMerma,
  type ResumenDeMerma,
  type Semana,
} from "@/lib/stock/merma-core";

/** Tope de movimientos por semana. Un local registra decenas; esto sólo evita una lectura sin fin. */
const MAX_MOVIMIENTOS = 5000;

export async function getMermaDeLaSemana(
  semana: Semana,
  costos: { rows: readonly InventoryRow[]; extras: ReadonlyMap<string, { cost: number | null }> },
): Promise<ResumenDeMerma & { truncado: boolean }> {
  await requireCapability("catalog:read");
  const tenantId = await getCurrentTenantId();

  // [desde 00:00, hasta+1 00:00) en la zona del negocio → instantes UTC.
  const inicio = businessWallTimeToUtc(semana.desde, "00:00");
  const fin = businessWallTimeToUtc(sumarDias(semana.hasta, 1), "00:00");

  const movimientos = await prisma.stockMovement.findMany({
    where: { tenantId, type: "AJUSTE", createdAt: { gte: inicio, lt: fin } },
    select: {
      productId: true,
      qty: true,
      reason: true,
      createdBy: true,
      product: { select: { name: true, unit: true, saleUnit: true } },
    },
    orderBy: { createdAt: "asc" },
    take: MAX_MOVIMIENTOS + 1,
  });
  const truncado = movimientos.length > MAX_MOVIMIENTOS;
  const usados = truncado ? movimientos.slice(0, MAX_MOVIMIENTOS) : movimientos;

  const ultimoCosto = new Map(costos.rows.map((r) => [r.productId, r.sinCosto ? null : r.unitCost]));
  const productos = new Map<string, ProductoDeMerma>();
  for (const m of usados) {
    if (!m.productId || !m.product || productos.has(m.productId)) continue;
    productos.set(m.productId, {
      nombre: m.product.name,
      unidad: m.product.unit,
      saleUnit: m.product.saleUnit,
      costo: costoDeReferencia(ultimoCosto.get(m.productId), costos.extras.get(m.productId)?.cost),
    });
  }

  return { ...resumirMerma(usados, productos), truncado };
}
