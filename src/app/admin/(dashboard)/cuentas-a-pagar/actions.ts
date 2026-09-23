"use server";

import { revalidatePath } from "next/cache";
import { requireCapability } from "@/lib/authz";
import { getCurrentTenantId } from "@/lib/tenant";
import { payPayable } from "@/lib/debts/payable-service";
import { MEDIO_OBLIGATORIO, cuentasCorrientesEnabled, leerMedio } from "@/lib/settlement/asiento-libro";

// Registrar un PAGO/egreso parcial a una cuenta a pagar (D2) → se asienta vía el servicio
// de S1 (`payPayable` → Collection PAYABLE). El cheque diferido que ACREDITA lo maneja el
// servicio de cheques de S1 (`transitionCheque`) desde el detalle; acá se asienta el pago
// contra el saldo, con la misma validación (no sobre-pagar) del server.
//
// El MEDIO es obligatorio (antes se suponía efectivo). Con CUENTAS_CORRIENTES_ENABLED el pago
// además entra al libro de caja como EGRESO en la misma transacción, con el freno de día
// cerrado; por eso se revalidan el libro y el cierre. Un rechazo todavía no se muestra al
// lado del botón: el formulario pasa a useActionState con la UI de la ola 3.
export async function registerPayablePayment(formData: FormData): Promise<void> {
  const user = await requireCapability("billing:manage");
  const tenantId = await getCurrentTenantId();

  const id = String(formData.get("id") || "").trim();
  const amount = Number(String(formData.get("monto") || "").replace(",", "."));
  const method = leerMedio(formData.get("metodo"));
  const note = String(formData.get("nota") || "").trim() || null;
  if (!id) return;
  if (!method) throw new Error(MEDIO_OBLIGATORIO);

  await payPayable(tenantId, id, { amount, method, note, by: `user:${user.id}` });

  revalidatePath(`/admin/cuentas-a-pagar/${id}`);
  revalidatePath("/admin/cuentas-a-pagar");
  if (cuentasCorrientesEnabled()) {
    revalidatePath("/admin/caja/libro");
    revalidatePath("/admin/caja/cierre");
  }
}
