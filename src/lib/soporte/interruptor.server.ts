// ============================================================================
// SOPORTE GSG — ¿está prendido el interruptor en ESTE negocio? (servidor)
// ============================================================================
//
// Decisión del dueño (14/11/2026, TANDA3-SOPORTE · B): Soporte GSG va detrás de un interruptor por
// negocio, APAGADO por defecto. Lo leen la pantalla del permiso, su action y el despacho a la IA, con
// el tenantId que ya tienen (la sesión o el ticket), no el del request: así sirve también al cron.
//
// Mismo almacén y mismas reglas que el resto de los interruptores (src/cambios/interruptores.ts):
// sólo cuentan las filas de la consola (actor `operator:`, canal "operador") y manda la última válida.
// Si la lectura falla, APAGADO (fail-closed).

import "server-only";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { enElNegocio } from "@/lib/operator-db";
import { logger } from "@/lib/logger";
import { SOPORTE_GSG, soporteGsgPrendido } from "@/cambios/interruptores";
import { estadoDesdeFilas, filtroDeFilasValidas } from "@/cambios/interruptores-core";

/** Dentro de una transacción ya parada en `tenantId` (RLS). Error → apagado. */
export async function soporteGsgPrendidoEnTx(tx: Prisma.TransactionClient, tenantId: string): Promise<boolean> {
  try {
    const filas = await tx.auditLog.findMany({
      where: { ...filtroDeFilasValidas(tenantId), entityId: SOPORTE_GSG },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { id: true, entity: true, entityId: true, action: true, actor: true, channel: true, createdAt: true },
    });
    return soporteGsgPrendido(estadoDesdeFilas(filas));
  } catch (err) {
    logger.warn("soporte", "no se pudo leer el interruptor de Soporte GSG; queda apagado", {
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

/** En su propia transacción, parada en el negocio. Error → apagado. */
export async function soporteGsgPrendidoEn(tenantId: string, db?: PrismaClient): Promise<boolean> {
  try {
    return await enElNegocio(tenantId, (tx) => soporteGsgPrendidoEnTx(tx, tenantId), db);
  } catch {
    return false;
  }
}
