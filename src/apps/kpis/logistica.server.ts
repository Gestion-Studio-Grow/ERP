// ============================================================================
// NÚMEROS DE STOCK Y COMPRAS — Stock.
// ============================================================================
//
// Mismas reglas que todos los loaders de esta carpeta (ver mostrador.server.ts).
//
// Queda para el frente de logística (ola 2), con su porqué: el stock valorizado y "sin costo"
// necesitan el costo vigente, que hoy sale de otra lectura y que ese frente unifica; Recibir
// mercadería, Mermas, Lotes y Despiece cuentan por mes o por lote con reglas que todavía se
// están corrigiendo (el proveedor de la compra hoy no se graba). Van sin número hasta entonces.

import { computeStockValuation } from "@/lib/inventory/valuation";
import { cortesEnNegativo } from "@/lib/stock/merma-core";
import { fmtNumberAR } from "@/components/ui/format";
import { plural, type LoaderKpi } from "./nucleo.server";

/**
 * "5 cortes bajo el mínimo", y en alerta los que están en negativo (una venta salió con más
 * de lo que el sistema creía que había: hay que recontarlos).
 *
 * Lee los mismos productos que la pantalla de Stock (`getInventoryValuation`,
 * inventory-loader.ts: activos y no borrados del negocio) y cuenta con SUS reglas:
 * "bajo el mínimo" es `computeStockValuation` (stock ≤ mínimo) y "en negativo" es
 * `cortesEnNegativo`, la lista que la pantalla pone primera. Se cuenta en memoria y no con
 * una comparación entre columnas en la base porque no está medido que esa comparación
 * pase bien por la extensión de RLS; son cientos de filas, no miles.
 */
export const inventario: LoaderKpi = async ({ db, tenantId, sustantivo }) => {
  const productos = await db.product.findMany({
    where: { tenantId, deletedAt: null, active: true },
    select: { id: true, name: true, unit: true, stock: true, lowStockAt: true },
  });
  const bajoMinimo = computeStockValuation(productos, {}).summary.lowStockCount;
  const negativos = cortesEnNegativo(productos).length;
  return {
    valor: fmtNumberAR(bajoMinimo),
    detalle: `${plural(bajoMinimo, sustantivo.uno, sustantivo.varios)} bajo el mínimo`,
    ...(negativos > 0
      ? {
          alerta: {
            valor: fmtNumberAR(negativos),
            texto: `${plural(negativos, sustantivo.uno, sustantivo.varios)} en negativo`,
          },
        }
      : {}),
  };
};

export const LOADERS_LOGISTICA: Readonly<Record<string, LoaderKpi>> = { inventario };
