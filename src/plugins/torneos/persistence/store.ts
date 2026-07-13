// ============================================================================
// CONTRATO DE PERSISTENCIA DEL TORNEO — el snapshot por tenant (ADR-097, FASE 2).
// ============================================================================
//
// El estado del torneo es un objeto plano que el motor sabe serializar/deserializar
// (`serializar()` / `deserializar()`). La persistencia guarda ese SNAPSHOT completo,
// una fila por torneo, scopeada por tenant (RLS). Empezamos SIMPLE a propósito: un
// snapshot JSONB, sin normalizar a tablas relacionales — se normaliza recién si aparece
// una query que lo pida (ranking cross-torneo, etc.), no antes (ADR-097 §Persistencia).
//
// Este archivo define SOLO el contrato + errores; las implementaciones son
// `memoria-store.ts` (fake para tests) y `prisma-store.ts` (real, Gate 2).

import type { Torneo } from "../engine";

/**
 * Puerto de persistencia de torneos. Una implementación resuelve el aislamiento por
 * tenant (RLS / predicado `tenantId`); la orquestación (`aplicar.ts`) es agnóstica de
 * cómo se guarda. El snapshot que viaja es SIEMPRE el `Torneo` deserializado; la
 * serialización (motor.serializar/deserializar) es responsabilidad del adaptador.
 */
export interface TorneoStore {
  /** Carga el snapshot del torneo `torneoId`. `null` si no existe para este tenant. */
  cargar(torneoId: string): Promise<Torneo | null>;
  /** Persiste (crea o reemplaza) el snapshot del torneo `torneoId`. */
  guardar(torneoId: string, torneo: Torneo): Promise<void>;
}

/** El torneo pedido no existe para el tenant actual. */
export class TorneoNoEncontradoError extends Error {
  constructor(public readonly torneoId: string) {
    super(`Torneo no encontrado: ${torneoId}`);
    this.name = "TorneoNoEncontradoError";
  }
}

/**
 * La tabla `Torneo` todavía no fue migrada a la DB (Gate 2 pendiente). Se lanza ANTES
 * de tocar la tabla — nunca se deja que un 42703 aborte una transacción (lección
 * "defensive-flag-schema-ahead": probar existencia por information_schema, fuera de tx).
 */
export class TablaTorneoNoMigradaError extends Error {
  constructor() {
    super(
      'La tabla "Torneo" no existe en la base. Aplicá la migración Gate 2 ' +
        "(prisma/pending-gate2/Torneo.sql) antes de habilitar TORNEOS_ENABLED.",
    );
    this.name = "TablaTorneoNoMigradaError";
  }
}
