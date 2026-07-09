"use server";

import { revalidatePath } from "next/cache";
import { requireCapability } from "@/lib/authz";
import { getCurrentTenantId } from "@/lib/tenant";
import { payPayable } from "@/lib/debts/payable-service";

const ALLOWED = ["EFECTIVO", "TRANSFERENCIA", "MERCADOPAGO"] as const;
type Method = (typeof ALLOWED)[number];
function parseMethod(v: FormDataEntryValue | null): Method {
  const s = String(v ?? "");
  return (ALLOWED as readonly string[]).includes(s) ? (s as Method) : "EFECTIVO";
}

// Registrar un PAGO/egreso parcial a una cuenta a pagar (D2) → se asienta vía el servicio
// de S1 (`payPayable` → Collection PAYABLE). El cheque diferido que ACREDITA lo maneja el
// servicio de cheques de S1 (`transitionCheque`) desde el detalle; acá se asienta el pago
// contra el saldo, con la misma validación (no sobre-pagar) del server.
export async function registerPayablePayment(formData: FormData): Promise<void> {
  const user = await requireCapability("billing:manage");
  const tenantId = await getCurrentTenantId();

  const id = String(formData.get("id") || "").trim();
  const amount = Number(String(formData.get("monto") || "").replace(",", "."));
  const method = parseMethod(formData.get("metodo"));
  const note = String(formData.get("nota") || "").trim() || null;
  if (!id) return;

  await payPayable(tenantId, id, { amount, method, note, by: `user:${user.id}` });

  revalidatePath(`/admin/cuentas-a-pagar/${id}`);
  revalidatePath("/admin/cuentas-a-pagar");
}
