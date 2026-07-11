// Fábrica de tenants — ENSAMBLADO de dependencias reales para la consola de operador (ADR-074).
//
// SERVER-ONLY: importa `./adapters` (que arrastra el core de ADR-019 + `dotenv/config` + Prisma)
// y `operator-db`. NO importar desde un componente cliente. Es la capa de "wiring" que `adapters.ts`
// deja cableada pero no ensambla: acá se juntan el committer real (envuelve `provisionTenant`, ADR-019),
// el checker de colisiones real (control-plane, `operatorPrisma`) y —los efectos externos aún STUB
// (host/DNS, email) hasta tener sus servicios— para dárselos a `runTenantProvisioning`.
//
// IDEMPOTENCIA IN-MEMORY (Gate 2): la persistencia real de la saga (`ProvisioningRun`) es una tabla
// nueva = migración = Gate 2 (ADR-074, "Próxima iteración"). Hasta entonces el store es un singleton
// a nivel de proceso: sobrevive entre requests del mismo server, se pierde al reiniciar. Alcanza para
// que un doble-submit del mismo slug no re-ejecute la saga; NO para reanudar entre procesos.

import { operatorPrisma } from "@/lib/operator-db";
import { realPlanDeps, adr019Committer } from "./adapters";
import { InMemoryIdempotencyStore, NoopHostBinder, NoopInviter } from "./stubs";
import type { PlanDeps, SagaDeps } from "./ports";

// Singleton de idempotencia a nivel de proceso (patrón de `operator-db`: se guarda en globalThis
// para no re-crearlo en cada HMR de dev). Gate 2: reemplazar por un store sobre `ProvisioningRun`.
const globalForProvisioning = globalThis as unknown as {
  provisioningIdempotency: InMemoryIdempotencyStore | undefined;
};

export const sharedIdempotencyStore =
  globalForProvisioning.provisioningIdempotency ?? new InMemoryIdempotencyStore();

if (process.env.NODE_ENV !== "production") {
  globalForProvisioning.provisioningIdempotency = sharedIdempotencyStore;
}

/** Dependencias del dry-run (`planProvision`) con datos reales: blueprints + colisiones vs control-plane. */
export function operatorPlanDeps(): PlanDeps {
  return realPlanDeps(operatorPrisma);
}

/**
 * Dependencias de la saga (`runTenantProvisioning`) para la consola. Committer real (ADR-019),
 * colisiones reales, host/inviter STUB (no llaman Vercel/DNS/email en esta iteración — límite duro
 * de ADR-074), idempotencia in-memory compartida (Gate 2).
 */
export function operatorSagaDeps(): SagaDeps {
  return {
    ...operatorPlanDeps(),
    committer: adr019Committer(operatorPrisma),
    host: new NoopHostBinder(),
    inviter: new NoopInviter(),
    idempotency: sharedIdempotencyStore,
  };
}
