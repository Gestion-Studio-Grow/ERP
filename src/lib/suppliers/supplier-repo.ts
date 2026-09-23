// ============================================================================
// PROVEEDOR MAESTRO (D1) — repositorio (capa de datos, Prisma). ADR-060 Fase C.
// ============================================================================
//
// Persiste lo que `supplier.ts` valida y lee la ficha. Tenant-scoped SIEMPRE (defensa en
// profundidad: el `where`/`data` lleva `tenantId` explícito además de la RLS). La
// validación/normalización es PURA y vive en `./supplier`; acá solo se persiste el resultado.
//
// NO lleva "use server": recibe el `tenantId` por parámetro, así que nunca puede ser un
// endpoint. Lo llaman la página y las acciones de /admin/proveedores, que resuelven el negocio
// del request.

import { prisma } from "@/lib/prisma";
import { listPayables, type PayableListItem } from "@/lib/debts/payable-repo";
import { mensajeDeProveedor, validateSupplierInput, whereProveedoresActivos, type SupplierInput } from "./supplier";

/** Un error de carga que se le puede mostrar a la persona tal cual. */
export class ProveedorInvalido extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "ProveedorInvalido";
  }
}

// El @@unique([tenantId, taxId]) de Supplier es el árbitro: dos proveedores con el mismo CUIT
// en el mismo negocio son el mismo proveedor cargado dos veces.
function traducirError(err: unknown): never {
  if ((err as { code?: string })?.code === "P2002") {
    throw new ProveedorInvalido("Ya hay un proveedor con ese CUIT. Buscalo en la lista (puede estar dado de baja).");
  }
  throw err;
}

/** Crea un proveedor para el tenant. Lanza `ProveedorInvalido` si el input no sirve. */
export async function createSupplier(tenantId: string, input: SupplierInput) {
  const v = validateSupplierInput(input);
  if (!v.ok) throw new ProveedorInvalido(mensajeDeProveedor(v.error));
  try {
    return await prisma.supplier.create({
      data: { tenantId, ...v.value },
      select: { id: true, name: true },
    });
  } catch (err) {
    traducirError(err);
  }
}

/** Actualiza un proveedor existente del tenant (scoping por tenantId + id). */
export async function updateSupplier(tenantId: string, id: string, input: SupplierInput) {
  const v = validateSupplierInput(input);
  if (!v.ok) throw new ProveedorInvalido(mensajeDeProveedor(v.error));
  try {
    // updateMany para poder scopear por tenantId (update simple solo acepta unique).
    const res = await prisma.supplier.updateMany({
      where: { id, tenantId },
      data: v.value,
    });
    if (res.count === 0) throw new ProveedorInvalido("Ese proveedor no es de este negocio o ya no existe.");
  } catch (err) {
    if (err instanceof ProveedorInvalido) throw err;
    traducirError(err);
  }
  return getSupplier(tenantId, id);
}

/**
 * Baja o alta LÓGICA. Nunca se borra un proveedor: tiene compras, deuda y devoluciones que
 * tienen que seguir diciendo a quién se le compró. Dado de baja, deja de aparecer para elegir
 * en Recibir mercadería.
 */
export async function setSupplierActive(tenantId: string, id: string, active: boolean) {
  const res = await prisma.supplier.updateMany({
    where: { id, tenantId },
    data: { active },
  });
  return res.count > 0;
}

/** Lista los proveedores del tenant (activos primero), con cuántas compras tiene cada uno. */
export async function listSuppliers(tenantId: string, opts: { includeInactive?: boolean } = {}) {
  return prisma.supplier.findMany({
    where: opts.includeInactive ? { tenantId } : whereProveedoresActivos(tenantId),
    orderBy: [{ active: "desc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      taxId: true,
      email: true,
      phone: true,
      active: true,
      _count: { select: { purchases: true } },
    },
  });
}

/** Trae un proveedor del tenant por id, o `null`. */
export async function getSupplier(tenantId: string, id: string) {
  return prisma.supplier.findFirst({ where: { id, tenantId } });
}

/** La deuda con este proveedor, o el motivo por el que no se puede leer. */
export type DeudaDeProveedor = { ok: true; abiertas: PayableListItem[]; saldo: number } | { ok: false; motivo: string };

/**
 * LA FICHA: el proveedor, sus compras, su deuda abierta y lo que se le devolvió. Una lectura
 * por cosa, todas del negocio. La deuda sale de Cuentas a pagar (`listPayables`); si esa tabla
 * todavía no está en esta base, la ficha lo dice en vez de caerse.
 */
export async function getFichaProveedor(tenantId: string, id: string) {
  const proveedor = await getSupplier(tenantId, id);
  if (!proveedor) return null;

  const [compras, todasLasCompras, deuda] = await Promise.all([
    prisma.stockPurchase.findMany({
      where: { tenantId, supplierId: id },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: { id: true, code: true, kind: true, totalCost: true, createdAt: true, _count: { select: { items: true } } },
    }),
    // Las devoluciones se buscan contra TODAS sus compras, no sólo las 30 que se listan.
    prisma.stockPurchase.findMany({ where: { tenantId, supplierId: id }, select: { id: true, code: true } }),
    leerDeuda(tenantId, id),
  ]);
  const codigoDeCompra = new Map(todasLasCompras.map((c) => [c.id, c.code]));
  // Todas las devoluciones (son pocas por proveedor): el total "Devuelto" es de TODAS, y la
  // lista muestra las últimas 50. Antes el total sumaba sólo las 50 que se listaban.
  const todasLasDevoluciones = todasLasCompras.length
    ? await prisma.stockMovement.findMany({
        where: { tenantId, type: "DEVOLUCION_PROVEEDOR", purchaseId: { in: todasLasCompras.map((c) => c.id) } },
        orderBy: { createdAt: "desc" },
        select: { id: true, qty: true, unitCost: true, reason: true, createdAt: true, purchaseId: true, product: { select: { name: true, unit: true } } },
      })
    : [];
  const devuelto = Math.round(todasLasDevoluciones.reduce((s, m) => s + (m.unitCost ? Math.abs(m.qty) * m.unitCost : 0), 0) * 100) / 100;
  return {
    proveedor,
    compras,
    totalDeCompras: todasLasCompras.length,
    deuda,
    devoluciones: todasLasDevoluciones.slice(0, 50),
    totalDeDevoluciones: todasLasDevoluciones.length,
    devuelto,
    codigoDeCompra,
  };
}

async function leerDeuda(tenantId: string, supplierId: string): Promise<DeudaDeProveedor> {
  try {
    const abiertas = (await listPayables(tenantId)).filter((p) => p.supplierId === supplierId);
    return { ok: true, abiertas, saldo: Math.round(abiertas.reduce((s, p) => s + p.balance, 0) * 100) / 100 };
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code === "P2021" || code === "P2022") {
      return { ok: false, motivo: "Las cuentas a pagar todavía no están habilitadas en este negocio." };
    }
    throw err;
  }
}
