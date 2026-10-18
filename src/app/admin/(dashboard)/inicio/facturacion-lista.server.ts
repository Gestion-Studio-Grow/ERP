// ============================================================================
// ¿LA FACTURACIÓN ESTÁ CONFIGURADA? ¿LA VIDRIERA TIENE WHATSAPP? — dos pasos de «Para arrancar».
// ============================================================================
//
// Lee del negocio actual si tiene CUIT del emisor y punto de venta cargados: la MISMA lectura (mismas
// columnas, mismo cliente) que `getFacturacion` en src/lib/facturacion-actions.ts, sin las facturas.
// No devuelve el CUIT: sólo si está o no. No es una Server Action (sin "use server"): la llama el
// Inicio en el servidor, sólo mientras el negocio nunca cerró un día y sólo si la persona ve
// Facturación. Si falla (schema viejo sin columnas `arca*`, sin tenant), `null` y el paso no sale.

import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { getCurrentTenantId } from "@/lib/tenant";
import type { PrimerDiaDelMostrador } from "./bandeja-core";

export const facturacionConfigurada = cache(async (): Promise<{ cuit: boolean; puntoVenta: boolean } | null> => {
  try {
    const tenantId = await getCurrentTenantId();
    const t = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { arcaCuit: true, arcaPuntoVenta: true },
    });
    if (!t) return null;
    return { cuit: (t.arcaCuit ?? "").replace(/\D/g, "").length === 11, puntoVenta: (t.arcaPuntoVenta ?? 0) > 0 };
  } catch {
    return null;
  }
});

/**
 * ¿La vidriera tiene el WhatsApp del negocio? Mismo criterio que la vidriera (`hayWhatsApp`: algún
 * dígito en BusinessSettings.whatsapp). `null` = no se pudo leer (el paso no sale).
 */
export const whatsappDeLaVidriera = cache(async (): Promise<{ cargado: boolean } | null> => {
  try {
    const tenantId = await getCurrentTenantId();
    const s = await prisma.businessSettings.findUnique({ where: { tenantId }, select: { whatsapp: true } });
    return { cargado: (s?.whatsapp ?? "").replace(/\D/g, "").length > 0 };
  } catch {
    return null;
  }
});

/**
 * Lo que mira la lista del primer día de un negocio que vende (`pasosDelMostrador`, bandeja-core.ts):
 * horario y dirección de la vidriera, cuántos productos tienen precio, si ya hubo una venta cobrada y
 * si ya hubo una factura autorizada. Sólo la pide el Inicio mientras el negocio nunca cerró un día y
 * tiene la app Vender: cuatro lecturas chicas (un conteo y tres «¿hay alguno?»), cada una con el
 * `tenantId` explícito además de RLS. Si algo falla, `null` y queda la lista de siempre.
 */
export const primerDiaDelMostrador = cache(async (): Promise<PrimerDiaDelMostrador | null> => {
  try {
    const tenantId = await getCurrentTenantId();
    const [s, productosConPrecio, venta, factura] = await Promise.all([
      prisma.businessSettings.findUnique({ where: { tenantId }, select: { hoursLabel: true, addressLine: true } }),
      prisma.product.count({
        where: { tenantId, deletedAt: null, active: true, OR: [{ price: { gt: 0 } }, { pricePerKg: { gt: 0 } }] },
      }),
      prisma.order.findFirst({ where: { tenantId, paid: true, status: { not: "CANCELLED" } }, select: { id: true } }),
      prisma.invoice.findFirst({ where: { tenantId, status: "AUTHORIZED" }, select: { id: true } }),
    ]);
    return {
      horario: (s?.hoursLabel ?? "").trim().length > 0,
      direccion: (s?.addressLine ?? "").trim().length > 0,
      productosConPrecio,
      hayVenta: venta !== null,
      hayFactura: factura !== null,
    };
  } catch {
    return null;
  }
});
