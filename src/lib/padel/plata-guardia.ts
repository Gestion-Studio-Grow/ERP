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

/**
 * ¿Gestiona Clases (agendar, suspender, bloquear, notas, ajustes)? Es LA MISMA regla que cada acción
 * del servidor de padel (acciones*.ts: `requireCapabilityFueraDeLaAgenda("agenda:manage")`, que
 * llama a este mismo `permisoFueraDeLaAgenda`). Sirve sólo para no DIBUJAR un botón que el servidor
 * va a rechazar: el que protege es la acción. Hoy: OWNER y RECEPTION; el PROFESSIONAL, no.
 */
export const gestionaClases = (user: Pick<SessionUser, "role" | "overrides">): boolean => permisoFueraDeLaAgenda(user, "agenda:manage");

/**
 * ¿Ve la plata DEL DÍA (lo cobrado hoy y en la semana, quién debe)? Quien cobra en Clases: las
 * acciones de cobro exigen `agenda:manage` (OWNER y RECEPTION). El PROFESSIONAL no cobra acá ni ve
 * montos del negocio (certificación del arreglo UAT 11/2026, hallazgo 1).
 */
export const veLaPlataDelDia = gestionaClases;

/** Guardia de la pantalla Plata: sin el permiso, vuelve a Hoy (que sí puede abrir). */
export async function requirePlataDeClases(): Promise<SessionUser> {
  const user = await requireApp("padel-clases");
  if (!veLaPlata(user)) redirect("/admin/clases");
  return user;
}
