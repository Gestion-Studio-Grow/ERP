"use server";

// ============================================================================
// VOUCHERS · guardar quién es la administración (sus CUIT/CUIL/CBU/CVU). Server Action.
// ============================================================================
//
// Puerta: `cash:manage` + sólo la dueña (`motivoParaNoEditarPagadores`, `vouchers:conciliar`: no se prende
// por usuario). Interruptor «vouchers» apagado o demo = rechazo. La columna sin migrar
// (20261110120000_voucher_pagadores, Gate 2) vuelve como «falta un paso de base de datos» y no se escribe
// nada. Queda en el AuditLog (`BusinessSettings`, `voucher.pagadores`).

import { unstable_rethrow } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/authz";
import { getCurrentTenantId } from "@/lib/tenant";
import { isDemoSandbox } from "@/lib/demo-flag";
import { auditAdmin } from "@/lib/audit-core";
import { isColumnMissing } from "@/lib/prisma-errors";
import { interruptoresDelNegocio } from "@/cambios/interruptores.server";
import { vouchersPrendidos } from "@/cambios/interruptores";
import { MENSAJES_VOUCHER } from "./voucher-core";
import { leerPagadoresDelFormulario } from "./acreditacion-core";
import { motivoParaNoEditarPagadores, PAGADORES_SIN_MIGRAR } from "./pagadores-administracion";

export type ResultadoPagadores = { ok: true; pagadores: string[] } | { ok: false; error: string };

/** Campo `pagadores`: uno por renglón (o separados por coma). Vacío = se frena por monto y fecha. */
export async function guardarPagadoresDeLaAdministracion(formData: FormData): Promise<ResultadoPagadores> {
  const user = await requireCapability("cash:manage");
  // El permiso fino va ANTES del interruptor y de la demo: quien no puede no se entera de nada más.
  const negado = motivoParaNoEditarPagadores(user);
  if (negado) return { ok: false, error: negado };
  if (!vouchersPrendidos(await interruptoresDelNegocio())) return { ok: false, error: MENSAJES_VOUCHER.apagado };
  if (isDemoSandbox()) return { ok: false, error: "En la demo los vouchers no se guardan." };
  const leido = leerPagadoresDelFormulario(String(formData.get("pagadores") ?? ""));
  if (!leido.ok) return leido;
  const tenantId = await getCurrentTenantId();
  try {
    await prisma.businessSettings.upsert({
      where: { tenantId },
      update: { voucherPagadores: { set: leido.pagadores } },
      create: { tenantId, voucherPagadores: leido.pagadores },
      // Sólo el id: sin `select` el RETURNING pide todas las columnas.
      select: { id: true },
    });
  } catch (e) {
    unstable_rethrow(e);
    if (isColumnMissing(e, "voucherPagadores")) return { ok: false, error: PAGADORES_SIN_MIGRAR };
    throw e;
  }
  await auditAdmin({ action: "voucher.pagadores", entity: "BusinessSettings", entityId: tenantId, changes: { voucherPagadores: leido.pagadores } });
  revalidatePath("/admin/vouchers");
  return { ok: true, pagadores: leido.pagadores };
}
