// Fábrica de tenants — PUERTOS (ADR-074).
//
// Todo lo que toca el mundo exterior (DB, DNS, email) entra por una interfaz. En esta
// iteración (spec + scaffold) todas se implementan con STUBS (`stubs.ts`): el motor no
// llama a Vercel/DNS/email de verdad ni escribe en Neon. El día del wiring real sólo se
// cambian los adaptadores, no el orquestador.

import type {
  ProvisionTenantInput,
  CommitResult,
  ProvisionPlan,
  BlueprintResolution,
  HostBindOutcome,
  InviteOutcome,
} from "./types";

/**
 * Paso transaccional (PENDING → DB_COMMITTED). El adaptador default (`adr019Committer`)
 * envuelve `provisionTenant` de ADR-019 (Tenant + OWNER + catálogo, en una `$transaction`).
 * Es el ÚNICO paso todo-o-nada: si lanza, no hay nada que compensar.
 */
export interface TenantCommitter {
  commit(input: ProvisionTenantInput, plan: ProvisionPlan): Promise<CommitResult>;
}

/**
 * Efecto externo: ligar el subdominio/host del tenant (DNS/Vercel). Compensable.
 * `bind` devuelve `{bound, note}`: `bound=false`+`note` = se saltó (adaptador no configurado),
 * NO es un fallo; un fallo real (el servicio rechazó) se lanza como excepción → compensa.
 * Sólo se compensa (`unbind`) lo que efectivamente se ligó (`bound=true`).
 */
export interface HostBinder {
  bind(subdomain: string, tenantId: string): Promise<HostBindOutcome>;
  /** Compensación de `bind` (se llama si un paso POSTERIOR falla y el host SÍ se había ligado). */
  unbind(subdomain: string, tenantId: string): Promise<void>;
}

/**
 * Efecto externo: invitar al usuario admin (email de bootstrap). Compensable.
 * `invite` devuelve `{sent, note}` con la misma semántica saltado/fallo que `HostBinder.bind`.
 */
export interface Inviter {
  invite(email: string, tenantId: string): Promise<InviteOutcome>;
  /** Compensación de `invite` (se llama si un paso POSTERIOR falla y la invitación SÍ se envió). */
  revoke(email: string, tenantId: string): Promise<void>;
}

/**
 * Idempotencia de la ORQUESTACIÓN, por `idempotencyKey` (cubre toda la saga).
 * En esta iteración es in-memory (tests); su persistencia real va con la tabla
 * `ProvisioningRun` (Gate 2, próxima iteración).
 */
export interface IdempotencyStore {
  get(key: string): Promise<import("./types").ProvisionOutcome | undefined>;
  set(key: string, outcome: import("./types").ProvisionOutcome): Promise<void>;
}

/**
 * Chequeo de colisiones para el dry-run: ¿ya existe este slug/host? Lo consulta el
 * plan SIN escribir. El adaptador real pega contra `operatorPrisma` (control-plane,
 * ADR-021); en tests es un set en memoria.
 */
export interface CollisionChecker {
  slugTaken(slug: string): Promise<boolean>;
  hostTaken(subdomain: string): Promise<boolean>;
}

/** Dependencias del motor de dry-run (`planProvision`). Todas inyectables → testeable sin DB. */
export interface PlanDeps {
  /** Resuelve el blueprint efectivo del input (default: `resolveBlueprint`/`getBlueprint` de ADR-002). */
  resolveBlueprint(input: ProvisionTenantInput): BlueprintResolution;
  /** Módulos base del rubro (default: `defaultModulesForBlueprint`). */
  baseModulesFor(blueprintId: string): string[];
  /** Módulos que suma la edición Empresa (invariante `enterprise ⊇ lite`). */
  empresaModules: string[];
  collisions: CollisionChecker;
}

/** Dependencias de la saga (`runTenantProvisioning`). */
export interface SagaDeps extends PlanDeps {
  committer: TenantCommitter;
  host: HostBinder;
  inviter: Inviter;
  idempotency: IdempotencyStore;
}
