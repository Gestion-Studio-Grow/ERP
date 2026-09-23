// ============================================================================
// PROVEEDOR MAESTRO (D1, ADR-060 Fase C) — validación/normalización PURA.
// ============================================================================
//
// `Supplier` es el prerrequisito (cuello) de compras formal (D6), devoluciones (D4) y
// cuentas a pagar (D2). Acá vive la forma de un alta/edición de proveedor, testeable sin
// DB; el repositorio (`supplier-repo.ts`) persiste lo que esto valida.
//
// CUIT: mismo criterio que el resto del sistema (String de 11 dígitos, sin guiones —
// `Tenant.arcaCuit`/`Invoice.docNro`). Se valida la forma Y el dígito verificador con
// `cuitValido` (src/lib/cuit.ts, el mismo de ARCA): un CUIT con un dígito cambiado es otro
// contribuyente, y la ficha del proveedor es de donde van a salir la deuda y las
// devoluciones. Antes sólo se miraba la forma y "30-71234567-9" (verificador mal) entraba.

import { cuitValido } from "@/lib/cuit";

/** Normaliza un CUIT a 11 dígitos sin separadores, o `null` si no tiene 11 dígitos. PURA. */
export function normalizeTaxId(raw: string | null | undefined): string | null {
  const digits = String(raw ?? "").replace(/\D/g, "");
  return digits.length === 11 ? digits : null;
}

/** Formatea un CUIT normalizado como "XX-XXXXXXXX-X" para mostrar. `null` si no es válido. */
export function formatTaxId(raw: string | null | undefined): string | null {
  const d = normalizeTaxId(raw);
  return d ? `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}` : null;
}

/**
 * Los proveedores activos del negocio: los que se ofrecen para elegir al recibir mercadería,
 * los de la lista de Proveedores y los que cuenta su número en el Inicio. Un solo `where`. PURA.
 */
export function whereProveedoresActivos(tenantId: string) {
  return { tenantId, active: true as const };
}

export interface SupplierInput {
  name: string;
  taxId?: string | null;
  email?: string | null;
  phone?: string | null;
  notes?: string | null;
  active?: boolean;
}

/** Datos ya saneados, listos para persistir (el `taxId` queda normalizado o null). */
export interface NormalizedSupplier {
  name: string;
  taxId: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  active: boolean;
}

export type SupplierValidationError =
  | "NAME_REQUIRED" // la razón social no puede estar vacía
  | "TAXID_INVALID" // vino un CUIT pero no tiene 11 dígitos
  | "TAXID_DV_INVALID"; // tiene 11 dígitos pero el verificador no da: está mal tipeado

export type SupplierValidation =
  | { ok: true; value: NormalizedSupplier }
  | { ok: false; error: SupplierValidationError };

/**
 * Valida y normaliza el input de un proveedor. PURA. Reglas mínimas y estructurales:
 * - `name` obligatorio (trim no vacío).
 * - `taxId` OPCIONAL, pero si viene con contenido debe ser un CUIT de 11 dígitos (si no,
 *   error explícito en vez de guardar basura); un `taxId` vacío/espacios → null (válido).
 * Devuelve el objeto listo para el repositorio (taxId normalizado a dígitos).
 */
export function validateSupplierInput(input: SupplierInput): SupplierValidation {
  const name = String(input.name ?? "").trim();
  if (!name) return { ok: false, error: "NAME_REQUIRED" };

  const rawTax = String(input.taxId ?? "").trim();
  let taxId: string | null = null;
  if (rawTax) {
    taxId = normalizeTaxId(rawTax);
    if (!taxId) return { ok: false, error: "TAXID_INVALID" };
    if (!cuitValido(taxId)) return { ok: false, error: "TAXID_DV_INVALID" };
  }

  return {
    ok: true,
    value: {
      name,
      taxId,
      email: emptyToNull(input.email),
      phone: emptyToNull(input.phone),
      notes: emptyToNull(input.notes),
      active: input.active ?? true,
    },
  };
}

/** El error de validación en palabras, con qué hacer. PURA. */
export function mensajeDeProveedor(e: SupplierValidationError): string {
  switch (e) {
    case "NAME_REQUIRED":
      return "Falta la razón social o el nombre del proveedor.";
    case "TAXID_INVALID":
      return "El CUIT tiene que tener 11 números (con o sin guiones). Si no lo tenés, dejalo vacío.";
    case "TAXID_DV_INVALID":
      return "Ese CUIT no existe: el último número no corresponde. Revisalo en la factura del proveedor.";
  }
}

function emptyToNull(v: string | null | undefined): string | null {
  const s = String(v ?? "").trim();
  return s || null;
}
