// ============================================================================
// cargarKpi — el número del botón de una app, para el rol que mira.
// ============================================================================
//
// Lo que decide (qué parte ve cada rol, el tope de 1,5 s, el log de milisegundos, '—' en vez
// de 0) está en nucleo.server.ts, probado sin base. Acá sólo se le da lo del request: el
// `prisma` global, el negocio, el día del negocio y el logger.
//
// `react.cache` por (app, rol): el tile y "Para atender hoy" piden el mismo número y la
// base se consulta una sola vez. Esa caché dura el request; entre requests no hay ninguna
// (un test lo exige para toda la carpeta).

import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { getCurrentTenantId } from "@/lib/tenant";
import { todayInBusinessTz } from "@/lib/datetime";
import { logger } from "@/lib/logger";
import type { Role } from "@/lib/capabilities";
import type { AppDescriptor } from "@/apps/contract";
import { buscarApp } from "@/apps/registro";
import { LOADERS_KPI } from "./loaders.server";
import { negocioActual } from "./negocio.server";
import {
  cargarKpiCon,
  crearFila,
  enParaleloDelPool,
  fallasForzadas,
  llevaNumero as llevaNumeroCon,
  pluralDe,
  type NegocioKpi,
  type ResultadoKpi,
} from "./nucleo.server";

export type { ResultadoKpi, AlertaKpi } from "./nucleo.server";
export { NO_SE_PUDO } from "./nucleo.server";

const negocioKpi = cache(async (): Promise<NegocioKpi> => {
  const [tenantId, negocio] = await Promise.all([getCurrentTenantId(), negocioActual()]);
  const uno = negocio.rubro?.wording.itemNoun?.trim() || "producto";
  return {
    db: prisma,
    tenantId,
    hoy: todayInBusinessTz(),
    ahora: new Date(),
    esMostrador: negocio.isRetail,
    sustantivo: { uno, varios: pluralDe(uno) },
  };
});

/**
 * La fila de números de ESTA instancia del servidor, compartida por todos los requests: el pool
 * de conexiones también es uno por instancia (prisma-base.ts), así que la fila lo acompaña. Con
 * una fila por request, dos Inicios a la vez ponían 10 números contra 5 conexiones y la espera
 * por conexión volvía a caer adentro del tope de 1,5 s. Tantos lugares como conexiones tiene el
 * pool: ver `crearFila` en nucleo.server.ts, con la medición que lo decidió. Sólo retiene un
 * turno, nunca datos: lo de cada negocio sigue en su transacción con RLS.
 */
const filaDeLaInstancia = crearFila(enParaleloDelPool(process.env.DB_CONNECTION_LIMIT));

/** ¿El tile de `app` lleva número para `role`? (declara KPI, el rol lo ve y hay loader). */
export function llevaNumero(app: AppDescriptor, role: Role): boolean {
  return llevaNumeroCon(app, role, LOADERS_KPI);
}

/**
 * El número de la app `appId` para `role`, o `null` si esa app no lleva número para ese rol.
 * No tira: si falla o tarda más de 1,5 s devuelve el estado de error y el tile muestra '—'.
 * No es una server action (no lleva "use server"): la llaman componentes de servidor con el
 * rol de la sesión que ya validaron.
 */
export const cargarKpi = cache((appId: string, role: Role): Promise<ResultadoKpi | null> => {
  const app = buscarApp(appId);
  if (!app) return Promise.resolve(null);
  return cargarKpiCon(app, role, {
    loaders: LOADERS_KPI,
    negocio: negocioKpi,
    log: logger,
    reloj: () => performance.now(),
    fallaForzada: fallasForzadas(process.env.KPI_FALLA_FORZADA),
    fila: filaDeLaInstancia,
  });
});
