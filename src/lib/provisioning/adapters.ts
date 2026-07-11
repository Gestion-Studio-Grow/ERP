// Fábrica de tenants — ADAPTADORES REALES (ADR-074).
//
// El único archivo del módulo que se acopla a la app: resuelve blueprints reales (ADR-002),
// consulta colisiones contra `operatorPrisma` (control-plane, ADR-021) y —el corazón del
// reuso (ADR-055)— el committer envuelve `provisionTenant` de ADR-019 sin reimplementarlo.
//
// ⚠️ Esta iteración es spec + scaffold: estos adaptadores están CABLEADOS pero NO se ejecutan
// contra prod (los tests usan los stubs de `stubs.ts`). El día del wiring real, la consola
// (RFC-003) los inyecta en `runTenantProvisioning`. Los efectos externos (host/DNS, email)
// siguen stubbeados hasta tener sus servicios (ver `stubs.ts`).

import type { PrismaClient } from "@/generated/prisma/client";
import { getBlueprint, resolveBlueprint as resolveRubro, DEFAULT_BLUEPRINT_ID } from "@/blueprints";
import { defaultModulesForBlueprint } from "@/blueprints/presets-meta";
import { provisionTenant } from "../../../scripts/provision-tenant";
import type { ProvisionTenantInput, ProvisionPlan, BlueprintResolution, CommitResult } from "./types";
import type { PlanDeps, CollisionChecker, TenantCommitter } from "./ports";
import { EMPRESA_MODULE_IDS } from "./stubs";
import { editionToProfile } from "./console-input";

/** Resuelve el blueprint efectivo con la misma precedencia del CLI/consola: explícito › rubro › default. */
export function resolveBlueprintReal(input: ProvisionTenantInput): BlueprintResolution {
  if (input.blueprint) {
    const bp = getBlueprint(input.blueprint); // lanza si el id no existe
    return { id: bp.id, label: bp.label, note: `explícito (blueprint=${bp.id})`, matched: true };
  }
  if (input.rubro) {
    const m = resolveRubro(input.rubro);
    const bp = getBlueprint(m.blueprintId);
    return {
      id: bp.id,
      label: bp.label,
      note: m.matched
        ? `rubro "${input.rubro}" → vertical "${bp.id}"`
        : `rubro "${input.rubro}" sin vertical propio → comodín "${bp.id}"`,
      matched: m.matched,
    };
  }
  const bp = getBlueprint(DEFAULT_BLUEPRINT_ID);
  return { id: bp.id, label: bp.label, note: `default (${bp.id})`, matched: true };
}

/** Checker de colisiones real: consulta el control-plane (read-only, no escribe). */
export class PrismaCollisionChecker implements CollisionChecker {
  constructor(private readonly prisma: PrismaClient) {}
  async slugTaken(slug: string): Promise<boolean> {
    const hit = await this.prisma.tenant.findUnique({ where: { slug }, select: { id: true } });
    return hit !== null;
  }
  async hostTaken(subdomain: string): Promise<boolean> {
    const hit = await this.prisma.tenant.findFirst({ where: { subdomain }, select: { id: true } });
    return hit !== null;
  }
}

/** Dependencias reales del dry-run (las que inyectaría la consola de operador). */
export function realPlanDeps(prisma: PrismaClient): PlanDeps {
  return {
    resolveBlueprint: resolveBlueprintReal,
    baseModulesFor: (blueprintId) => defaultModulesForBlueprint(blueprintId),
    empresaModules: [...EMPRESA_MODULE_IDS],
    collisions: new PrismaCollisionChecker(prisma),
  };
}

/**
 * Committer real: envuelve el core de ADR-019 (`provisionTenant`) — el ÚNICO paso transaccional.
 * Mapea `ProvisionTenantInput → ProvisionParams`. La edición Comercio/Empresa se persiste como
 * `Tenant.profile` (`lite`/`enterprise`) vía `editionToProfile` (RFC-003 P1 — deuda cerrada en
 * Fase 2). El resto (nombre, slug, OWNER, branding, plataforma, catálogo del blueprint) también.
 */
export function adr019Committer(prisma: PrismaClient): TenantCommitter {
  return {
    async commit(input: ProvisionTenantInput, plan: ProvisionPlan): Promise<CommitResult> {
      const e = input.empresa ?? {};
      const b = input.brandSheet ?? {};
      const result = await provisionTenant(prisma, {
        name: input.name,
        slug: input.slug,
        timezone: e.timezone,
        owner: { name: input.admin.name, email: input.admin.email, password: input.admin.password },
        blueprint: plan.blueprint.id,
        branding: {
          shortLabel: e.shortLabel,
          addressLine: e.addressLine,
          city: e.city,
          hoursLabel: e.hoursLabel,
          whatsapp: e.whatsapp,
          email: e.email,
          instagram: e.instagram,
          mapsUrl: e.mapsUrl,
          contactNote: e.contactNote,
        },
        platform: {
          modules: plan.modules,
          subdomain: b.subdomain,
          accentPreset: b.accentPreset,
          frontTheme: b.frontTheme,
          profile: editionToProfile(input.edicion),
        },
      });
      return {
        tenantId: result.tenantId,
        slug: result.slug,
        tenantCreated: result.tenantCreated,
        ownerCreated: result.ownerCreated,
        settingsCreated: result.settingsCreated,
        blueprintId: result.blueprintId,
        catalogSeeded: result.catalogSeeded,
        generatedPassword: result.generatedPassword,
      };
    },
  };
}
