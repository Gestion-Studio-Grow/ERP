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
