"use server";

import { requireCapability } from "@/lib/authz";

// Registrar un PAGO parcial a una cuenta a pagar (D2, J59). El egreso se asienta con el
// modelo de egreso (análogo de Collection para salidas, ADR-060 D9) cuando exista.
// Punto de cableado: hoy el loader de AccountPayable es stub (S1) → el form no se
// renderiza con datos y este action no se invoca.
export async function registerPayablePayment(_formData: FormData): Promise<void> {
  await requireCapability("billing:manage");
  // TODO(S1): cargar la cuenta a pagar por id oculto del form, validar contra el saldo y
  // asentar el egreso (con su cheque diferido si corresponde); luego revalidatePath.
  throw new Error("Registro de pago a proveedor pendiente de activación (AccountPayable + egreso D9).");
}
