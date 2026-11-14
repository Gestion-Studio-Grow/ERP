"use server";

// ============================================================================
// VOUCHERS · guardar el valor del voucher del negocio (orden del dueño, 09/11/2026). Server Actions.
// ============================================================================
//
// Puerta: `location:manage` (la configuración del negocio) + sólo la dueña (`motivoParaNoEditarValor`,
// la misma capacidad fina que conciliar: no se prende por usuario). Interruptor «vouchers» apagado =
// rechazo. La columna sin migrar (20261109200000_voucher_valor, Gate 2) vuelve como «falta un paso de
// base de datos» y no se escribe nada. Queda en el AuditLog (`BusinessSettings`, `voucher.valor`).

import { unstable_rethrow } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/authz";
import { getCurrentTenantId } from "@/lib/tenant";
import { auditAdmin } from "@/lib/audit-core";
import { isColumnMissing } from "@/lib/prisma-errors";
import { interruptoresDelNegocio } from "@/cambios/interruptores.server";
import { vouchersPrendidos } from "@/cambios/interruptores";
import { MENSAJES_VOUCHER } from "./voucher-core";
import { leerValorDelFormulario, motivoParaNoEditarValor, VALOR_SIN_MIGRAR } from "./valor-voucher";

export type ResultadoValorVoucher = { ok: true; valor: number | null } | { ok: false; error: string };

/** Campo `valor`: el importe (regla de la casa) o vacío para que el voucher cubra lo que falta cobrar. */
export async function guardarValorVoucher(formData: FormData): Promise<ResultadoValorVoucher> {
  const user = await requireCapability("location:manage");
  const negado = motivoParaNoEditarValor(user);
  if (negado) return { ok: false, error: negado };
  if (!vouchersPrendidos(await interruptoresDelNegocio())) return { ok: false, error: MENSAJES_VOUCHER.apagado };
  const leido = leerValorDelFormulario(String(formData.get("valor") ?? ""));
  if (!leido.ok) return leido;
  const tenantId = await getCurrentTenantId();
  try {
    await prisma.businessSettings.upsert({
      where: { tenantId },
      update: { voucherValor: leido.valor },
      create: { tenantId, voucherValor: leido.valor },
      select: { id: true },
    });
  } catch (e) {
    unstable_rethrow(e);
    if (isColumnMissing(e, "voucherValor")) return { ok: false, error: VALOR_SIN_MIGRAR };
    throw e;
  }
  await auditAdmin({ action: "voucher.valor", entity: "BusinessSettings", entityId: tenantId, changes: { voucherValor: leido.valor } });
  revalidatePath("/admin/localizacion");
  revalidatePath("/admin/vouchers");
  return { ok: true, valor: leido.valor };
}
