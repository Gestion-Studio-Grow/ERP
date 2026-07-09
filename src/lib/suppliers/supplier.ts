// ============================================================================
// PROVEEDOR MAESTRO (D1, ADR-060 Fase C) — validación/normalización PURA.
// ============================================================================
//
// `Supplier` es el prerrequisito (cuello) de compras formal (D6), devoluciones (D4) y
// cuentas a pagar (D2). Acá vive la forma de un alta/edición de proveedor, testeable sin
// DB; el repositorio (`supplier-repo.ts`) persiste lo que esto valida.
//
// CUIT: mismo criterio que el resto del sistema (String de 11 dígitos, sin guiones —
// `Tenant.arcaCuit`/`Invoice.docNro`). Se valida FORMA (11 dígitos), no dígito verificador.

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
  | "TAXID_INVALID"; // vino un CUIT pero no tiene 11 dígitos

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

function emptyToNull(v: string | null | undefined): string | null {
  const s = String(v ?? "").trim();
  return s || null;
}
