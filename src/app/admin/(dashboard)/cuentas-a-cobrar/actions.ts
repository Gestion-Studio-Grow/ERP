"use server";

import { requireCapability } from "@/lib/authz";

// Registrar un COBRO parcial contra una cuenta a cobrar (fiado) — se asienta como
// Collection (D9, originType RECEIVABLE). Punto de cableado: hoy el loader de
// AccountReceivable es stub (S1), así que el form nunca se renderiza con datos y este
// action no se invoca. Cuando S1 publique la tabla, se completa el cuerpo con
// `recordCollection` (S1, `@/lib/settlement/collection-repo`) y `revalidatePath`.
export async function registerReceivableCollection(_formData: FormData): Promise<void> {
  await requireCapability("billing:manage");
  // TODO(S1): cargar la cuenta (totalCharged) por id oculto del form y llamar a
  // recordCollection({ originType: "RECEIVABLE", originId, totalCharged, amount, method,
  // note, collectedBy: `user:${user.id}` }); luego revalidatePath del detalle y el listado.
  throw new Error("Cobranza de fiado pendiente de activación (AccountReceivable + Collection).");
}
