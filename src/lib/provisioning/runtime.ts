// Fábrica de tenants — ENSAMBLADO de dependencias reales para la consola de operador (ADR-074).
//
// SERVER-ONLY: importa `./adapters` (que arrastra el core de ADR-019 + `dotenv/config` + Prisma),
// `./external-adapters` (Vercel/email) y `operator-db`. NO importar desde un componente cliente. Es la
// capa de "wiring" que junta: el committer real (envuelve `provisionTenant`, ADR-019), el checker de
// colisiones real (control-plane, `operatorPrisma`), los efectos externos REALES gateados por
// credenciales (host/DNS por Vercel, invitación por email — se saltan honestos si no hay secretos) y
// la idempotencia PERSISTENTE de la saga.
//
// IDEMPOTENCIA (Fase 2): `ProvisioningRunStore` persiste la saga en la tabla `ProvisioningRun` (reanuda
// entre procesos + audita). La tabla es Gate 2 (migración PREPARADA, sin aplicar): hasta que el dueño la
// aplique, el store DEGRADA a un fallback in-memory (singleton por proceso) — mismo comportamiento que
// antes, cero riesgo en prod. Aplicada la migración, persiste automáticamente sin tocar código.

import { operatorPrisma } from "@/lib/operator-db";
import { logger } from "@/lib/logger";
import { realPlanDeps, adr019Committer } from "./adapters";
import { VercelHostBinder, EmailInviter } from "./external-adapters";
import { ProvisioningRunStore } from "./idempotency-store";
import { InMemoryIdempotencyStore } from "./stubs";
import type { PlanDeps, SagaDeps, IdempotencyStore } from "./ports";

// Singletons a nivel de proceso (patrón de `operator-db`: se guardan en globalThis para no re-crearlos
// en cada HMR de dev). El fallback in-memory vive aparte del store persistente por si éste degrada.
const globalForProvisioning = globalThis as unknown as {
  provisioningIdempotencyFallback: InMemoryIdempotencyStore | undefined;
  provisioningIdempotency: IdempotencyStore | undefined;
};

const fallbackStore = globalForProvisioning.provisioningIdempotencyFallback ?? new InMemoryIdempotencyStore();

/** Store de idempotencia de la saga: persistente (ProvisioningRun) con degradación a in-memory. */
export const sharedIdempotencyStore: IdempotencyStore =
  globalForProvisioning.provisioningIdempotency ??
  new ProvisioningRunStore(operatorPrisma, fallbackStore, (reason, err) => {
    logger.warn("operator.provisioning", reason, { err: err instanceof Error ? err.message : String(err) });
  });

if (process.env.NODE_ENV !== "production") {
  globalForProvisioning.provisioningIdempotencyFallback = fallbackStore;
  globalForProvisioning.provisioningIdempotency = sharedIdempotencyStore;
}

/** Dependencias del dry-run (`planProvision`) con datos reales: blueprints + colisiones vs control-plane. */
export function operatorPlanDeps(): PlanDeps {
  return realPlanDeps(operatorPrisma);
}

/**
 * Dependencias de la saga (`runTenantProvisioning`) para la consola. Committer real (ADR-019),
 * colisiones reales, host/inviter REALES gateados por credenciales (Vercel/email — se saltan honestos
 * y dejan followup si faltan los secretos), idempotencia persistente (ProvisioningRun, con fallback).
 */
export function operatorSagaDeps(): SagaDeps {
  return {
    ...operatorPlanDeps(),
    committer: adr019Committer(operatorPrisma),
    host: new VercelHostBinder(),
    inviter: new EmailInviter(),
    idempotency: sharedIdempotencyStore,
  };
}
