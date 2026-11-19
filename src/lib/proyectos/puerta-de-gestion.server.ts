// MIA-50 T11 · Adenda 2 (C-CF2): la puerta del rol de Proyectos en el servidor, para las páginas y las acciones de las apps
// del ERP que entran al panel de la productora. Regla pura: `puerta-de-gestion.ts`. En CH no cambia nada.
import "server-only";
import { redirect, unstable_rethrow } from "next/navigation";
import { requireUser } from "@/lib/authz";
import { getNegocioApps } from "@/apps/contexto.server";
import { appDelPanelCerrado } from "@/apps/visibles";
import type { ModuloGestion } from "./gestion-core";
import { actorActual } from "./gestion.server";
import { puertaDeGestionAbierta, SIN_PUERTA_DE_GESTION } from "./puerta-de-gestion";

async function abierta(modulo: ModuloGestion, nivel: "ver" | "editar"): Promise<boolean> {
  const user = await requireUser();
  const panel = appDelPanelCerrado(await getNegocioApps(user.role, user.overrides));
  if (panel?.id !== "proyectos") return true;
  let actor: Awaited<ReturnType<typeof actorActual>> | null = null;
  try {
    actor = await actorActual();
  } catch (e) {
    unstable_rethrow(e);
    actor = null; // sin permiso de agenda: no hay rol de Proyectos que leer, y no pasa
  }
  return puertaDeGestionAbierta(panel.id, actor, modulo, nivel);
}

/** Para una página: sin el permiso, de vuelta a Proyectos (la misma salida que el layout y que `exigirVer`). */
export async function exigirPuertaDeGestion(modulo: ModuloGestion, nivel: "ver" | "editar"): Promise<void> {
  if (!(await abierta(modulo, nivel))) redirect("/admin/proyectos/inicio");
}

/** Para una acción: el motivo para mostrar, o null si pasa. La acción vuelve sin escribir nada. */
export async function sinPuertaDeGestion(modulo: ModuloGestion, nivel: "ver" | "editar"): Promise<string | null> {
  return (await abierta(modulo, nivel)) ? null : SIN_PUERTA_DE_GESTION;
}
