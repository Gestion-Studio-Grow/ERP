// Lo que las páginas legales de «Pedí Local» leen del negocio del host: su configuración (o 404
// si el negocio no tiene el delivery local) y su WhatsApp para el botón de arrepentimiento.
// Sólo servidor. El aislamiento: getTenantIdentity/getCurrentTenantId por request (ADR-018).

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTenantIdentity } from "@/lib/identidad-rubro";
import { configDeliveryLocal, type ConfigDeliveryLocal } from "@/lib/delivery-local/config";
import { getCurrentTenantId } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { numeroWhatsApp } from "@/lib/whatsapp-cta";
import { logger } from "@/lib/logger";

/** La configuración del negocio del host; si no tiene «Pedí Local», 404. */
export async function configDelHost(): Promise<ConfigDeliveryLocal> {
  const identity = await getTenantIdentity();
  const cfg = configDeliveryLocal(identity.slug);
  if (!cfg) notFound();
  return cfg;
}

/** El número de WhatsApp del local listo para wa.me, o "" si no cargó uno usable. */
export async function whatsappDelLocal(): Promise<string> {
  try {
    const tenantId = await getCurrentTenantId();
    const s = await prisma.businessSettings.findUnique({ where: { tenantId }, select: { whatsapp: true } });
    return numeroWhatsApp(s?.whatsapp);
  } catch (e) {
    logger.warn("tienda", "no se pudo leer el WhatsApp del local", { error: e instanceof Error ? e.message : String(e) });
    return "";
  }
}

/** Metadata de un texto legal, con el sello GSG. Sin indexar: es letra chica, no una vidriera. */
export function metadataLegal(titulo: string, cfg: ConfigDeliveryLocal | null): Metadata {
  return {
    title: cfg ? `${titulo} · ${cfg.nombre}` : titulo,
    generator: "Gestión Studio Grow",
    robots: { index: false, follow: true },
  };
}
