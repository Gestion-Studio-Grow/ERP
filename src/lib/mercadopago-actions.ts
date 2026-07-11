"use server";

/**
 * Server actions de la integración Mercado Pago (auto-facturado, ADR-024/025).
 * Mismo molde que bancos-actions: gated por `billing:manage`, tenant explícito.
 */

import { revalidatePath } from "next/cache";
import { requireCapability } from "@/lib/authz";
import { getCurrentTenantId } from "@/lib/tenant";
import { isInvoicingEnabled } from "@/lib/fiscal";
import { logger } from "@/lib/logger";
import {
  estadoIntegracionMP,
  sincronizarMercadoPago,
} from "@/lib/mercadopago-auto";
import type { ResumenIngesta } from "@/plugins/mercadopago";

export interface EstadoMercadoPago {
  /** ¿Hay credenciales reales cargadas (token en el entorno)? */
  conectado: boolean;
  /** "real" con token; "prueba" sin token (stub, no llama a Mercado Pago). */
  modo: "real" | "prueba";
  /** ¿La facturación está encendida? (sin esto el webhook solo acusa recibo). */
  facturacionActiva: boolean;
}

/** Estado de la integración para la pantalla de Facturación. */
export async function estadoMercadoPagoAction(): Promise<EstadoMercadoPago> {
  await requireCapability("billing:manage");
  const { conectado, modo } = estadoIntegracionMP();
  return { conectado, modo, facturacionActiva: isInvoicingEnabled() };
}

export type ResultadoSincronizacion =
  | { ok: true; resumen: ResumenIngesta }
  | { ok: false; error: string };

/**
 * Trae los cobros históricos de la cuenta de Mercado Pago y los pasa por el
 * pipeline (clasificar → reglas del dueño → facturar o cola de revisión).
 * Idempotente: correrlo dos veces no duplica nada.
 */
export async function sincronizarMercadoPagoAction(criterio?: {
  desde?: string; // AAAAMMDD
  hasta?: string; // AAAAMMDD
}): Promise<ResultadoSincronizacion> {
  await requireCapability("billing:manage");
  const tenantId = await getCurrentTenantId();

  if (!isInvoicingEnabled()) {
    return {
      ok: false,
      error: "La facturación todavía no está encendida en este entorno (paso del dueño).",
    };
  }

  try {
    const resumen = await sincronizarMercadoPago(tenantId, criterio ?? {});
    revalidatePath("/admin/facturacion/bancos");
    revalidatePath("/admin/facturacion");
    return { ok: true, resumen };
  } catch (err) {
    logger.error("mercadopago", "backfill falló", err, { tenantId });
    return {
      ok: false,
      error:
        "No se pudo traer el historial de Mercado Pago. Revisá la conexión y probá de nuevo en unos minutos.",
    };
  }
}
