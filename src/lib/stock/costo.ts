// ============================================================================
// COSTO VIGENTE — un solo número por producto, el mismo en Stock, Catálogo y Margen.
// ============================================================================
//
// POR QUÉ. Hasta acá cada pantalla sacaba el costo de un lado distinto: Inventario y Margen
// del último `StockPurchaseItem`; el Catálogo de `Product.cost` y, si faltaba, de la última
// compra. Los cortes que salen de un despiece entran por el registro de movimientos
// (REPOSICION con costo, despiece-actions.ts) y nunca por una compra, así que Stock y Margen
// los mostraban "sin costo" mientras el Catálogo sí les ponía uno. El vacío costaba una
// cosa en una pantalla y otra en la de al lado.
//
// LA REGLA (una sola, acá):
//   1. Si el producto tiene `Product.cost` (columna de la migración cárnica, que todavía no
//      está en ninguna base medida), manda ése: lo pide el catálogo de la ola 2. Es el costo
//      que fija la dueña a mano: el despiece ya NO la escribe (carniceria/despiece-actions.ts,
//      integración de la ola 2); su costo viaja en la REPOSICION y lo lee el punto 2. OJO: un
//      `Product.cost` que un despiece haya escrito ANTES de ese cambio sigue ahí y sigue
//      mandando hasta que la dueña lo cambie o lo borre.
//   2. Si no, el ÚLTIMO INGRESO CON COSTO: la entrada más reciente con costo > 0, sea una
//      compra, una reposición o la salida de un despiece. Se busca en el registro de
//      movimientos (COMPRA/REPOSICION) y en las líneas de compra, porque las compras de antes
//      de que existiera el registro sólo están en `StockPurchaseItem` (medido en la base de QA:
//      6 de las 7 líneas de compra de beauty-spa no tienen movimiento).
//   3. Si no hay ninguno: sin costo (`null`). Cero o negativo no es un costo, es un dato que
//      falta: nunca se valúa en $0.
// "Último costo" es el criterio que se tomó para valuar; que coincida con el de Ganancias para
// bienes de cambio es PROVISIONAL A CONFIRMAR con la contadora (el corte de un despiece no es
// una compra: su costo sale del rendimiento, no de una factura).
//
// Este archivo NO importa ningún valor de Prisma ni de servidor: lo importa `ledger.ts`, que a
// su vez lo importa el formulario de ajustes (client component) por `round3`. La lectura en la
// base recibe la transacción del llamador.

import type { Prisma } from "@/generated/prisma/client";

/** Tipos de movimiento que son un INGRESO con costo propio (el despiece entra como REPOSICION). */
export const TIPOS_DE_INGRESO = ["COMPRA", "REPOSICION"] as const;

/** ¿Es un costo usable? Finito y mayor que cero. */
export function esCosto(n: number | null | undefined): n is number {
  return typeof n === "number" && Number.isFinite(n) && n > 0;
}

/**
 * El costo vigente de un producto. PURA.
 * `costoDelCatalogo` = `Product.cost` (null si la columna no existe o está vacía);
 * `ultimoIngreso` = el costo del ingreso más reciente con costo.
 */
export function costoVigente(
  costoDelCatalogo: number | null | undefined,
  ultimoIngreso: number | null | undefined,
): number | null {
  if (esCosto(costoDelCatalogo)) return costoDelCatalogo;
  if (esCosto(ultimoIngreso)) return ultimoIngreso;
  return null;
}

/** Un ingreso con costo, venga del registro de movimientos o de una línea de compra. */
export type IngresoConCosto = { unitCost: number | null; fecha: Date };

/**
 * El costo del ingreso más reciente con costo > 0, o `null`. PURA. Recibe los candidatos de
 * las dos fuentes mezclados y en cualquier orden: gana la fecha, no la fuente.
 */
export function ultimoIngresoConCosto(ingresos: readonly IngresoConCosto[]): number | null {
  let mejor: IngresoConCosto | null = null;
  for (const i of ingresos) {
    if (!esCosto(i.unitCost)) continue;
    if (!mejor || i.fecha.getTime() > mejor.fecha.getTime()) mejor = i;
  }
  return mejor ? (mejor.unitCost as number) : null;
}

/**
 * Lo que hace falta leer de cada producto para su costo vigente, en UNA consulta de Prisma:
 * el último movimiento de ingreso con costo y la última línea de compra con costo. Lo usan la
 * pantalla de Stock (vía `getInventoryValuation`), el Catálogo (`cargarCostosDelCatalogo`:
 * `costosVigentesDe` + `leerCostosDelCatalogo`, pausados incluidos), el Margen y el número del
 * botón de Stock, así que los cuatro leen exactamente lo mismo.
 */
