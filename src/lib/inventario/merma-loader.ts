// ============================================================================
// Loader del tablero de MERMA Y FALTANTE de Stock — lee, no escribe.
// ============================================================================
//
// Trae los AJUSTE del ledger de la semana elegida (en hora del negocio) y los resume con
// `resumirMerma` (stock/merma-core.ts, puro y testeado). Cada movimiento se valúa con el costo
// guardado en su fila; si es de antes de que el ledger lo guardara, con el costo VIGENTE de las
// mismas filas que ya cargó la pantalla de Stock (`getInventory`), así la merma se valúa con el
// mismo número que la valuación de al lado.
//
// Server-only y sin "use server": no es un endpoint. Guard `stock:read`, como el resto de
// Stock; el `where` lleva `tenantId` explícito además del scope del cliente. Quien no ve
// costos recibe los kilos sin pesos (la pantalla no se los pide).

import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/authz";
import { getCurrentTenantId } from "@/lib/tenant";
import { businessWallTimeToUtc } from "@/lib/datetime";
import type { InventoryRow } from "@/lib/inventario/valuation";
import {
  resumirMerma,
  sumarDias,
  whereAjustesDelPeriodo,
  type ProductoDeMerma,
  type ResumenDeMerma,
  type Semana,
} from "@/lib/stock/merma-core";

/** Tope de movimientos por semana. Un local registra decenas; esto sólo evita una lectura sin fin. */
const MAX_MOVIMIENTOS = 5000;

export async function getMermaDeLaSemana(
  semana: Semana,
  costos: { rows: readonly InventoryRow[]; conCostos: boolean },
): Promise<ResumenDeMerma & { truncado: boolean }> {
  await requireCapability("stock:read");
  const tenantId = await getCurrentTenantId();

  // [desde 00:00, hasta+1 00:00) en la zona del negocio → instantes UTC.
  const inicio = businessWallTimeToUtc(semana.desde, "00:00");
  const fin = businessWallTimeToUtc(sumarDias(semana.hasta, 1), "00:00");

  const movimientos = await prisma.stockMovement.findMany({
    where: whereAjustesDelPeriodo(tenantId, inicio, fin),
    select: {
      productId: true,
      qty: true,
      reason: true,
      createdBy: true,
      unitCost: true,
      product: { select: { name: true, unit: true, saleUnit: true } },
    },
    orderBy: { createdAt: "asc" },
    take: MAX_MOVIMIENTOS + 1,
  });
  const truncado = movimientos.length > MAX_MOVIMIENTOS;
  const usados = (truncado ? movimientos.slice(0, MAX_MOVIMIENTOS) : movimientos).map((m) =>
    costos.conCostos ? m : { ...m, unitCost: null },
  );

  const vigente = new Map(costos.rows.map((r) => [r.productId, r.sinCosto || !costos.conCostos ? null : r.unitCost]));
  const productos = new Map<string, ProductoDeMerma>();
  for (const m of usados) {
    if (!m.productId || !m.product || productos.has(m.productId)) continue;
    productos.set(m.productId, {
      nombre: m.product.name,
      unidad: m.product.unit,
      saleUnit: m.product.saleUnit,
      costo: vigente.get(m.productId) ?? null,
    });
  }

  return { ...resumirMerma(usados, productos), truncado };
}
