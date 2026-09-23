// ============================================================================
// LECTURAS de Catálogo y precios — lo que leen las pantallas y las acciones del servidor.
// ============================================================================
//
// No es "use server": ninguna de estas funciones es un endpoint. Las llaman las páginas del
// servidor, que ya pasaron por `requireApp`. Por eso reciben el `tenantId` por parámetro sin
// riesgo: nadie de afuera puede elegirlo. Lo que corre adentro de la transacción de una acción
// está en precios-tx.ts.
//
// Dos columnas de `Product` no están en el cliente de Prisma: `category` (la góndola) y
// `cost` (el costo cargado a mano), de la migración cárnica, que todavía no está aplicada en
// todas las bases. Se leen con `to_jsonb(p) ->> 'columna'`, que da NULL si la columna no
// existe en vez de un error, y SIEMPRE adentro de `tenantTransaction` y con el `"tenantId"`
// escrito a mano: una consulta cruda fuera de la transacción corre sin el negocio puesto y,
// con RLS encendido, no ve nada (rls.ts). Es lo que le pasaba a `getProductExtras`
// (carniceria/product-extras.ts) hasta la integración de la ola 2, que la pasó adentro de la
// transacción; el Catálogo ya no la usa para la góndola.

import { prisma } from "@/lib/prisma";
import { tenantTransaction } from "@/lib/rls";
import { dateStrInBusinessTz } from "@/lib/datetime";
import { SELECT_INGRESOS, costosVigentesDe } from "@/lib/stock/costo";
import { leerCostosDelCatalogo } from "@/lib/inventory/inventory-loader";
import { leerProductosParaPrecios, type ProductoConUnidad } from "./precios-tx";
import {
  pendientesDeEtiqueta,
  resumirUltimoAumento,
  ultimaImpresion,
  whereAumentosGenerales,
  whereAuditoriaDeEtiquetas,
  type UltimoAumento,
} from "./precios-auditoria";

/** Los productos con su góndola (`leerProductosParaPrecios`), en una transacción propia. */
export function cargarProductosParaPrecios(tenantId: string): Promise<ProductoConUnidad[]> {
  return tenantTransaction((tx) => leerProductosParaPrecios(tx, tenantId), { tenantId });
}

/** La góndola explícita (`Product.category`) de cada producto que la tiene cargada. */
export function cargarGondolas(tenantId: string): Promise<Map<string, string>> {
  return tenantTransaction(async (tx) => {
    const filas = await tx.$queryRaw<{ id: string; category: string }[]>`
      SELECT p."id", (to_jsonb(p) ->> 'category') AS "category"
        FROM "Product" p
       WHERE p."tenantId" = ${tenantId} AND p."deletedAt" IS NULL
         AND (to_jsonb(p) ->> 'category') IS NOT NULL`;
    return new Map(filas.map((f) => [f.id, f.category]));
  }, { tenantId });
}

export type CostosDelCatalogo = {
  /** El costo VIGENTE (stock/costo.ts): el cargado a mano o el del último ingreso con costo. */
  vigentes: Record<string, number | null>;
  /** Sólo el cargado a mano (`Product.cost`). Es el que va en el formulario de edición. */
  cargados: Map<string, number>;
};

/**
 * Los costos del Catálogo: el mismo cálculo que Stock y Margen (`costosVigentesDe`), para
 * todos los productos no borrados, pausados incluidos (Stock sólo valúa los activos).
 *
 * El formulario de edición lleva el costo CARGADO, no el vigente: si llevara el vigente,
 * guardar un precio copiaría el costo de la última compra a `Product.cost`, y desde ahí ese
 * costo le ganaría a todas las compras siguientes (costo.ts, regla 1).
 */
export async function cargarCostosDelCatalogo(tenantId: string): Promise<CostosDelCatalogo> {
  const [productos, cargados] = await Promise.all([
    prisma.product.findMany({
      where: { tenantId, deletedAt: null },
      select: { id: true, ...SELECT_INGRESOS },
    }),
    leerCostosDelCatalogo(tenantId),
  ]);
  return { vigentes: costosVigentesDe(productos, cargados), cargados };
}

/**
 * El último cambio general de precios (Actualizar precios o la planilla), resumido. Misma
 * consulta que el número del botón (src/apps/kpis/precios.server.ts).
 */
export async function cargarUltimoAumento(tenantId: string, hoy: string): Promise<UltimoAumento | null> {
  const fila = await prisma.auditLog.findFirst({
    where: whereAumentosGenerales(tenantId),
    orderBy: { createdAt: "desc" },
    select: { createdAt: true, changes: true },
  });
  return resumirUltimoAumento(fila ? { diaDelCambio: dateStrInBusinessTz(fila.createdAt), changes: fila.changes } : null, hoy);
}

export type EstadoEtiquetas = {
  /** productId → fecha del cambio de precio que todavía no se imprimió. */
  pendientes: Map<string, Date>;
  ultimaImpresion: Date | null;
};

/**
 * Qué etiquetas faltan imprimir. La misma consulta y la misma cuenta que el número del botón
 * de Etiquetas: un `groupBy` por producto y acción con la fecha más reciente.
 */
export async function cargarEstadoEtiquetas(tenantId: string): Promise<EstadoEtiquetas> {
  const grupos = await prisma.auditLog.groupBy({
    by: ["entityId", "action"],
    where: whereAuditoriaDeEtiquetas(tenantId),
    _max: { createdAt: true },
  });
  return { pendientes: pendientesDeEtiqueta(grupos), ultimaImpresion: ultimaImpresion(grupos) };
}
