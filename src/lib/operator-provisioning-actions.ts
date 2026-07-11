"use server";

// Server Actions del WIZARD DE ALTA (consola de operador, RFC-003 §3.1) sobre la fábrica de tenants
// (ADR-074). Dos acciones, ambas guardadas por `requireOperator()` (plano de operador, ADR-021):
//
//   1. planTenantAction  — DRY-RUN obligatorio: corre `planProvision` (motor puro) con datos reales
//                          y devuelve el PLAN para el preview en vivo. NO escribe nada.
//   2. commitTenantAction — COMMIT: sólo si el plan no tiene colisiones, corre `runTenantProvisioning`
//                          (la saga que envuelve el core de ADR-019). Devuelve el outcome de la saga.
//
// AUDITORÍA (seguridad, RFC-003 §3.3 / requisito de alta auditada): cada intento se registra en el
// log estructurado (quién=operador, qué=slug, cuándo, resultado). Además, tras un commit exitoso se
// escribe una fila en `AuditLog` colgada del tenant recién creado (queda consultable en su ficha).
//
// NO se confía en el cliente: el input se re-mapea y re-valida acá; el motor re-corre el dry-run
// dentro del commit y rechaza (`ProvisionBlockedError`) cualquier plan con colisiones.

import { operatorPrisma } from "@/lib/operator-db";
import { requireOperator } from "@/lib/operator-session";
import { requestIp } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { planProvision } from "@/lib/provisioning/dry-run";
import { runTenantProvisioning, ProvisionBlockedError } from "@/lib/provisioning/provision";
import { operatorPlanDeps, operatorSagaDeps } from "@/lib/provisioning/runtime";
import {
  buildProvisionInput,
  type RawWizardForm,
  type CommitActionResult,
} from "@/lib/provisioning/console-input";
import type { ProvisionPlan, ProvisionOutcome } from "@/lib/provisioning/types";

/** DRY-RUN obligatorio: arma el plan para el preview en vivo del wizard. Idempotente, no escribe. */
export async function planTenantAction(raw: RawWizardForm): Promise<ProvisionPlan> {
  const actor = await requireOperator();
  const input = buildProvisionInput(raw, "dry-run");
  const plan = await planProvision(input, operatorPlanDeps());
  logger.info("operator.provisioning", "dry-run", {
    actor,
    slug: input.slug,
    edicion: input.edicion,
    blueprint: plan.blueprint.id,
    ok: plan.ok,
    collisions: plan.collisions.map((c) => c.kind),
  });
  return plan;
}

/** COMMIT: corre la saga real (ADR-074). Sólo procede con plan sin colisiones. Audita quién/qué/cuándo. */
export async function commitTenantAction(raw: RawWizardForm): Promise<CommitActionResult> {
  const actor = await requireOperator();
  const input = buildProvisionInput(raw, "commit");
  const ip = (await requestIp()) ?? undefined;

  let outcome: ProvisionOutcome;
  try {
    outcome = await runTenantProvisioning(input, operatorSagaDeps());
  } catch (e) {
    // ProvisionBlockedError (colisiones) o el GATE de RLS de ADR-018 (2º tenant sin RLS) caen acá.
    // Se registra y se devuelve legible; la consola lo muestra, no lo esconde.
    const error = e instanceof Error ? e.message : String(e);
    logger.warn("operator.provisioning", "commit rechazado", {
      actor,
      slug: input.slug,
      blocked: e instanceof ProvisionBlockedError,
      error,
    });
    return { ok: false, error };
  }

  const commit = outcome.commit;
  logger.info("operator.provisioning", "commit", {
    actor,
    slug: input.slug,
    edicion: input.edicion,
    state: outcome.state,
    tenantId: commit?.tenantId,
    tenantCreated: commit?.tenantCreated,
    failure: outcome.failure?.reason,
  });

  // Auditoría persistente colgada del tenant creado (queda en su historial, control-plane).
  if (commit?.tenantId) {
    try {
      await operatorPrisma.auditLog.create({
        data: {
          tenantId: commit.tenantId,
          actor: `operator:${actor}`,
          action: "provision",
          entity: "Tenant",
          entityId: commit.tenantId,
          channel: "admin",
          changes: {
            slug: input.slug,
            edicion: input.edicion,
            blueprint: outcome.plan.blueprint.id,
            state: outcome.state,
            tenantCreated: commit.tenantCreated,
            ownerCreated: commit.ownerCreated,
            subdomain: input.brandSheet?.subdomain ?? null,
            ip: ip ?? null,
          },
        },
      });
    } catch (err) {
      // Una falla al auditar no debe tumbar el alta ya cometida; se registra en el log del server.
      logger.error("operator.provisioning", "no se pudo auditar el alta", err, {
        actor,
        tenantId: commit.tenantId,
      });
    }
  }

  return {
    ok: outcome.state === "ACTIVE",
    outcome,
    tenantId: commit?.tenantId,
    generatedPassword: commit?.generatedPassword,
    error: outcome.state === "FAILED_COMPENSATED" ? outcome.failure?.reason : undefined,
  };
}
