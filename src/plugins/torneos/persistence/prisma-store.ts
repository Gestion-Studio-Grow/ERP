// ============================================================================
// ADAPTADOR REAL DE PERSISTENCIA — snapshot JSONB en Neon, por tenant (ADR-097, FASE 2).
// ============================================================================
//
// Implementa `TorneoStore` sobre la tabla `Torneo` (id, tenantId, snapshot JSONB). La
// tabla se crea recién en GATE 2 (prisma/pending-gate2/Torneo.sql) → mientras no se
// aplique, este adaptador NO se usa (flag TORNEOS_ENABLED OFF) y su primer contacto con
// la tabla está protegido por un chequeo de existencia (ver más abajo).
//
// ⚠️ Por qué SQL crudo y NO un modelo en schema.prisma:
//   Agregar `Torneo` a schema.prisma sin aplicar la migración deja el cliente Prisma
//   "schema-ahead" de la DB de prod — exactamente el footgun que tiró CH (columnas
//   arca* / Invoice no migradas → error boundary). Mismo criterio que `ProvisioningRun`
//   (ADR-074): la tabla vive como SQL crudo en pending-gate2 y se toca por $queryRaw,
//   nunca por `prisma.torneo`. Así `prisma migrate status` no marca drift y ningún path
//   accidental rompe. Se promueve a modelo Prisma recién cuando Gate 2 la aplique.
//
// ⚠️ Aislamiento (ADR-018): las ops crudas ($queryRaw) NO las envuelve la extensión RLS
//   → se corren DENTRO de `tenantTransaction` (setea app.current_tenant_id como primer
//   statement) Y con predicado explícito `"tenantId" = ${tenantId}` (belt-and-suspenders:
//   filtro app-level + RLS como backstop). Con el flag RLS OFF (owner, bypass) el que
//   aísla es el predicado; con el flag ON, además la policy.

import { basePrisma } from "@/lib/prisma-base";
import { tenantTransaction } from "@/lib/rls";
import motor, { type Torneo } from "../engine";
import { type TorneoStore, TablaTorneoNoMigradaError } from "./store";

// Chequeo de existencia de la tabla, MEMOIZADO y FUERA de toda tenantTransaction
// (lección "defensive-flag-schema-ahead": leer/tocar una tabla-columna no migrada dentro
// de una tx la aborta con 42703 y cascó 67 HTTP-500). Se prueba por information_schema
// una vez por proceso; si no existe, se lanza un error claro ANTES de abrir la tx.
let _tablaExiste: boolean | null = null;
async function asegurarTablaMigrada(): Promise<void> {
  if (_tablaExiste === null) {
    const rows = await basePrisma.$queryRaw<{ existe: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'Torneo'
      ) AS existe
    `;
    _tablaExiste = rows[0]?.existe ?? false;
  }
  if (!_tablaExiste) throw new TablaTorneoNoMigradaError();
}

/** Solo para tests del adaptador (reinicia el memo del chequeo de existencia). */
export function _resetMemoTablaTorneo(): void {
  _tablaExiste = null;
}

/**
 * Adaptador de persistencia real, atado a un `tenantId`. Se instancia por request/worker
 * con el tenant ya resuelto (patrón `opts.tenantId` de tenantTransaction — paths sin
 * request conocen el tenant explícito).
 */
export class PrismaTorneoStore implements TorneoStore {
  constructor(private readonly tenantId: string) {}

  async cargar(torneoId: string): Promise<Torneo | null> {
    await asegurarTablaMigrada();
    return tenantTransaction(
      async (tx) => {
        const rows = await tx.$queryRaw<{ snapshot: string }[]>`
          SELECT "snapshot"::text AS snapshot
          FROM "Torneo"
          WHERE "id" = ${torneoId} AND "tenantId" = ${this.tenantId}
          LIMIT 1
        `;
        return rows[0] ? motor.deserializar(rows[0].snapshot) : null;
      },
      { tenantId: this.tenantId },
    );
  }

  async guardar(torneoId: string, torneo: Torneo): Promise<void> {
    await asegurarTablaMigrada();
    const snapshot = motor.serializar(torneo); // JSON válido (JSON.stringify) → ::jsonb
    await tenantTransaction(
      async (tx) => {
        await tx.$executeRaw`
          INSERT INTO "Torneo" ("id", "tenantId", "snapshot", "createdAt", "updatedAt")
          VALUES (${torneoId}, ${this.tenantId}, ${snapshot}::jsonb, now(), now())
          ON CONFLICT ("id") DO UPDATE
            SET "snapshot" = EXCLUDED."snapshot", "updatedAt" = now()
            WHERE "Torneo"."tenantId" = ${this.tenantId}
        `;
      },
      { tenantId: this.tenantId },
    );
  }
}