export const SELECT_INGRESOS = {
  stockMovements: {
    where: { type: { in: [...TIPOS_DE_INGRESO] }, unitCost: { gt: 0 } },
    orderBy: { createdAt: "desc" },
    take: 1,
    select: { unitCost: true, createdAt: true },
  },
  purchaseItems: {
    where: { unitCost: { gt: 0 } },
    orderBy: { purchase: { createdAt: "desc" } },
    take: 1,
    select: { unitCost: true, purchase: { select: { createdAt: true } } },
  },
} satisfies Prisma.ProductSelect;

/** La forma que devuelve `SELECT_INGRESOS` por producto. */
export type IngresosLeidos = {
  stockMovements: readonly { unitCost: number | null; createdAt: Date }[];
  purchaseItems: readonly { unitCost: number; purchase: { createdAt: Date } }[];
};

/** El último ingreso con costo de un producto leído con `SELECT_INGRESOS`. PURA. */
export function ultimoIngresoDe(p: IngresosLeidos): number | null {
  return ultimoIngresoConCosto([
    ...p.stockMovements.map((m) => ({ unitCost: m.unitCost, fecha: m.createdAt })),
    ...p.purchaseItems.map((i) => ({ unitCost: i.unitCost, fecha: i.purchase.createdAt })),
  ]);
}

/**
 * El costo vigente de cada producto de una lectura con `SELECT_INGRESOS`, más los costos de
 * catálogo (`Product.cost`) que se hayan podido leer. PURA.
 */
export function costosVigentesDe(
  productos: readonly (IngresosLeidos & { id: string })[],
  costosDelCatalogo: ReadonlyMap<string, number>,
): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  for (const p of productos) out[p.id] = costoVigente(costosDelCatalogo.get(p.id), ultimoIngresoDe(p));
  return out;
}

/** Cliente con el que se lee adentro de una transacción (la del llamador). */
type TxConRaw = Pick<Prisma.TransactionClient, "$queryRaw">;

/**
 * El costo vigente de VARIOS productos, leído DENTRO de la transacción del llamador (la del
 * ledger al registrar una salida, la de un recuento o una merma). Una sola consulta:
 *   · `Product.cost` se lee con `to_jsonb(p) ->> 'cost'`: si la columna no existe en esta base
 *     devuelve NULL en vez de un error. Un error acá abortaría la transacción entera (una venta
 *     que no se registra por no poder leer un costo), así que no se nombra una columna que el
 *     cliente de Prisma todavía no conoce.
 *   · el último ingreso con costo, de las dos fuentes, por fecha.
 * Query cruda: lleva el `"tenantId"` escrito a mano en cada tabla (el candado de la app no la
 * cubre, ver rls.ts); corre en la transacción del llamador, que ya tiene el negocio puesto.
 * Un producto que no es del negocio no vuelve: queda fuera del mapa.
 */
export async function costosVigentesEnTx(
  tx: TxConRaw,
  tenantId: string,
  productIds: readonly string[],
): Promise<Map<string, number | null>> {
  const ids = [...new Set(productIds.filter(Boolean))];
  if (ids.length === 0) return new Map();
  const filas = await tx.$queryRaw<{ id: string; catalogo: unknown; ultimo: unknown }[]>`
    SELECT p."id",
           (to_jsonb(p) ->> 'cost')::float8 AS "catalogo",
           (SELECT x.c FROM (
              SELECT m."unitCost" AS c, m."createdAt" AS f
                FROM "StockMovement" m
               WHERE m."tenantId" = ${tenantId} AND m."productId" = p."id"
                 AND m."type"::text IN ('COMPRA', 'REPOSICION') AND m."unitCost" > 0
              UNION ALL
              SELECT i."unitCost" AS c, s."createdAt" AS f
                FROM "StockPurchaseItem" i
                JOIN "StockPurchase" s ON s."id" = i."purchaseId" AND s."tenantId" = ${tenantId}
               WHERE i."tenantId" = ${tenantId} AND i."productId" = p."id" AND i."unitCost" > 0
            ) x ORDER BY x.f DESC LIMIT 1) AS "ultimo"
      FROM "Product" p
     WHERE p."tenantId" = ${tenantId} AND p."id" = ANY(${ids}::text[])`;
  return new Map(filas.map((f) => [f.id, costoVigente(numeroONull(f.catalogo), numeroONull(f.ultimo))]));
}

/** El costo vigente de UN producto adentro de la transacción del llamador. */
export async function costoVigenteEnTx(tx: TxConRaw, tenantId: string, productId: string): Promise<number | null> {
  return (await costosVigentesEnTx(tx, tenantId, [productId])).get(productId) ?? null;
}

/** El driver puede devolver float8 como number o como string: se normaliza acá. */
function numeroONull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}
