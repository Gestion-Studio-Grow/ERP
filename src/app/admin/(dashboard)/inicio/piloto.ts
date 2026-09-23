// ¿Este negocio ve el Inicio por apps? Sí si su slug está en `APPS_INICIO` (lista de slugs o
// "*"). Lo leen la página del Inicio y el layout (para el buscador con Ctrl/⌘K), y con
// `react.cache` comparten la lectura en el request.
//
// Sin la variable no se lee nada: CH y todo negocio fuera del piloto siguen exactamente con
// su Inicio y su barra de hoy, sin una consulta de más. Si leer el negocio falla, se queda
// en el Inicio de hoy: el nuevo es un piloto y nunca puede dejar a alguien sin Inicio.

import "server-only";
import { cache } from "react";
import { negocioEnAppsInicio } from "@/apps/visibles";
import { negocioActual } from "@/apps/kpis/negocio.server";
import { appsInicioValor } from "@/modules/flags";
import { logger } from "@/lib/logger";

export const enInicioPorApps = cache(async (): Promise<boolean> => {
  const valor = appsInicioValor();
  if (!valor) return false;
  try {
    const { slug } = await negocioActual();
    return negocioEnAppsInicio(slug, valor);
  } catch (err) {
    logger.warn("apps", "no se pudo leer el negocio para APPS_INICIO; queda el Inicio de hoy", {
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
});
