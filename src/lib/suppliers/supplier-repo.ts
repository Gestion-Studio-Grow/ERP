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

/** Cuántas compras se listan en la ficha; los TOTALES son de todas (aggregate), no de éstas. */
export const COMPRAS_EN_LA_FICHA = 30;
/** Cuántas devoluciones se listan en la ficha; el total devuelto es de todas. */
export const DEVOLUCIONES_EN_LA_FICHA = 50;

/**
 * Lo devuelto a costo, a partir de los movimientos AGRUPADOS por costo unitario (un `groupBy`:
 * la base suma, no la pantalla). El registro guarda la cantidad firmada (negativa en una
 * devolución): se toma la magnitud. Un grupo sin costo no suma pesos. PURA.
 */
export function totalDevuelto(grupos: readonly { unitCost: number | null; _sum: { qty: number | null }; _count: { _all: number } }[]): {
  pesos: number;
  movimientos: number;
} {
  let pesos = 0;
  let movimientos = 0;
  for (const g of grupos) {
    movimientos += g._count._all;
    if (g.unitCost && g.unitCost > 0) pesos += Math.abs(g._sum.qty ?? 0) * g.unitCost;
  }
  return { pesos: Math.round(pesos * 100) / 100, movimientos };
}

/**
 * LA FICHA: el proveedor, sus compras, su deuda abierta y lo que se le devolvió. Una lectura
 * por cosa, todas del negocio. La deuda sale de Cuentas a pagar (`listPayables`); si esa tabla
 * todavía no está en esta base, la ficha lo dice en vez de caerse.
 *
 * LOS TOTALES SALEN DE UN AGGREGATE (QA de la integración de la ola 2): "Compras" contaba las
 * filas de una lista con tope y "Devuelto" sumaba sólo las devoluciones listadas, así que con
 * más de 30 compras o 50 devoluciones la ficha mentía por abajo. Ahora cuenta y suma la base
 * (`aggregate` / `groupBy`); las listas siguen acotadas y la pantalla dice "las últimas N".
 */
export async function getFichaProveedor(tenantId: string, id: string) {
  const proveedor = await getSupplier(tenantId, id);
  if (!proveedor) return null;

  const deEsteProveedor = { tenantId, supplierId: id };
  const [compras, totales, idsDeCompras, deuda] = await Promise.all([
    prisma.stockPurchase.findMany({
      where: deEsteProveedor,
      orderBy: { createdAt: "desc" },
      take: COMPRAS_EN_LA_FICHA,
      select: { id: true, code: true, kind: true, totalCost: true, createdAt: true, _count: { select: { items: true } } },
    }),
    prisma.stockPurchase.aggregate({ where: deEsteProveedor, _count: { _all: true }, _sum: { totalCost: true } }),
    // Las devoluciones se ligan a la compra por un rastro sin clave foránea (`purchaseId` del
    // registro de stock): hace falta saber cuáles son SUS compras para buscarlas. Sólo ids.
    prisma.stockPurchase.findMany({ where: deEsteProveedor, select: { id: true, code: true } }),
    leerDeuda(tenantId, id),
  ]);
  const codigoDeCompra = new Map(idsDeCompras.map((c) => [c.id, c.code]));
  const deSusCompras = { tenantId, type: "DEVOLUCION_PROVEEDOR" as const, purchaseId: { in: idsDeCompras.map((c) => c.id) } };
  const [devoluciones, grupos] = idsDeCompras.length
    ? await Promise.all([
        prisma.stockMovement.findMany({
          where: deSusCompras,
          orderBy: { createdAt: "desc" },
          take: DEVOLUCIONES_EN_LA_FICHA,
          select: { id: true, qty: true, unitCost: true, reason: true, createdAt: true, purchaseId: true, product: { select: { name: true, unit: true } } },
        }),
        prisma.stockMovement.groupBy({ by: ["unitCost"], where: deSusCompras, _sum: { qty: true }, _count: { _all: true } }),
      ])
    : [[], []];
  const devuelto = totalDevuelto(grupos);
  return {
    proveedor,
    compras,
    totalDeCompras: totales._count._all,
    comprado: Math.round((totales._sum.totalCost ?? 0) * 100) / 100,
    deuda,
    devoluciones,
    totalDeDevoluciones: devuelto.movimientos,
    devuelto: devuelto.pesos,
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
