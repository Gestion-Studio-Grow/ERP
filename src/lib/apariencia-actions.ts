"use server";

// Server Actions de APARIENCIA del backoffice (/admin/apariencia).
//
// Hoy: el COLOR DEL EQUIPO — persiste `Tenant.accentPreset` (columna existente;
// la misma que lee la ficha de marca RFC-004-D y el helper team-accent.ts). El
// tema claro/oscuro NO pasa por acá a propósito: es preferencia POR PERSONA y
// POR DISPOSITIVO (localStorage, ThemeToggle), no un dato del negocio.
//
// Gate: capability `appearance:manage` (solo OWNER), patrón de las demás
// actions de configuración (settings-actions). La escritura va sobre la fila
// Tenant del PROPIO tenant actual (predicado por id resuelto server-side —
// Tenant está fuera de RLS por diseño, es la raíz del aislamiento).

import { revalidatePath } from "next/cache";
import { basePrisma } from "@/lib/prisma-base";
import { requireCapability } from "@/lib/authz";
import { getCurrentTenantId } from "@/lib/tenant";
import { auditAdmin } from "@/lib/audit";
import { ACCENT_PRESETS, type AccentPreset } from "@/lib/branding";

export type ResultadoApariencia = { ok: true } | { ok: false; error: string };

/** Guarda el color del equipo (preset de acento del backoffice) del tenant actual. */
export async function updateAccentPresetAction(preset: string): Promise<ResultadoApariencia> {
  await requireCapability("appearance:manage");
  const tenantId = await getCurrentTenantId();

  const limpio = (preset ?? "").trim().toLowerCase();
  if (!(limpio in ACCENT_PRESETS)) {
    return { ok: false, error: "Ese color no está en la paleta del sistema." };
  }

  await basePrisma.tenant.update({
    where: { id: tenantId },
    data: { accentPreset: limpio as AccentPreset },
  });

  await auditAdmin({
    action: "update",
    entity: "Tenant.accentPreset",
    entityId: tenantId,
    changes: { accentPreset: limpio },
  });

  // El acento se inyecta en el layout del admin (y en el login) → refrescar el
  // árbol completo del panel para que el próximo render ya salga con el nuevo.
  revalidatePath("/admin", "layout");
  return { ok: true };
}
