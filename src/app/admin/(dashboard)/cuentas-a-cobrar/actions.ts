"use server";

import { revalidatePath } from "next/cache";
import { requireCapability } from "@/lib/authz";
import { getCurrentTenantId } from "@/lib/tenant";
import { collectReceivable } from "@/lib/debts/receivable-service";
import { MEDIO_OBLIGATORIO, cuentasCorrientesEnabled, leerMedio } from "@/lib/settlement/asiento-libro";

// Registrar un COBRO parcial contra una cuenta a cobrar (fiado) → se asienta como
// Collection (D9, originType RECEIVABLE) vía el servicio de S1. La validación de saldo
// (no sobre-cobrar) es la MISMA regla del server (`validateNewCollection` dentro de
// `recordCollection`, atómica) que el form ya corre en cliente para feedback inmediato.
//
// El MEDIO es obligatorio: si no viene, no se cobra. Antes, sin medio se suponía efectivo, y
// un cobro por transferencia anotado como efectivo descuadra el cajón. Con
// CUENTAS_CORRIENTES_ENABLED el cobro además entra al libro de caja en la misma transacción
// (y se frena si hoy ya está cerrado); por eso se revalidan el libro y el cierre.
//
// Pendiente de la UI de cuentas corrientes (ola 3): el formulario todavía es de `action`
// sin estado, así que un rechazo (día cerrado, medio faltante) no se puede mostrar al lado
// del botón. Los mensajes ya están escritos para leerse tal cual cuando pase a useActionState.
export async function registerReceivableCollection(formData: FormData): Promise<void> {
  const user = await requireCapability("billing:manage");
  const tenantId = await getCurrentTenantId();

  const id = String(formData.get("id") || "").trim();
  const amount = Number(String(formData.get("monto") || "").replace(",", "."));
  const method = leerMedio(formData.get("metodo"));
  const note = String(formData.get("nota") || "").trim() || null;
  if (!id) return;
  if (!method) throw new Error(MEDIO_OBLIGATORIO);

  await collectReceivable(tenantId, id, { amount, method, note, by: `user:${user.id}` });

  revalidatePath(`/admin/cuentas-a-cobrar/${id}`);
  revalidatePath("/admin/cuentas-a-cobrar");
  if (cuentasCorrientesEnabled()) {
    revalidatePath("/admin/caja/libro");
    revalidatePath("/admin/caja/cierre");
  }
}
