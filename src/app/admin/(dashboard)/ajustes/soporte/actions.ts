"use server";
// ============================================================================
// SOPORTE GSG — dar o sacar el permiso a la IA de soporte (MANT-003, D4).
// ============================================================================
//
// Un endpoint. Del formulario llegan SÓLO el nivel (n1/n2) y si la casilla quedó tildada. Quién lo
// hace, su rol y el negocio salen de la sesión (requireUser): un tenantId, userId o rol que venga en
// el formulario se ignora. registrarConsentimientoConCopia vuelve a exigir OWNER, que el usuario sea
// de ESTE negocio y que n2 no se dé sin n1; la copia por mail queda en borrador (no se envía).

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/authz";
import { registrarConsentimientoConCopia, type CopiaEnBorrador } from "@/lib/soporte/consentimiento.server";

export type ResultadoPermiso = { ok: true; mensaje: string; copia: CopiaEnBorrador } | { ok: false; error: string };

export async function cambiarPermisoSoporteAction(_previo: ResultadoPermiso | null, fd: FormData): Promise<ResultadoPermiso> {
  const user = await requireUser();
  const r = await registrarConsentimientoConCopia({
    tenantId: user.tenantId,
    userId: user.id,
    rol: user.role,
    nivel: fd.get("nivel"),
    aceptado: fd.get("aceptado") === "on",
  });
  if (!r.ok) return r;
  revalidatePath("/admin/ajustes/soporte");
  const que = r.vigente.n1 ? (r.vigente.n2 ? "la IA puede leer tus pedidos y proponer cambios de la lista" : "la IA puede leer tus pedidos, sin proponer cambios") : "la IA no lee tus pedidos";
  return { ok: true, mensaje: `Listo: quedó guardado. Desde ahora ${que}.`, copia: r.copia };
}
