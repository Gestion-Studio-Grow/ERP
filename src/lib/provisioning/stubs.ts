// Fábrica de tenants — STUBS en memoria (ADR-061).
//
// Implementaciones sin efectos externos reales de los puertos: idempotencia in-memory,
// checker de colisiones sobre sets, host/inviter no-op, y un committer "echo" para tests.
// Puro: cero imports de Prisma o de la app → los tests corren sin DB. Los adaptadores REALES
// (que pegan contra `operatorPrisma` y el core de ADR-019) viven en `adapters.ts`.

import type { ProvisionOutcome, ProvisionTenantInput, ProvisionPlan, CommitResult } from "./types";
import type { IdempotencyStore, CollisionChecker, HostBinder, Inviter, TenantCommitter } from "./ports";

/** Los 5 módulos que suma la edición Empresa. Fuente: `MODULOS_NATIVOS` (src/modules/descriptors/nativos.ts). */
export const EMPRESA_MODULE_IDS = [
  "inventario",
  "cuentas-a-pagar",
  "cuentas-a-cobrar",
  "libros",
  "devoluciones-proveedor",
] as const;

/** Idempotencia in-memory (tests / esta iteración). La real irá con la tabla `ProvisioningRun` (Gate 2). */
export class InMemoryIdempotencyStore implements IdempotencyStore {
  private readonly map = new Map<string, ProvisionOutcome>();
  async get(key: string): Promise<ProvisionOutcome | undefined> {
    return this.map.get(key);
  }
  async set(key: string, outcome: ProvisionOutcome): Promise<void> {
    this.map.set(key, outcome);
  }
}

/** Checker de colisiones sobre sets en memoria (tests). El real consulta `operatorPrisma`. */
export class InMemoryCollisionChecker implements CollisionChecker {
  constructor(
    private readonly slugs: Set<string> = new Set(),
    private readonly hosts: Set<string> = new Set(),
  ) {}
  async slugTaken(slug: string): Promise<boolean> {
    return this.slugs.has(slug);
  }
  async hostTaken(subdomain: string): Promise<boolean> {
    return this.hosts.has(subdomain);
  }
}

/** Host binder no-op: registra las llamadas para poder afirmar en tests. */
export class NoopHostBinder implements HostBinder {
  readonly bound: string[] = [];
  readonly unbound: string[] = [];
  async bind(subdomain: string): Promise<void> {
    this.bound.push(subdomain);
  }
  async unbind(subdomain: string): Promise<void> {
    this.unbound.push(subdomain);
  }
}

/** Inviter no-op: registra las llamadas. Se le puede inyectar un fallo para probar la compensación. */
export class NoopInviter implements Inviter {
  readonly invited: string[] = [];
  readonly revoked: string[] = [];
  constructor(private readonly failOnInvite = false) {}
  async invite(email: string): Promise<void> {
    if (this.failOnInvite) throw new Error("invite falló (stub)");
    this.invited.push(email);
  }
  async revoke(email: string): Promise<void> {
    this.revoked.push(email);
  }
}

/**
 * Committer "echo": simula el commit de DB de ADR-019 sin tocar la base. Devuelve un
 * `CommitResult` determinístico a partir del plan. Para tests de la saga.
 */
export class EchoCommitter implements TenantCommitter {
  readonly commits: string[] = [];
  constructor(private readonly opts: { failOnCommit?: boolean; tenantId?: string } = {}) {}
  async commit(input: ProvisionTenantInput, plan: ProvisionPlan): Promise<CommitResult> {
    if (this.opts.failOnCommit) throw new Error("commit falló (stub)");
    this.commits.push(plan.slug);
    return {
      tenantId: this.opts.tenantId ?? `tenant_${plan.slug}`,
      slug: plan.slug,
      tenantCreated: true,
      ownerCreated: true,
      settingsCreated: true,
      blueprintId: plan.blueprint.id,
      catalogSeeded: true,
      generatedPassword: input.admin.password ? undefined : "bootstrap-stub-pw",
    };
  }
}
