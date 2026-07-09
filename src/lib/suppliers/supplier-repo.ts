// ============================================================================
// PROVEEDOR MAESTRO (D1) — repositorio (capa de datos, Prisma). ADR-060 Fase C.
// ============================================================================
//
// Persiste lo que `supplier.ts` valida. Tenant-scoped SIEMPRE (defensa en profundidad:
// el `where`/`data` lleva `tenantId` explícito además de la RLS). La validación/normalización
// es PURA y vive en `./supplier` (testeable sin DB); acá solo se persiste el resultado.
//
// ⚠️ Requiere la migración D1 (tabla `Supplier` + FK en `StockPurchase`) — PREPARADA y SIN
// aplicar a prod (§C · Gate 2). Del borde para afuera, el contrato es `number`/`string`.

import { prisma } from "@/lib/prisma";
import { validateSupplierInput, type SupplierInput } from "./supplier";

/** Crea un proveedor para el tenant. Lanza si el input es inválido (validación pura). */
export async function createSupplier(tenantId: string, input: SupplierInput) {
  const v = validateSupplierInput(input);
  if (!v.ok) throw new Error(`Proveedor inválido: ${v.error}`);
  return prisma.supplier.create({
    data: { tenantId, ...v.value },
  });
}

/** Actualiza un proveedor existente del tenant (scoping por tenantId + id). */
export async function updateSupplier(
  tenantId: string,
  id: string,
  input: SupplierInput,
) {
  const v = validateSupplierInput(input);
  if (!v.ok) throw new Error(`Proveedor inválido: ${v.error}`);
  // updateMany para poder scopear por tenantId (update simple solo acepta unique).
  const res = await prisma.supplier.updateMany({
    where: { id, tenantId },
    data: v.value,
  });
  if (res.count === 0) throw new Error("Proveedor no encontrado para este negocio.");
  return getSupplier(tenantId, id);
}

/** Baja LÓGICA (nunca se borra un proveedor con historial de compras/deuda). */
export async function deactivateSupplier(tenantId: string, id: string) {
  const res = await prisma.supplier.updateMany({
    where: { id, tenantId },
    data: { active: false },
  });
  return res.count > 0;
}

/** Lista los proveedores del tenant (activos primero por default). */
export async function listSuppliers(
  tenantId: string,
  opts: { includeInactive?: boolean } = {},
) {
  return prisma.supplier.findMany({
    where: { tenantId, ...(opts.includeInactive ? {} : { active: true }) },
    orderBy: { name: "asc" },
  });
}

/** Trae un proveedor del tenant por id, o `null`. */
export async function getSupplier(tenantId: string, id: string) {
  return prisma.supplier.findFirst({ where: { id, tenantId } });
}
