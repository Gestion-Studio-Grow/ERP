"use server";

import { revalidatePath } from "next/cache";
import { requireCapability } from "@/lib/authz";
import { getCurrentTenantId } from "@/lib/tenant";
import { collectReceivable } from "@/lib/debts/receivable-service";

const ALLOWED = ["EFECTIVO", "TRANSFERENCIA", "MERCADOPAGO"] as const;
type Method = (typeof ALLOWED)[number];
function parseMethod(v: FormDataEntryValue | null): Method {
  const s = String(v ?? "");
  return (ALLOWED as readonly string[]).includes(s) ? (s as Method) : "EFECTIVO";
}

// Registrar un COBRO parcial contra una cuenta a cobrar (fiado) → se asienta como
// Collection (D9, originType RECEIVABLE) vía el servicio de S1. La validación de saldo
// (no sobre-cobrar) es la MISMA regla del server (`validateNewCollection` dentro de
// `recordCollection`, atómica) que el form ya corre en cliente para feedback inmediato.
export async function registerReceivableCollection(formData: FormData): Promise<void> {
  const user = await requireCapability("billing:manage");
  const tenantId = await getCurrentTenantId();

  const id = String(formData.get("id") || "").trim();
  const amount = Number(String(formData.get("monto") || "").replace(",", "."));
  const method = parseMethod(formData.get("metodo"));
  const note = String(formData.get("nota") || "").trim() || null;
  if (!id) return;

  await collectReceivable(tenantId, id, { amount, method, note, by: `user:${user.id}` });

  revalidatePath(`/admin/cuentas-a-cobrar/${id}`);
  revalidatePath("/admin/cuentas-a-cobrar");
}
