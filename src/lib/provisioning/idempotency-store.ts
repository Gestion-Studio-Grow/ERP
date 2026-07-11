// Fábrica de tenants — IDEMPOTENCIA PERSISTENTE de la saga (ADR-074, Gate 2 wiring).
//
// La idempotencia de la orquestación (por `idempotencyKey`) era IN-MEMORY: sobrevivía entre
// requests del mismo proceso, pero un doble-submit TRAS reiniciar el proceso (deploy, crash,
// scale-to-zero de Vercel) re-ejecutaba la saga. Este store la persiste en la tabla `ProvisioningRun`.
//
// ⚠️ RESILIENTE POR DISEÑO (la tabla es Gate 2 — main auto-deploya y la migración NO está aplicada
// todavía): si `ProvisioningRun` NO existe en la base (o hay cualquier error de DB), el store DEGRADA
// a un fallback in-memory en vez de romper el alta. Así:
//   - HOY (tabla sin aplicar): se comporta igual que antes (in-memory) — cero riesgo en prod.
//   - POST Gate 2 (el dueño aplica `prisma/migrations/*_add_provisioning_run`): persiste entre
//     procesos AUTOMÁTICAMENTE, sin tocar código.
// La idempotencia es una OPTIMIZACIÓN: el commit de ADR-019 ya es idempotente por slug, así que
// degradar a in-memory nunca corrompe datos (a lo sumo, un re-run seguro).

import type { IdempotencyStore } from "./ports";
import type { ProvisionOutcome } from "./types";

/** Subconjunto de PrismaClient que necesita el store (para poder inyectar un fake en tests). */
export interface RawSqlRunner {
  $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
  $executeRawUnsafe(query: string, ...values: unknown[]): Promise<number>;
}

/** ¿El error es "la tabla ProvisioningRun no existe" (Gate 2 sin aplicar)? Postgres 42P01. */
export function isMissingTableError(err: unknown): boolean {
  const s = typeof err === "string" ? err : err instanceof Error ? err.message : String(err);
  return /42P01/.test(s) || /relation ".*ProvisioningRun.*" does not exist/i.test(s) || /ProvisioningRun.*does not exist/i.test(s);
}

/** Genera un id textual para la fila nueva (la columna es TEXT; sólo necesita ser único). */
function newId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  return c?.randomUUID ? `run_${c.randomUUID()}` : `run_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

/**
 * Store de idempotencia sobre `ProvisioningRun`. Es un cache fiel key→outcome: `get` devuelve el
 * outcome guardado tal cual (la POLÍTICA de "solo cachear un alta ACTIVE" vive en la saga, no acá);
 * `set` hace upsert por `idempotencyKey`, poblando además slug/state/tenantId/error para auditoría
 * de plataforma. Ante tabla ausente o error de DB, delega en `fallback` (in-memory).
 */
export class ProvisioningRunStore implements IdempotencyStore {
  private degraded = false;

  constructor(
    private readonly db: RawSqlRunner,
    private readonly fallback: IdempotencyStore,
    private readonly onFallback?: (reason: string, err: unknown) => void,
  ) {}

  private degrade(reason: string, err: unknown): void {
    if (!this.degraded) {
      this.degraded = true;
      this.onFallback?.(reason, err);
    }
  }

  async get(key: string): Promise<ProvisionOutcome | undefined> {
    try {
      const rows = await this.db.$queryRawUnsafe<{ outcome: unknown }[]>(
        `SELECT "outcome" FROM "ProvisioningRun" WHERE "idempotencyKey" = $1 LIMIT 1`,
        key,
      );
      const raw = rows?.[0]?.outcome;
      if (raw == null) return undefined;
      // jsonb puede venir ya parseado (objeto) o como string, según el driver.
      const outcome = typeof raw === "string" ? (JSON.parse(raw) as ProvisionOutcome) : (raw as ProvisionOutcome);
      return outcome;
    } catch (err) {
      this.degrade(
        isMissingTableError(err)
          ? "ProvisioningRun no aplicada (Gate 2): idempotencia in-memory hasta migrar"
          : "error leyendo ProvisioningRun: idempotencia in-memory (degradado)",
        err,
      );
      return this.fallback.get(key);
    }
  }

  async set(key: string, outcome: ProvisionOutcome): Promise<void> {
    // Siempre escribimos también en el fallback: si la DB degrada más tarde, la idempotencia del
    // mismo proceso sigue viva; y si degrada ahora, no perdemos el dato.
    await this.fallback.set(key, outcome);
    try {
      const slug = outcome.plan?.slug ?? "";
      const state = outcome.state;
      const tenantId = outcome.commit?.tenantId ?? null;
      const error = outcome.failure?.reason ?? null;
      const planJson = JSON.stringify(outcome.plan ?? null);
      const outcomeJson = JSON.stringify(outcome);
      await this.db.$executeRawUnsafe(
        `INSERT INTO "ProvisioningRun"
           ("id","idempotencyKey","slug","state","tenantId","plan","outcome","error","createdAt","updatedAt")
         VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
         ON CONFLICT ("idempotencyKey") DO UPDATE SET
           "state" = EXCLUDED."state",
           "tenantId" = EXCLUDED."tenantId",
           "plan" = EXCLUDED."plan",
           "outcome" = EXCLUDED."outcome",
           "error" = EXCLUDED."error",
           "updatedAt" = CURRENT_TIMESTAMP`,
        newId(),
        key,
        slug,
        state,
        tenantId,
        planJson,
        outcomeJson,
        error,
      );
    } catch (err) {
      this.degrade(
        isMissingTableError(err)
          ? "ProvisioningRun no aplicada (Gate 2): idempotencia in-memory hasta migrar"
          : "error escribiendo ProvisioningRun: idempotencia in-memory (degradado)",
        err,
      );
      // Ya está en el fallback; no re-lanzamos (no romper un alta ya cometida por un cache).
    }
  }
}
