// ============================================================================
// SIEMBRA DEL CATÁLOGO DEL SUPERMERCADO — 380 productos de ejemplo en una sola pasada.
// ============================================================================
//
// Corre adentro de la transacción del alta (scripts/provision-tenant.ts), con el negocio ya
// puesto para RLS. Por eso inserta EN BLOQUE (`createManyAndReturn`, dos o tres consultas en
// total): de a uno eran 380 idas y vueltas a la base, y la transacción del alta tiene un tope
// de tiempo.
//
// Qué deja:
//   · cada producto con su código (EAN-13 o PLU de balanza), su alícuota de IVA (código de ARCA),
//     su presentación en `unit` ("900 ml", "x 12 u": de ahí sale el precio por litro del
//     cartel), su stock y su mínimo (`lowStockAt`: debajo, entra en "Sugerido de compra");
//   · el stock inicial ASENTADO en el libro de stock (una REPOSICION por producto, con motivo):
//     "Movimientos de un producto" explica desde el primer día por qué hay lo que hay;
//   · la sección en `Product.category` SI la columna existe (migración pendiente
//     prisma/pending-gate2/CarniceriaRubro.sql). Si no existe, la sección sale del nombre
//     (supermercado/secciones.ts) y no se pierde nada.
//
// Idempotente: si el negocio ya tiene productos, no toca nada.

import { Prisma } from "@/generated/prisma/client";
import type { PrismaTx } from "../types";
import { CATALOGO_SUPERMERCADO } from "./supermercado-catalogo";

export const MOTIVO_STOCK_INICIAL = "Stock inicial del catálogo de ejemplo";

export async function sembrarSupermercado(tx: PrismaTx, tenantId: string): Promise<boolean> {
  const hay = await tx.product.count({ where: { tenantId } });
  if (hay > 0) return false;

  const creados = await tx.product.createManyAndReturn({
    data: CATALOGO_SUPERMERCADO.map((c) =>
      c.sale === "kg"
        ? { tenantId, name: c.name, unit: "kg", saleUnit: "WEIGHT" as const, pricePerKg: c.pricePerKg, stock: c.stock, lowStockAt: c.minimo, trackStock: true, codigo: c.codigo, alicuotaIva: c.alicuotaIva }
        : { tenantId, name: c.name, unit: c.presentacion, saleUnit: "UNIT" as const, price: c.price, stock: c.stock, lowStockAt: c.minimo, trackStock: true, codigo: c.codigo, alicuotaIva: c.alicuotaIva },
    ),
    select: { id: true, codigo: true, stock: true },
  });

  await tx.stockMovement.createMany({
    data: creados.map((p) => ({
      tenantId,
      productId: p.id,
      type: "REPOSICION" as const,
      qty: p.stock,
      balanceAfter: p.stock,
      reason: MOTIVO_STOCK_INICIAL,
      createdBy: "system",
    })),
  });

  // La sección, sólo si la columna de góndola ya está en la base (no es de las migraciones de
  // producción todavía). La pregunta es al catálogo de Postgres, no a una tabla del negocio.
  const [col] = await tx.$queryRaw<{ n: number }[]>`
    SELECT count(*)::int AS n FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'Product' AND column_name = 'category'`;
  if (Number(col?.n ?? 0) > 0) {
    const seccionPorCodigo = new Map(CATALOGO_SUPERMERCADO.map((c) => [c.codigo, c.seccion]));
    const filas = creados.flatMap((p) => {
      const seccion = p.codigo ? seccionPorCodigo.get(p.codigo) : undefined;
      return seccion ? [Prisma.sql`(${p.id}, ${seccion})`] : [];
    });
    if (filas.length > 0) {
      await tx.$executeRaw`
        UPDATE "Product" AS p SET "category" = v.seccion
          FROM (VALUES ${Prisma.join(filas)}) AS v(id, seccion)
         WHERE p."id" = v.id AND p."tenantId" = ${tenantId}`;
    }
  }
  return true;
}
