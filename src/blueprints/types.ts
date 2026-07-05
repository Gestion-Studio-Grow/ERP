// Sistema de Blueprints en código (ADR-002 / ADR-003 / FUNDAMENTOS-Y-VISION.md
// §"Blueprints: verticales, arquetipos y el genérico comodín").
//
// Un Blueprint es CONFIGURACIÓN PURA sobre el Core, no un fork: define qué
// vertical de negocio se está dando de alta (servicios/spa, carnicería/retail, …),
// qué capabilities del Core usa de forma central, su branding por defecto y cómo
// sembrar su catálogo mínimo editable. Cero schema propio: sólo parametriza y
// siembra modelos del Core (Service, Product, Box, …) que ya existen.
//
// Lo consume el provisioning (ADR-019, `scripts/provision-tenant.ts`) al dar de
// alta un tenant: `provisionTenant(..., { blueprint: "carniceria" })`.

import type { PrismaClient } from "@/generated/prisma/client";

// Cliente de transacción de Prisma: el `tx` que recibe el callback de
// `$transaction`. El seed de un blueprint corre DENTRO de la transacción del alta
// (todo-o-nada con el resto del provisioning).
export type PrismaTx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

// Branding/localización por defecto del vertical (BusinessSettings, módulo
// Localización). Todo opcional: lo que no traiga el blueprint ni los flags cae a
// los defaults del sitio (src/lib/settings.ts).
export interface TenantBrandingDefaults {
  shortLabel?: string;
  addressLine?: string;
  city?: string;
  hoursLabel?: string;
  whatsapp?: string;
  email?: string;
  instagram?: string;
  mapsUrl?: string;
  contactNote?: string;
}

export interface Blueprint {
  /** Identificador estable, kebab/lower (se pasa por `--blueprint`). */
  id: string;
  label: string;
  description: string;
  /**
   * Capabilities del Core que el vertical usa de forma central. Documental/config
   * por ahora (el gating efectivo es por rol en `capabilities.ts`); sirve para que
   * el alta y la UI sepan qué activa cada vertical sin duplicar código.
   */
  capabilities: string[];
  /** Branding por defecto; se puede pisar con los flags de branding del alta. */
  brandingDefaults?: TenantBrandingDefaults;
  /**
   * Siembra el catálogo mínimo editable del vertical. DEBE ser idempotente: chequea
   * si el tenant ya tiene catálogo y, si lo tiene, no toca nada. Devuelve true sólo
   * si sembró en esta corrida. Corre dentro de la transacción del alta.
   */
  seedCatalog(tx: PrismaTx, tenantId: string): Promise<boolean>;
}
