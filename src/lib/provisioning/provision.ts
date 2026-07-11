// Fábrica de tenants — ORQUESTADOR de la saga (ADR-061).
//
// `runTenantProvisioning(input, deps)` es el corazón de la fábrica. Se llama distinto que el
// `provisionTenant` de ADR-019 a propósito (mismo dominio, otra capa): ADR-019 es el paso
// transaccional; esto es la SAGA que lo envuelve y le suma los efectos externos compensables.
//
//   PENDING → [commit tx ADR-019] → DB_COMMITTED → [bindHost] → HOST_BOUND
//           → [invite] → INVITED → [activate] → ACTIVE
//   cualquier fallo externo → compensa en orden inverso → FAILED_COMPENSATED
//
// Idempotencia doble: por slug (DB, ADR-019) y por idempotencyKey (toda la saga). Reintentar
// con la misma idempotencyKey devuelve el outcome cacheado, no re-ejecuta. Todo lo externo va
// STUBBEADO tras puertos en esta iteración (no llama Vercel/DNS/email, no toca prod).

import type { ProvisionTenantInput, ProvisionOutcome, ProvisionPlan } from "./types";
import type { SagaDeps } from "./ports";
import type { ProvisionState } from "./state-machine";
import { externalStepsCompletedAt } from "./state-machine";
import { planProvision } from "./dry-run";

/** El commit de DB requiere un plan sin colisiones. Se lanza si se intenta commitear un plan roto. */
export class ProvisionBlockedError extends Error {
  constructor(public readonly plan: ProvisionPlan) {
    super("Provisioning bloqueado: el plan tiene colisiones. " + plan.collisions.map((c) => c.message).join(" "));
    this.name = "ProvisionBlockedError";
  }
}

/**
 * Ejecuta la fábrica. `mode: "dry-run"` devuelve el plan sin escribir. `mode: "commit"` corre
 * la saga completa. Idempotente por `idempotencyKey`.
 */
export async function runTenantProvisioning(
  input: ProvisionTenantInput,
  deps: SagaDeps,
): Promise<ProvisionOutcome> {
  // Idempotencia de la orquestación: si esta clave ya se resolvió, devolvé el mismo outcome.
  const cached = await deps.idempotency.get(input.idempotencyKey);
  if (cached) return cached;

  const plan = await planProvision(input, deps);

  // Dry-run: sólo el plan, cero efectos. NO se cachea (es una consulta, no una ejecución).
  if (input.mode === "dry-run") {
    return { idempotencyKey: input.idempotencyKey, state: "PENDING", plan };
  }

  // Commit sobre un plan con colisiones: se niega explícito (no escribe nada).
  if (!plan.ok) throw new ProvisionBlockedError(plan);

  let state: ProvisionState = "PENDING";
  const outcome: ProvisionOutcome = { idempotencyKey: input.idempotencyKey, state, plan };

  // --- PENDING → DB_COMMITTED: el ÚNICO paso transaccional (core de ADR-019) ---
  // Si el commit lanza, no hay saga (nada externo se aplicó) → propaga el error sin compensar.
  const commit = await deps.committer.commit(input, plan);
  outcome.commit = commit;
  state = "DB_COMMITTED";
  outcome.state = state;

  // --- Pasos externos: compensables. Si uno falla, deshacemos en orden inverso. ---
  const subdomain = input.brandSheet?.subdomain?.trim();
  const adminEmail = input.admin.email.trim().toLowerCase();
  try {
    // DB_COMMITTED → HOST_BOUND
    if (subdomain) {
      await deps.host.bind(subdomain, commit.tenantId);
      outcome.host = { bound: true, subdomain };
    } else {
      outcome.host = { bound: false };
    }
    state = "HOST_BOUND";
    outcome.state = state;

    // HOST_BOUND → INVITED
    await deps.inviter.invite(adminEmail, commit.tenantId);
    outcome.invited = { sent: true, email: adminEmail };
    state = "INVITED";
    outcome.state = state;

    // INVITED → ACTIVE
    state = "ACTIVE";
    outcome.state = state;
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    const compensated = await compensate(state, input, commit.tenantId, deps);
    outcome.state = "FAILED_COMPENSATED";
    outcome.failure = { atState: state, reason, compensated };
  }

  await deps.idempotency.set(input.idempotencyKey, outcome);
  return outcome;
}

/**
 * Compensa los pasos externos ya aplicados al llegar a `reachedState`, en orden INVERSO.
 * El commit de DB NO se compensa (aditivo/idempotente — no se borra el tenant). Devuelve la
 * lista de compensaciones ejecutadas (para el outcome/auditoría).
 */
async function compensate(
  reachedState: ProvisionState,
  input: ProvisionTenantInput,
  tenantId: string,
  deps: SagaDeps,
): Promise<string[]> {
  const done: string[] = [];
  const steps = externalStepsCompletedAt(reachedState); // en orden de aplicación
  const subdomain = input.brandSheet?.subdomain?.trim();
  const adminEmail = input.admin.email.trim().toLowerCase();

  // Orden inverso.
  for (const step of [...steps].reverse()) {
    try {
      if (step === "invite") {
        await deps.inviter.revoke(adminEmail, tenantId);
        done.push("revoke-invite");
      } else if (step === "host" && subdomain) {
        await deps.host.unbind(subdomain, tenantId);
        done.push("unbind-host");
      }
    } catch {
      // Una compensación que falla no debe tapar el fallo original; se anota como best-effort.
      done.push(`${step}-compensation-failed`);
    }
  }
  return done;
}
