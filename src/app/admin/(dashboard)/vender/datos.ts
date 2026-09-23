// Lo que lee la pantalla Vender. No es una Server Action (no lleva "use server": eso haría de
// cada export un endpoint): es un lector que llama la página, ya detrás de `requireApp`, con el
// negocio del request. Cada lectura lleva el `tenantId` explícito además de RLS, como el resto
// del mostrador.

import "server-only";
import { prisma } from "@/lib/prisma";
import { businessWallTimeToUtc } from "@/lib/datetime";
import { BOTONES_RAPIDOS, DIAS_MAS_VENDIDOS, masVendidos } from "./reglas-venta";

export async function cargarVender(tenantId: string, hoy: string) {
  // Últimos 30 días hasta ahora. Se cuentan ventas cobradas y no anuladas: un pedido online
  // que nadie pagó no dice qué se vende en el mostrador.
  const desde = new Date(businessWallTimeToUtc(hoy, "00:00").getTime() - DIAS_MAS_VENDIDOS * 86_400_000);
  const [products, grupos, tenant] = await Promise.all([
    // Lo mismo que vende el POS de la bandeja (`getPosData`): activos, no borrados, con precio.
    prisma.product.findMany({
      where: {
        tenantId,
        deletedAt: null,
        active: true,
        OR: [{ price: { not: null } }, { pricePerKg: { not: null } }],
      },
      orderBy: { name: "asc" },
      select: { id: true, name: true, saleUnit: true, price: true, pricePerKg: true, unit: true },
    }),
    // Cuántas veces se vendió cada producto. Las líneas con precio a mano (sin producto) no
    // cuentan: no hay botón posible para ellas.
    prisma.orderItem.groupBy({
      by: ["productId"],
      where: {
        tenantId,
        productId: { not: null },
        order: { is: { tenantId, paid: true, status: { not: "CANCELLED" }, createdAt: { gte: desde } } },
      },
      _count: { _all: true },
      orderBy: { _count: { productId: "desc" } },
      // El doble: algunos pueden haber dejado de venderse y se descartan después.
      take: BOTONES_RAPIDOS * 2,
    }),
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } }),
  ]);
  const rapidos = masVendidos(grupos, new Set(products.map((p) => p.id)));
  return { products, rapidos, negocio: tenant?.name ?? "Mi negocio" };
}
