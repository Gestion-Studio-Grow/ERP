// Lectura tolerante de los overrides de la matriz de permisos (PLAN permisos §1, riesgo 6).
//
// La migración `20261105120000_user_permission_override` puede no estar aplicada en prod (Gate 2).
// Sin la tabla, Prisma tira P2021 (tabla) o P2022 (columna): ahí vale el default del rol (`[]`) y la
// app arranca igual. CUALQUIER otro error se relanza: tragarlo dejaría a alguien con un permiso
// que la dueña le apagó (una caída de la base no puede devolver «sin excepciones»).

import type { PermisoOverride } from "@/lib/capabilities";

let avisado = false;

export function esTablaAusente(e: unknown): boolean {
  const code = (e as { code?: unknown } | null)?.code;
  return code === "P2021" || code === "P2022";
}

export async function leerOverridesTolerante(
  leer: () => Promise<ReadonlyArray<PermisoOverride>>,
): Promise<ReadonlyArray<PermisoOverride>> {
  try {
    return await leer();
  } catch (e) {
    if (!esTablaAusente(e)) throw e;
    if (!avisado) {
      avisado = true;
      console.warn("[permisos] tabla UserPermissionOverride ausente: rige el default del rol (migración sin aplicar)");
    }
    return [];
  }
}
