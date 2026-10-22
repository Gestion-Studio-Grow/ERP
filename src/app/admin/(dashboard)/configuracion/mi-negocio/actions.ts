"use server";

// ============================================================================
// Server Action de «Mi negocio» (reingeniería CH, Tanda 3 · 3-D · CH-035/053/068).
// ============================================================================
//
// Sólo la DUEÑA (rol OWNER + `location:manage`, la capability de la configuración del negocio). El
// `tenantId` sale de la sesión; lo que llega del formulario se valida con `validarReglas` (settings.ts).
// Graba por `tenantId` (único) adentro de `tenantTransaction` (RLS), con una fila de auditoría con el
// antes y el después en la MISMA transacción. Sin la migración M2 no escribe nada: contesta
// «pendiente de activar» (CH-053) y rige el placeholder D2/D5.

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/authz";
import { roleHasCapability } from "@/lib/capabilities";
import { getCurrentTenantId } from "@/lib/tenant";
import { tenantTransaction } from "@/lib/rls";
import { logger } from "@/lib/logger";
import { guardarReglasDelNegocio, leerReglasDelNegocio, validarReglas } from "@/lib/settings";
import { leerFormularioMiNegocio } from "@/lib/mi-negocio/mi-negocio";

export type EstadoMiNegocio = { estado: "inicial" | "ok" | "error" | "pendiente"; mensaje: string };

export async function guardarMiNegocio(_previo: EstadoMiNegocio, form: FormData): Promise<EstadoMiNegocio> {
  const user = await requireUser();
  if (user.role !== "OWNER" || !roleHasCapability(user.role, "location:manage")) {
    return { estado: "error", mensaje: "Las reglas del negocio las cambia sólo la dueña." };
  }
  const v = validarReglas(leerFormularioMiNegocio(form));
  if (!v.ok) return { estado: "error", mensaje: v.error };
  const tenantId = await getCurrentTenantId();

  try {
    const r = await tenantTransaction(
      async (tx) => {
        const antes = await leerReglasDelNegocio(tenantId, tx);
        // Sin la migración la consulta de arriba ya cayó (y la tx con ella): no se intenta escribir.
        if (!antes.activas) return "pendiente" as const;
        const g = await guardarReglasDelNegocio(tenantId, v.reglas, tx);
        if (!g.ok) return "pendiente" as const;
        const { activas, ...anteriores } = antes;
        void activas;
        await tx.auditLog.create({
          data: {
            tenantId,
            actor: `user:${user.id}`,
            action: "update",
            entity: "BusinessSettings",
            entityId: tenantId,
            channel: "admin",
            changes: { origen: "mi-negocio", antes: anteriores, despues: v.reglas },
          },
        });
        return "ok" as const;
      },
      { tenantId },
    );
    if (r === "pendiente") {
      return {
        estado: "pendiente",
        mensaje: "Todavía no se pueden guardar: falta activar la actualización del sistema. Mientras tanto rigen las reglas que ves.",
      };
    }
  } catch (err) {
    logger.error("configuracion/mi-negocio", "no se pudieron guardar las reglas", err);
    return { estado: "error", mensaje: "No se pudieron guardar las reglas. No se cambió nada: probá de nuevo." };
  }
  revalidatePath("/admin/configuracion/mi-negocio");
  revalidatePath("/admin/turnos", "layout"); // el alias va en los WhatsApp de la seña
  return { estado: "ok", mensaje: "Listo, quedaron guardadas." };
}
