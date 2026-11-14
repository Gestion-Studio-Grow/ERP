// ProfeTurnos — ALTA ASISTIDA: la lectura del estado de verificación en el plano del NEGOCIO
// (turnero público, acciones del alumno, panel del profe). La regla está en verificacion-core.ts.
//
// Va con el cliente de la app (`prisma`, RLS por negocio) y con el `tenantId` escrito a mano además
// (con RLS apagado el cliente es el crudo y el filtro explícito es lo único que acota). UNA consulta
// por request y negocio (`react.cache`). Si la lectura falla devuelve `null`: cada consumidor decide
// con `turneroTomaPedidos` (fail-closed) o `panelMuestraAviso` (no bloquea).
//
// NO lleva "use server" (publicaría cada export como endpoint) y es `server-only`.

import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import {
  estadoDeVerificacion,
  filtroDeVerificacion,
  turneroTomaPedidos,
  type EstadoVerificacion,
} from "./verificacion-core";

/** El estado del negocio, o `null` si no se pudo leer. */
export const estadoDeVerificacionDe = cache(async (tenantId: string): Promise<EstadoVerificacion | null> => {
  try {
    const filas = await prisma.auditLog.findMany({
      where: filtroDeVerificacion(tenantId),
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      distinct: ["action"],
      select: { id: true, action: true, actor: true, channel: true, createdAt: true },
    });
    return estadoDeVerificacion(filas);
  } catch (err) {
    logger.warn("profeturnos", "no se pudo leer la verificación del profe; el turnero queda en verificación", {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
});

/** ¿El turnero público de este negocio toma pedidos? Lectura fallida → no (fail-closed). */
export async function turneroAbiertoDe(tenantId: string): Promise<boolean> {
  return turneroTomaPedidos(await estadoDeVerificacionDe(tenantId));
}
