import "server-only";
/**
 * MIA T06 · O10: una sola versión base aprobada por proyecto. La garantía es de la base (índice único parcial de M2,
 * `ProyectoPresupuesto_una_base_aprobada`); esto le da el mensaje en criollo y cubre la base sin M2 aplicada.
 * Los adicionales viven en su propia tabla: toda fila de ProyectoPresupuesto es una versión base.
 */
import type { Prisma } from "@/generated/prisma/client";

export const BASE_YA_APROBADA = "Ya hay una versión base aprobada: un cambio después de aprobado va como adicional.";

type Tx = Prisma.TransactionClient;

/** Otra versión del mismo proyecto ya aprobada (sin contar `salvoId`). Se llama adentro de la transacción que aprueba o envía. */
export async function hayBaseAprobada(tx: Tx, tenantId: string, proyectoId: string, salvoId?: string): Promise<boolean> {
  const n = await tx.proyectoPresupuesto.count({ where: { tenantId, proyectoId, estado: "APROBADO", ...(salvoId ? { id: { not: salvoId } } : {}) } });
  return n > 0;
}

/** Dos aprobaciones a la vez pasan las dos el `count`: la segunda choca contra el índice (P2002) y se lee como base ya aprobada. */
export function esChoqueDeBase(e: unknown): boolean {
  return (e as { code?: string } | null)?.code === "P2002";
}

export class BaseYaAprobada extends Error {
  constructor() {
    super(BASE_YA_APROBADA);
  }
}

/** Corre la transacción y traduce el choque del índice (o la guardia) a `"base"`. */
export async function conGuardiaDeBase<T>(correr: () => Promise<T>): Promise<T | "base"> {
  try {
    return await correr();
  } catch (e) {
    if (e instanceof BaseYaAprobada || esChoqueDeBase(e)) return "base";
    throw e;
  }
}
