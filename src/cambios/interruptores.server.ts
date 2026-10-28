// ============================================================================
// INTERRUPTORES DEL NEGOCIO ACTUAL (servidor, panel del negocio).
// ============================================================================
//
// UNA consulta por request (`react.cache`): el layout, el Inicio, la guardia de cada página y el
// gate por módulo (src/apps/contexto.server.ts) comparten la misma lectura. Va con el cliente de la
// app (`prisma`, RLS por negocio) y con el tenantId del request escrito a mano además: con RLS
// apagado el cliente es el crudo y el filtro explícito es lo único que acota.
//
// Sólo cuentan las filas de la consola (actor `operator:`, canal "operador"): se filtra en la
// consulta y otra vez en `estadoDesdeFilas`. Si la lectura falla, TODO APAGADO: el menú de siempre,
// que es lo seguro para CH y para cualquier negocio.
//
// NO lleva "use server" (publicaría cada export como endpoint) y es `server-only`: importa el valor
// `prisma`, que nunca puede llegar al navegador.

import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { getCurrentTenantId } from "@/lib/tenant";
import { logger } from "@/lib/logger";
import {
  estadoDesdeFilas,
  filtroDeFilasDeOcultas,
  filtroDeFilasValidas,
  ocultasDesdeFilas,
  todosApagados,
  trabajaPorApps,
  type EstadoInterruptores,
  type FilaLeida,
} from "./interruptores-core";
import type { AppOcultableId } from "./interruptores";

/**
 * Las filas de la consola del negocio actual (interruptores y apps ocultas), en UNA consulta por
 * request: la última de cada (entidad, id). `null` si la lectura falló.
 */
const filasDeLaConsola = cache(async (): Promise<FilaLeida[] | null> => {
  try {
    const tenantId = await getCurrentTenantId();
    return await prisma.auditLog.findMany({
      where: { OR: [filtroDeFilasValidas(tenantId), filtroDeFilasDeOcultas(tenantId)] },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      // La última de cada interruptor y de cada app oculta: son pocas filas (una por clic en la consola).
      distinct: ["entity", "entityId"],
      select: { id: true, entity: true, entityId: true, action: true, actor: true, channel: true, createdAt: true },
    });
  } catch (err) {
    logger.warn("interruptores", "no se pudieron leer los interruptores del negocio; queda todo apagado (menú de siempre)", {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
});

export const interruptoresDelNegocio = cache(async (): Promise<EstadoInterruptores> => {
  const filas = await filasDeLaConsola();
  return filas ? estadoDesdeFilas(filas) : todosApagados();
});

/**
 * Las apps que GSG ocultó en el negocio actual (src/cambios/interruptores.ts, «Apps ocultas»). Si
 * la lectura falla, NINGUNA: el negocio ve lo de siempre (ocultar es comodidad, no seguridad).
 */
export const appsOcultasDelNegocio = cache(async (): Promise<ReadonlySet<AppOcultableId>> => {
  const filas = await filasDeLaConsola();
  return filas ? ocultasDesdeFilas(filas) : new Set();
});

/** ¿El negocio actual trabaja por apps? (interruptor "inicio-por-apps"). */
export const enInicioPorAppsDelNegocio = cache(async (): Promise<boolean> => trabajaPorApps(await interruptoresDelNegocio()));
