"use server";

// ============================================================================
// PROFETURNOS · ALTA ASISTIDA — «Verificar profe (WhatsApp confirmado)» desde la ficha del negocio.
// ============================================================================
//
// Un endpoint del plano de operador (ADR-021). El operador sale de `requireOperadorParaNegocio` (la
// cookie firmada; en CH, además, el candado), SIEMPRE lo primero: nunca del formulario. Sólo para
// negocios que se dieron de alta solos desde la web (fila `profeturnos.alta`); la regla y la escritura
// están en src/lib/profeturnos/verificacion-core.ts y verificacion-profe.server.ts. Queda en la
// auditoría del negocio quién verificó y cuándo; desde ese momento su turnero toma pedidos.

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireOperadorParaNegocio } from "@/lib/operador/guardia-negocio";
import { verificarProfe } from "@/lib/operador/verificacion-profe.server";

function volver(tenantId: string, q: Record<string, string>): never {
  redirect(`/operador/tenants/${encodeURIComponent(tenantId)}?${new URLSearchParams(q).toString()}`);
}

export async function verificarProfeAction(formData: FormData) {
  const tenantId = String(formData.get("tenantId") || "").trim();
  const sesion = await requireOperadorParaNegocio({ id: tenantId });
  if (!tenantId) redirect("/operador?error=notfound");
  if (formData.get("confirmo") !== "si") {
    volver(tenantId, { error: "Tildá que hablaste con el profe por WhatsApp desde GSG antes de verificarlo. No se hizo nada." });
  }

  let r: Awaited<ReturnType<typeof verificarProfe>>;
  try {
    r = await verificarProfe({ tenantId, operador: sesion.nombre });
  } catch {
    volver(tenantId, { error: "No pudimos guardar la verificación. No se hizo nada: recargá la ficha y probá de nuevo." });
  }
  if (r.tipo === "rechazado") volver(tenantId, r.yaEstaba ? { ok: r.motivo.replace(" No se hizo nada.", "") } : { error: r.motivo });

  revalidatePath(`/operador/tenants/${tenantId}`);
  revalidatePath("/clases");
  revalidatePath("/admin/clases", "layout");
  volver(tenantId, { ok: "Profe verificado: su turnero ya toma pedidos." });
}
