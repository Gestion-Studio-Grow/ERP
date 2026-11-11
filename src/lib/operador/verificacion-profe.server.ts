// ============================================================================
// PROFETURNOS · ALTA ASISTIDA — lectura y escritura de la verificación desde la consola (servidor).
// ============================================================================
//
// La escritura la llama SÓLO src/lib/operador/verificacion-profe-actions.ts, después de
// `operadorParaNegocio` (sesión de operador + candado de CH). La regla (qué filas cuentan, cuándo se
// puede verificar, qué fila se escribe) está en src/lib/profeturnos/verificacion-core.ts.
//
// NO lleva "use server": exporta funciones que reciben un tenantId y un nombre de operador; un
// endpoint así sería una puerta para verificar sin sesión. `server-only`: importa `operatorPrisma`.
// Vive separado de la action para probarlo contra Postgres (verificacion-profe-postgres.test.ts).
//
// Todo en UNA transacción parada en el negocio (GUC, como la consola bajo RLS) y con un candado de
// transacción por negocio: dos clics a la vez escriben UNA fila (el segundo relee y ve «ya estaba»).

import "server-only";
import type { PrismaClient } from "@/generated/prisma/client";
import { operatorPrisma } from "@/lib/operator-db";
import {
  ACCION_VERIFICADO,
  decidirVerificar,
  estadoDeVerificacion,
  filaDeVerificado,
  filtroDeVerificacion,
  type EstadoVerificacion,
} from "@/lib/profeturnos/verificacion-core";

const SELECT_FILA = { id: true, action: true, actor: true, channel: true, createdAt: true } as const;

export interface VerificacionDeLaFicha {
  estado: EstadoVerificacion;
  /** La última verificación vigente: quién (actor `operator:<nombre>`) y cuándo. */
  verificadoPor: string | null;
  verificadoEl: Date | null;
}

export type ResultadoDeVerificar = { tipo: "verificado" } | { tipo: "rechazado"; motivo: string; yaEstaba?: true };

/** Lo que muestra la ficha del negocio, o `null` si no se pudo leer. */
export async function leerVerificacionDeLaFicha(tenantId: string, db: PrismaClient = operatorPrisma): Promise<VerificacionDeLaFicha | null> {
  try {
    const filas = await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`;
      return tx.auditLog.findMany({
        where: filtroDeVerificacion(tenantId),
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        distinct: ["action"],
        select: SELECT_FILA,
      });
    });
    const estado = estadoDeVerificacion(filas);
    const ultima = estado === "verificado" ? filas.find((f) => f.action === ACCION_VERIFICADO) : undefined;
    return {
      estado,
      verificadoPor: ultima ? ultima.actor.replace(/^operator:/, "") : null,
      verificadoEl: ultima?.createdAt ?? null,
    };
  } catch {
    return null;
  }
}

/** Marca al profe como verificado (WhatsApp confirmado). Idempotente: si ya estaba, no escribe. */
export async function verificarProfe(
  p: { tenantId: string; operador: string; ahora?: Date },
  db: PrismaClient = operatorPrisma,
): Promise<ResultadoDeVerificar> {
  const tenantId = p.tenantId.trim();
  const operador = p.operador.trim();
  if (!tenantId || !operador) return { tipo: "rechazado", motivo: "Falta el negocio o el operador. No se hizo nada." };
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('profeturnos.verificacion'), hashtext(${tenantId}))`;
    const filas = await tx.auditLog.findMany({
      where: filtroDeVerificacion(tenantId),
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      distinct: ["action"],
      select: SELECT_FILA,
    });
    const d = decidirVerificar(estadoDeVerificacion(filas));
    if (!d.ok) return { tipo: "rechazado", motivo: d.motivo, ...(d.yaEstaba ? { yaEstaba: true as const } : {}) };
    await tx.auditLog.create({ data: filaDeVerificado(tenantId, operador, p.ahora ?? new Date()), select: { id: true } });
    return { tipo: "verificado" };
  });
}
