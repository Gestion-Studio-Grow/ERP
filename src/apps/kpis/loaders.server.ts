// ============================================================================
// QUÉ LOADER CALCULA CADA NÚMERO — por id de KPI (`AppDescriptor.kpi.id`).
// ============================================================================
//
// Un archivo por dominio, cada uno de su frente dueño; acá sólo se juntan. Una app que
// declara KPI y todavía no tiene loader va al Inicio sin número (no con un 0). Un test
// fija cuáles faltan, para que la lista sólo pueda achicarse.
//
// Sin "server-only" para que los tests lo importen; `index.server.ts` sí lo lleva.

import type { LoaderKpi } from "./nucleo.server";
import { LOADERS_ADMINISTRACION } from "./administracion.server";
import { LOADERS_COMERCIAL } from "./comercial.server";
import { LOADERS_FINANZAS } from "./finanzas.server";
import { LOADERS_LOCALES } from "./locales.server";
import { LOADERS_LOGISTICA } from "./logistica.server";
import { LOADERS_MOSTRADOR } from "./mostrador.server";
import { LOADERS_PRECIOS } from "./precios.server";

export const LOADERS_KPI: Readonly<Record<string, LoaderKpi>> = {
  ...LOADERS_MOSTRADOR,
  ...LOADERS_FINANZAS,
  ...LOADERS_LOGISTICA,
  ...LOADERS_PRECIOS,
  ...LOADERS_COMERCIAL,
  ...LOADERS_ADMINISTRACION,
  ...LOADERS_LOCALES,
};
