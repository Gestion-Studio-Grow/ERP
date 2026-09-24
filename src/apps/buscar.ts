// ============================================================================
// BUSCADOR DE APPS — client-safe y SIN el registro.
// ============================================================================
//
// Lo usa BuscadorApps.tsx ("use client", en la paleta de Ctrl/⌘K de todas las pantallas). Por
// eso no importa ./registro ni ./visibles: sólo el buscador de texto y el TIPO de la app. Lo que
// se busca llega ya calculado por el servidor (`appsVisibles`), así que el navegador no recibe
// nombres ni rutas de apps que la persona no ve. visibles.ts lo reexporta para los que ya lo
// importaban de ahí.

import { searchNavItems } from "@/modules/nav-search";
import type { AppDescriptor } from "./contract";

/**
 * Busca entre las apps que la persona YA ve. Recibe la salida de `appsVisibles` (que el
 * servidor calcula y le pasa al cliente): buscar nunca puede hacer aparecer una app oculta,
 * ni tecleando su nombre exacto. Busca por nombre, por las palabras y por el rótulo de hoy
 * ("Ajustes" sigue encontrando Mermas).
 */
export function buscarApps(visibles: readonly AppDescriptor[], query: string): AppDescriptor[] {
  const items = visibles
    .filter((app) => app.enLanzador !== false)
    .map((app) => ({
      app,
      href: app.ruta,
      label: app.nombre,
      alias: [
        ...(app.palabras ?? []),
        ...(app.menuDeHoy && app.menuDeHoy.etiqueta !== app.nombre ? [app.menuDeHoy.etiqueta] : []),
      ],
    }));
  return searchNavItems(items, query).map((i) => i.app);
}
