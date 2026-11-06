/**
 * RENDÍ — aprobación de un nivel (Core, PURO). Recorte de `origin/frente/rendiciones` para MIA:
 * sin legajo, cadena de jefes ni suplencias. Aprueba DIRECCION o ADMINISTRACION; nadie aprueba lo propio.
 */

import type { RolActor } from "./tipos";

export const ROLES_APROBADORES: readonly RolActor[] = ["DIRECCION", "ADMINISTRACION"];

/** Nivel único de aprobación: los aprobadores candidatos menos quien rinde. */
export function nivelesDeAprobacion(
  rindeId: string,
  candidatos: readonly { id: string; rol: RolActor }[],
): string[][] {
  return [candidatos.filter((c) => ROLES_APROBADORES.includes(c.rol) && c.id !== rindeId).map((c) => c.id)];
}

/** Por qué no puede aprobar, o `null` si puede. Mensaje en criollo. */
export function motivoNoAprueba(rol: RolActor, actorId: string, rindeId: string): string | null {
  if (actorId === rindeId) return "Nadie aprueba lo propio: esta rendición es tuya";
  if (!ROLES_APROBADORES.includes(rol)) return "Sólo Dirección o Administración aprueban rendiciones";
  return null;
}

/** Puede aprobar (o devolver/rechazar) si es Dirección o Administración y la rendición no es suya. */
export function puedeAprobar(rol: RolActor, actorId: string, rindeId: string): boolean {
  return motivoNoAprueba(rol, actorId, rindeId) === null;
}
