// Fábrica de tenants — ORQUESTADOR de la saga (ADR-074).
//
// `runTenantProvisioning(input, deps)` es el corazón de la fábrica. Se llama distinto que el
// `provisionTenant` de ADR-019 a propósito (mismo dominio, otra capa): ADR-019 es el paso
// transaccional; esto es la SAGA que lo envuelve y le suma los efectos externos compensables.
//
//   PENDING → [commit tx ADR-019] → DB_COMMITTED → [bindHost] → HOST_BOUND
//           → [invite] → INVITED → [activate] → ACTIVE
//   cualquier fallo externo → compensa en orden inverso → FAILED_COMPENSATED
//
// Idempotencia doble: por slug (DB, ADR-019) y por idempotencyKey (toda la saga). Un alta que ya
// quedó ACTIVE se devuelve cacheada, no se re-ejecuta. Un intento previo FAILED_COMPENSATED SÍ se
// puede reintentar (el commit es idempotente por slug y lo externo ya se compensó) → no se
// short-circuitea. Los efectos externos van tras puertos (host/DNS, email): sus adaptadores reales
// (Vercel, email) se saltan HONESTAMENTE si no están configurados (`bound/sent=false`+note→followup),
// en vez de mentir "hecho"; un fallo real dispara compensación.

import type { ProvisionTenantInput, ProvisionOutcome, ProvisionPlan } from "./types";
import type { SagaDeps } from "./ports";
import type { ProvisionState } from "./state-machine";
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
 * la saga completa. Idempotente por `idempotencyKey` (terminal solo sobre un alta EXITOSA).
 */
export async function runTenantProvisioning(
  input: ProvisionTenantInput,
  deps: SagaDeps,
): Promise<ProvisionOutcome> {
  // Idempotencia de la orquestación: un alta que YA llegó a ACTIVE se devuelve tal cual, sin
  // re-ejecutar. Un intento previo FAILED_COMPENSATED NO se short-circuitea: reintentar es seguro
  // (el commit de ADR-019 es idempotente por slug; los efectos externos aplicados ya se compensaron)
  // y necesario ("reintentar sin duplicar" — el operador corrige el problema transitorio y reintenta).
  const cached = await deps.idempotency.get(input.idempotencyKey);
  if (cached && cached.state === "ACTIVE") return cached;

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

  // --- Pasos externos: compensables. Si uno falla, deshacemos en orden inverso SOLO lo aplicado. ---
  const subdomain = input.brandSheet?.subdomain?.trim();
  const adminEmail = input.admin.email.trim().toLowerCase();
  // Registramos qué efecto se aplicó DE VERDAD (no lo que se saltó): la compensación solo deshace eso.
  const applied: Array<"host" | "invite"> = [];
  const followups: string[] = [];
  try {
    // DB_COMMITTED → HOST_BOUND
    if (subdomain) {
      const r = await deps.host.bind(subdomain, commit.tenantId);
      outcome.host = { bound: r.bound, subdomain, note: r.note };
      if (r.bound) applied.push("host");
      else if (r.note) followups.push(`Link/host: ${r.note}`);
    } else {
      outcome.host = { bound: false };
    }
    state = "HOST_BOUND";
    outcome.state = state;

    // HOST_BOUND → INVITED
    const inv = await deps.inviter.invite(adminEmail, commit.tenantId);
    outcome.invited = { sent: inv.sent, email: adminEmail, note: inv.note };
    if (inv.sent) applied.push("invite");
    else if (inv.note) followups.push(`Invitación al dueño: ${inv.note}`);
    state = "INVITED";
    outcome.state = state;

    // INVITED → ACTIVE
    state = "ACTIVE";
    outcome.state = state;
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    const compensated = await compensate(applied, subdomain, adminEmail, commit.tenantId, deps);
    outcome.state = "FAILED_COMPENSATED";
    outcome.failure = { atState: state, reason, compensated };
  }

  if (followups.length > 0) outcome.followups = followups;
  await deps.idempotency.set(input.idempotencyKey, outcome);
  return outcome;
}

/**
 * Compensa los efectos externos EFECTIVAMENTE aplicados (`applied`), en orden INVERSO. Un paso que
 * se saltó (adaptador no configurado) NO está en `applied` → no se intenta deshacer algo que nunca
 * se hizo. El commit de DB NO se compensa (aditivo/idempotente — no se borra el tenant). Devuelve la
 * lista de compensaciones ejecutadas (para el outcome/auditoría). Una compensación que falla se anota
 * best-effort y no tapa el fallo original.
 */
async function compensate(
  applied: Array<"host" | "invite">,
  subdomain: string | undefined,
  adminEmail: string,
  tenantId: string,
  deps: SagaDeps,
): Promise<string[]> {
  const done: string[] = [];
  for (const step of [...applied].reverse()) {
    try {
      if (step === "invite") {
        await deps.inviter.revoke(adminEmail, tenantId);
        done.push("revoke-invite");
      } else if (step === "host" && subdomain) {
        await deps.host.unbind(subdomain, tenantId);
        done.push("unbind-host");
      }
    } catch {
      done.push(`${step}-compensation-failed`);
    }
  }
  return done;
}
