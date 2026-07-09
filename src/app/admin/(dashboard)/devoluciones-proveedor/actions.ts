"use server";

import { requireCapability } from "@/lib/authz";

// Registrar una DEVOLUCIÓN a proveedor (D4) → el servicio de S1 asienta el movimiento de
// stock (salida DEVOLUCION_PROVEEDOR) + el crédito en la cuenta a pagar del proveedor.
// Punto de cableado: hoy el loader de compras elegibles es stub (S1), así que el form no
// se renderiza con datos y este action no se invoca. Cuando S1 publique el servicio, se
// valida cada línea (validateReturnLine) y se llama al servicio; luego revalidatePath.
export async function registerReturn(_formData: FormData): Promise<void> {
  await requireCapability("catalog:manage");
  // TODO(S1): parsear líneas (productId/qty) + motivo + compra origen, validar con
  // validateReturnLine (no devolver más de lo comprado) y llamar al servicio de devolución.
  throw new Error("Devolución a proveedor pendiente de activación (servicio D4 de S1).");
}
