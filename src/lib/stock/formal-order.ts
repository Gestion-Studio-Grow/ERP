// ============================================================================
// ORDEN FORMAL a proveedor (perfil Empresa, J45/18J) — helpers PUROS.
// ============================================================================
//
// Profundización Empresa de Compras (P1.a del set mínimo, set-minimo-empresa-2026-07-08):
// la pyme compra FORMAL (razón social + CUIT del proveedor + N° de orden de compra),
// el comercio repone a ojo. Es ADITIVO sobre la MISMA pantalla (`/admin/compras`), no
// una pantalla nueva.
//
// ⚠️ SIN cambio de schema (norma: no tocar Neon). Hoy `StockPurchase` solo tiene
// `supplier` (texto libre) + `notes`. La razón social viaja en `supplier`; el CUIT y el
// N° de orden se COMPONEN en `notes` de forma estructurada y legible (lossless, se ve
// tal cual en "Entradas recientes"). Columnas dedicadas (`supplierTaxId`/`orderNumber`,
// aditivas) quedan ELEVADAS AL DUEÑO (§C · Gate 2) para poder filtrar/reportar por ellas
// — NO se ejecutan acá.

/**
 * Normaliza un CUIT argentino a "XX-XXXXXXXX-X". Devuelve `null` si no tiene 11
 * dígitos (validación de forma, no de dígito verificador). PURA.
 */
export function formatCuit(raw: string | null | undefined): string | null {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (digits.length !== 11) return null;
  return `${digits.slice(0, 2)}-${digits.slice(2, 10)}-${digits.slice(10)}`;
}

/**
 * Compone la metadata de la orden formal (N° de orden + CUIT) con la nota libre en un
 * único string `notes`, o `null` si no hay nada. La línea formal va primero (parseable
 * a ojo); la nota libre debajo. PURA — sin efectos, sin depender del perfil.
 *
 * Ej.: `{ orderNumber:"A-0042", cuit:"30712345679", note:"entrega parcial" }`
 *   → `"OC #A-0042 · CUIT 30-71234567-9\nentrega parcial"`.
 */
export function composeFormalNotes(input: {
  orderNumber?: string | null;
  cuit?: string | null;
  note?: string | null;
}): string | null {
  const parts: string[] = [];
  const oc = String(input.orderNumber ?? "").trim();
  if (oc) parts.push(`OC #${oc}`);
  const cuit = formatCuit(input.cuit);
  if (cuit) parts.push(`CUIT ${cuit}`);

  const header = parts.join(" · ");
  const note = String(input.note ?? "").trim();
  if (header && note) return `${header}\n${note}`;
  return header || note || null;
}
