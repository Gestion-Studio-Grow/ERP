// ============================================================================
// PADEL-CLASES — quién ve la PLATA del negocio (UAT 11/2026, Profesional).
// ============================================================================
//
// La pantalla Plata y su .csv muestran lo cobrado y lo que deben TODOS los alumnos: es un reporte
// financiero. Antes alcanzaba con abrir la app (requireApp, que un PROFESSIONAL con `agenda:read`
// pasa). Ahora además exige `reports:read`: en la matriz (capabilities.ts) sólo la tiene el OWNER;
// RECEPTION no (ADR-017: «no ve reportes financieros»). Recepción y el profe siguen cobrando desde
// Hoy, Pendientes y la ficha del alumno.

import { redirect } from "next/navigation";
import { requireApp } from "@/lib/require-app";
import { permisoFueraDeLaAgenda } from "@/lib/capabilities";
import type { SessionUser } from "@/lib/session";

/** ¿Este usuario ve la plata del negocio? */
export const veLaPlata = (user: Pick<SessionUser, "role" | "overrides">): boolean => permisoFueraDeLaAgenda(user, "reports:read");

/** Guardia de la pantalla Plata: sin el permiso, vuelve a Hoy (que sí puede abrir). */
export async function requirePlataDeClases(): Promise<SessionUser> {
  const user = await requireApp("padel-clases");
  if (!veLaPlata(user)) redirect("/admin/clases");
  return user;
}
