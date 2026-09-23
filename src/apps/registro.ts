// ============================================================================
// REGISTRO DE APPS — la única lista de pantallas del panel.
// ============================================================================
//
// Junta los siete catálogos por dominio. Se congela después de la ola 1: una app nueva se
// agrega en el catálogo de su frente y entra sola; un catálogo nuevo es un cambio de
// plataforma. La barra de hoy, el Inicio, el buscador y la guardia de cada página salen de
// acá (las listas viejas de admin-nav-items.ts y nav-groups.ts quedan como menú de hoy
// hasta la limpieza, y un test exige que den lo mismo).
//
// Dato puro: se puede importar desde el cliente.

import type { AppDescriptor } from "./contract";
import { APPS_ADMINISTRACION } from "./catalogo/administracion";
import { APPS_COMERCIAL } from "./catalogo/comercial";
import { APPS_MOSTRADOR } from "./catalogo/mostrador";
import { APPS_PRECIOS } from "./catalogo/precios";
import { APPS_LOGISTICA } from "./catalogo/logistica";
import { APPS_FINANZAS } from "./catalogo/finanzas";
import { APPS_LOCALES } from "./catalogo/locales";

const TODAS = [
  ...APPS_ADMINISTRACION,
  ...APPS_COMERCIAL,
  ...APPS_MOSTRADOR,
  ...APPS_PRECIOS,
  ...APPS_LOGISTICA,
  ...APPS_FINANZAS,
  ...APPS_LOCALES,
] as const;

/** Id de una app registrada. `requireApp("facturacon")` no compila: el typo se ve en el build. */
export type AppId = (typeof TODAS)[number]["id"];

export const REGISTRO_APPS: readonly AppDescriptor[] = TODAS;

const POR_ID = new Map<string, AppDescriptor>(REGISTRO_APPS.map((a) => [a.id, a]));

/** La app con ese id. Tira si no existe: con `AppId` tipado sólo pasa si alguien castea. */
export function appPorId(id: AppId): AppDescriptor {
  const app = POR_ID.get(id);
  if (!app) throw new Error(`App no registrada: "${id}"`);
  return app;
}

/**
 * La app con ese id, o `undefined`. Para ids que llegan de afuera (el `?app=` de
 * "App no disponible"): nunca se confía en que el texto sea un id válido.
 */
export function buscarApp(id: string | null | undefined): AppDescriptor | undefined {
  return id ? POR_ID.get(id) : undefined;
}
