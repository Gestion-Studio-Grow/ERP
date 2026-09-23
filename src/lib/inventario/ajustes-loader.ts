// ============================================================================
// LECTURAS de Mermas y de Recuento — servidor, sin "use server".
// ============================================================================
//
// Vivían en stock-adjustment-actions.ts, que lleva "use server": cada export de ese archivo
// es un endpoint HTTP, así que el loader con los productos y los últimos movimientos se podía
// llamar desde afuera de la pantalla. Acá no son endpoints: los llaman las páginas, que antes
// pasaron por `requireApp`. Igual piden su capability (defensa en profundidad) y leen siempre
// el negocio del request.

import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/authz";
import { roleHasCapability } from "@/lib/capabilities";
import { getCurrentTenantId } from "@/lib/tenant";
import { filtroDeAjustables } from "@/lib/stock/adjustment-core";
import { leerCostosVigentes } from "@/lib/inventory/inventory-loader";
import { effectiveCategoria, CORTE_CATEGORIAS, type CorteCategoria } from "@/lib/carniceria/cortes";
import { SIN_TRASLADOS } from "@/lib/multilocal/traslado-core";
import { armarGondolas, type Gondola, type ProductoARecontar } from "./recuento";

// --- Mermas ---
//
// Productos ajustables (activos, no borrados) con su stock actual, y los últimos movimientos
// de AJUSTE para el histórico, sin los de un traslado entre locales (`SIN_TRASLADOS`): un
// traslado no es mercadería perdida y su remito se ve en Traslados. `productoPreelegido` (el
// `?producto=` del "Recontar" del catálogo) entra a la lista AUNQUE esté inactivo
// (`filtroDeAjustables`). Nunca sale del negocio: el `where` lleva `tenantId`.
export async function getAdjustmentData(productoPreelegido?: string) {
  await requireCapability("stock:read");
  const tenantId = await getCurrentTenantId();
  const [products, recent] = await Promise.all([
    prisma.product.findMany({
      where: { tenantId, deletedAt: null, ...filtroDeAjustables(productoPreelegido) },
      orderBy: { name: "asc" },
      select: { id: true, name: true, unit: true, stock: true, active: true },
    }),
    prisma.stockMovement.findMany({
      where: { tenantId, type: "AJUSTE", ...SIN_TRASLADOS },
      orderBy: { createdAt: "desc" },
      take: 15,
      select: {
        id: true,
        qty: true,
        balanceAfter: true,
        reason: true,
        createdAt: true,
        product: { select: { name: true } },
      },
    }),
  ]);
  return { products, recent };
}

// --- Recuento ---

/** Lo que necesita la planilla de recuento: las góndolas con sus productos. */
export interface DatosDeRecuento {
  gondolas: Gondola[];
  /** ¿Quien cuenta puede ver costos? Si no, la diferencia se muestra sólo en cantidad. */
  conCostos: boolean;
  /**
   * Hora del servidor al armar la pantalla (ms). SÓLO para mostrar "contado hace N días": la
   * hora de cada conteo NO sale de acá (al volver con Atrás la página guardada la trae vieja),
   * sale del reloj del teléfono (`horaDelConteo`, adjustment-core.ts).
   */
  ahoraServidor: number;
}

/**
 * Los productos que se cuentan (controlan stock, activos) agrupados por góndola, con su
 * stock, su costo vigente (sólo con `costs:read`) y la fecha de su último recuento. En una
 * carnicería la góndola es la del corte (vaca, cerdo, pollo…, `effectiveCategoria`); en los
 * demás rubros, una sola.
 */
export async function getRecuentoData(opts: { carniceria: boolean; sustantivoPlural: string }): Promise<DatosDeRecuento> {
  const user = await requireCapability("stock:count");
  const tenantId = await getCurrentTenantId();
  const conCostos = roleHasCapability(user.role, "costs:read");

  const [productos, ultimos, costos] = await Promise.all([
    prisma.product.findMany({
      where: { tenantId, deletedAt: null, active: true, trackStock: true },
      select: { id: true, name: true, unit: true, stock: true, saleUnit: true },
      orderBy: { name: "asc" },
    }),
    // Último recuento de cada producto: el AJUSTE cuyo motivo empieza con "Recuento" (con
    // diferencia o sin ella: los sin diferencia quedan en 0, ver ledger.ts).
    prisma.stockMovement.groupBy({
      by: ["productId"],
      where: { tenantId, type: "AJUSTE", reason: { startsWith: "Recuento" } },
      _max: { createdAt: true },
    }),
    conCostos ? leerCostosVigentes(tenantId) : Promise.resolve({} as Record<string, number | null>),
  ]);
  const ultimo = new Map(ultimos.flatMap((u) => (u.productId && u._max.createdAt ? [[u.productId, u._max.createdAt] as const] : [])));

  const items: ProductoARecontar[] = productos.map((p) => ({
    id: p.id,
    nombre: p.name,
    unidad: p.unit,
    kilo: p.saleUnit === "WEIGHT",
    stock: p.stock,
    costo: conCostos ? (costos[p.id] ?? null) : null,
    ultimoRecuento: ultimo.get(p.id)?.toISOString() ?? null,
  }));

  const gondolaDe = (p: ProductoARecontar): { id: string; nombre: string } => {
    if (!opts.carniceria) return { id: "todo", nombre: `Todos los ${opts.sustantivoPlural}` };
    const c: CorteCategoria = effectiveCategoria(p.nombre);
    return { id: c, nombre: CORTE_CATEGORIAS.find((x) => x.id === c)?.label ?? "Otros" };
  };
  const orden = opts.carniceria ? CORTE_CATEGORIAS.map((c) => c.id as string) : ["todo"];

  return { gondolas: armarGondolas(items, gondolaDe, orden), conCostos, ahoraServidor: Date.now() };
}
