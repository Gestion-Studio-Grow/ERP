// EVENTOS Y SPONSORS · quién lo abre dentro del panel de Gestión (GSG-CRM-009).
//
// `requireApp` mira el rol del ERP. En un negocio con panel de Gestión (MIA → Proyectos) manda además el rol
// de gestión de la persona (Dirección, Comercial…): esconder la entrada del menú no alcanza, porque la URL
// escrita a mano abre igual. Esta guardia aplica la MISMA regla que el menú (`appDeGestionVisible`) en cada
// página y en cada acción. Fuera de un panel de Gestión no cambia nada.

import "server-only";
import type { SessionUser } from "@/lib/session";
import { getNegocioApps } from "@/apps/contexto.server";
import { appDelPanelCerrado } from "@/apps/visibles";
import { actorActual } from "@/lib/proyectos/gestion.server";
import { appDeGestionVisible } from "@/lib/proyectos/gestion-core";

export async function rolDeGestionPermiteEventos(user: SessionUser): Promise<boolean> {
  const panel = appDelPanelCerrado(await getNegocioApps(user.role, user.overrides));
  if (panel?.id !== "proyectos") return true;
  const actor = await actorActual();
  return appDeGestionVisible("eventos-sponsors", actor.rol, actor.permisos);
}
