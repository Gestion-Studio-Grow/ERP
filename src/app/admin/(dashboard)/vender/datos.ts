// Lo que lee la pantalla Vender. No es una Server Action (no lleva "use server": eso haría de
// cada export un endpoint): es un lector que llama la página, ya detrás de `requireApp`, con el
// negocio del request. Cada lectura lleva el `tenantId` explícito además de RLS, como el resto
// del mostrador.

import "server-only";
import { prisma } from "@/lib/prisma";
import { businessWallTimeToUtc } from "@/lib/datetime";
import { logger } from "@/lib/logger";
import { leerConfigEnvios, type ConfigEnvios } from "@/lib/envios/config";
import { lastClosedDay } from "@/lib/caja/frontera-cierre";
import { isFrozenDay } from "@/lib/caja/cierre-diario";
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
      // `codigo`: el código de barras o el PLU de la balanza, para el lector y el campo de la
      // etiqueta. La página lo saca antes de mandarlo al navegador si no hay ni módulo `terminal`
      // ni balanza configurada.
      select: { id: true, name: true, saleUnit: true, price: true, pricePerKg: true, unit: true, codigo: true },
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

// ── MOSTRADOR BOUTIQUE (interruptor `mostrador-boutique`) ───────────────────────
//
// Lo que suma el mostrador boutique: las zonas de envío del negocio (el MISMO módulo que lee la
// tienda, src/lib/envios) y si el día de caja está cerrado (la MISMA frontera que frena el cobro
// en `createOrder`). Si algo no se puede leer, Vender sigue: sin zonas ofrece el pedido como hoy
// y sin el dato del día el servidor igual frena el cobro con su mensaje.

export type ExtrasBoutique = {
  /** Las zonas de envío y la regla del retiro; null = no se pudo leer (el pedido sigue como hoy). */
  envios: ConfigEnvios | null;
  /** Hasta qué día está cerrada la caja, si HOY está cerrado; null = hoy se cobra. */
  diaCerrado: string | null;
};

export async function cargarBoutique(tenantId: string, hoy: string): Promise<ExtrasBoutique> {
  const [envios, cerradoHasta] = await Promise.all([
    leerConfigEnvios(prisma, tenantId)
      .then(({ version: _version, ...config }): ConfigEnvios => {
        void _version;
        return config;
      })
      .catch((e) => {
        logger.error("vender.envios", "no se pudo leer la configuración de envíos: el pedido sigue sin zonas", e);
        return null;
      }),
    lastClosedDay(tenantId).catch((e) => {
      logger.error("vender.dia", "no se pudo leer el cierre del día: Vender no muestra la banda (el cobro lo frena igual)", e);
      return null;
    }),
  ]);
  return { envios, diaCerrado: cerradoHasta && isFrozenDay(hoy, cerradoHasta) ? cerradoHasta : null };
}
