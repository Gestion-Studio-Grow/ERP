"use server";

// ============================================================================
// Carnicería — «Guardar como predeterminado» la leyenda y el alto de la etiqueta de paquete.
// ============================================================================
//
// Se guarda junto a la config de la caja (config-repo.ts, sin migración) sin pisar el formato
// de la balanza ni los encargados. Lo cambia el dueño (catalog:manage, como la balanza y la
// caja), desde la app «Lotes y vencimientos». Sin guardar, la pantalla sólo cambia lo que se
// imprime en ese momento.

import { revalidatePath } from "next/cache";
import { tenantTransaction } from "@/lib/rls";
import { getCurrentTenantId } from "@/lib/tenant";
import { requireAppAccion, AppNoDisponibleError } from "@/lib/require-app";
import { permisoEfectivo } from "@/lib/capabilities";
import { motivoDelRechazoDelAlta } from "@/lib/order-core";
import { Prisma } from "@/generated/prisma/client";
import { guardarEtiquetaPaqueteEnTx } from "@/lib/supermercado/config-repo";
import { validarEtiquetaPaquete } from "./etiqueta-paquete-config";

export type EstadoEtiquetaPaquete = { ok: true; mensaje: string; version: string } | { ok: false; error: string } | null;

export async function guardarEtiquetaPaqueteDelNegocio(
  _prev: EstadoEtiquetaPaquete,
  formData: FormData,
): Promise<EstadoEtiquetaPaquete> {
  let userId: string;
  try {
    const user = await requireAppAccion("lotes-y-vencimientos");
    if (!permisoEfectivo(user, "catalog:manage")) {
      return { ok: false, error: "La etiqueta predeterminada la cambia el dueño del negocio. Igual podés imprimir con estos datos." };
    }
    userId = user.id;
  } catch (e) {
    if (e instanceof AppNoDisponibleError) return { ok: false, error: e.message };
    throw e;
  }
  const v = validarEtiquetaPaquete({ leyenda: String(formData.get("leyenda") ?? ""), altoMm: String(formData.get("altoMm") ?? "") });
  if (!v.ok) return v;
  const tenantId = await getCurrentTenantId();
  const versionLeida = String(formData.get("version") ?? "") || null;
  let version: string;
  try {
    version = await tenantTransaction(
      (tx) => guardarEtiquetaPaqueteEnTx(tx, tenantId, { etiquetaPaquete: v.valor, actor: `user:${userId}`, versionLeida }),
      { tenantId, isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (err) {
    const motivo = motivoDelRechazoDelAlta(err);
    if (motivo !== null) return { ok: false, error: motivo };
    throw err;
  }
  revalidatePath("/admin/lotes", "layout");
  return { ok: true, mensaje: "Listo: las próximas etiquetas salen con esta leyenda y este alto.", version };
}
