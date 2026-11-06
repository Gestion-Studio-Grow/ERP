"use server";

// «Ver menos» / «Dejar el modo simple» desde el perfil propio (menú de la persona). Cualquier persona
// con sesión cambia SU preferencia; la regla es la misma de la matriz (`decidirCambioDePermiso`, con
// la excepción `ui:`), la escritura va en `tenantTransaction` y queda en la auditoría. La casilla
// de Usuarios (dueña) usa `setUserPermission` con la misma clave.

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { requireUser } from "@/lib/authz";
import { tenantTransaction } from "@/lib/rls";
import { auditAdmin } from "@/lib/audit-core";
import { isDemoSandbox } from "@/lib/demo-sandbox";
import { decidirCambioDePermiso, leerAllowed } from "@/lib/permisos/cambio-de-permiso";
import { grabarCambioDePermisoEnTx } from "@/lib/permisos/grabar-permiso";
import { esTablaAusente } from "@/lib/permisos-overrides";
import { COOKIE_VER_TODO, PREFERENCIA_MODO_SIMPLE } from "@/lib/modo-simple";

export async function cambiarMiModoSimple(formData: FormData): Promise<void> {
  const user = await requireUser();
  if (isDemoSandbox()) return;
  const d = decidirCambioDePermiso({
    actorId: user.id,
    objetivo: { id: user.id, role: user.role, professionalId: user.professionalId, overrides: user.overrides },
    capability: PREFERENCIA_MODO_SIMPLE,
    allowed: leerAllowed(formData.get("allowed")),
  });
  if (!d.ok) return;
  try {
    await tenantTransaction((tx) => grabarCambioDePermisoEnTx(tx, { tenantId: user.tenantId, userId: user.id, plan: d.plan }));
  } catch (e) {
    // Sin la tabla (Gate 2) no hay dónde guardarlo: sigue en modo completo.
    if (esTablaAusente(e)) return;
    throw e;
  }
  // Lo recién elegido manda sobre un «Ver todo» viejo de esta sesión.
  (await cookies()).delete(COOKIE_VER_TODO);
  await auditAdmin({
    action: "ui_preference_set",
    entity: "User",
    entityId: user.id,
    changes: { capability: PREFERENCIA_MODO_SIMPLE, antes: d.plan.antes, despues: d.plan.allowed },
  });
  revalidatePath("/admin", "layout");
}
