// ============================================================================
// LECTURAS DE LA CAJA CON LECTOR — el catálogo para el lector y el ticket grabado.
// ============================================================================
//
// No es "use server": las llaman la página (ya pasó por `requireApp`) y la acción de cobrar
// (ya pasó por `requireAppAccion`), con el negocio resuelto. Reciben el cliente por parámetro
// para que los tests de integración las corran contra la base efímera.

import type { Prisma } from "@/generated/prisma/client";
import { ventaDeOrden, type VentaTicket } from "@/app/admin/(dashboard)/vender/reglas-venta";
import { seccionDe } from "./secciones";
import { wherePromosDeLaVenta } from "./promos-de-la-venta";
import type { ProductoDeCaja } from "./lectura";

type Db = Pick<Prisma.TransactionClient, "product" | "order" | "auditLog" | "$queryRaw">;

/**
 * La góndola explícita (`Product.category`) de los productos que la tienen. La columna es de la
 * migración pendiente (prisma/pending-gate2/CarniceriaRubro.sql): se lee con `to_jsonb`, que da
 * NULL si no existe. Tiene que correr ADENTRO de una transacción con el negocio puesto (con RLS,
 * una consulta cruda fuera de ella no ve nada): por eso recibe el `tx`.
 */
export async function gondolasEnTx(tx: Pick<Prisma.TransactionClient, "$queryRaw">, tenantId: string): Promise<Map<string, string>> {
  const filas = await tx.$queryRaw<{ id: string; category: string }[]>`
    SELECT p."id", (to_jsonb(p) ->> 'category') AS "category"
      FROM "Product" p
     WHERE p."tenantId" = ${tenantId} AND p."deletedAt" IS NULL
       AND (to_jsonb(p) ->> 'category') IS NOT NULL`;
  return new Map(filas.map((f) => [f.id, f.category]));
}

/** Los productos que se pueden cobrar (activos, con precio), con su código y su sección. */
export async function productosDeCaja(db: Db, tenantId: string, gondolas: Map<string, string>): Promise<ProductoDeCaja[]> {
  const filas = await db.product.findMany({
    where: { tenantId, deletedAt: null, active: true, OR: [{ price: { not: null } }, { pricePerKg: { not: null } }] },
    orderBy: { name: "asc" },
    select: { id: true, name: true, codigo: true, saleUnit: true, price: true, pricePerKg: true, unit: true },
  });
  return filas.map((p) => ({
    id: p.id,
    name: p.name,
    codigo: p.codigo,
    saleUnit: p.saleUnit === "WEIGHT" ? "WEIGHT" : "UNIT",
    price: p.price,
    pricePerKg: p.pricePerKg,
    seccion: seccionDe({ name: p.name, saleUnit: p.saleUnit, category: gondolas.get(p.id) ?? null }),
    presentacion: p.unit,
  }));
}

/** La venta grabada como la muestra el ticket: con sus cobros (pago mixto) y sus promos. */
export async function ticketDeLaVenta(db: Db, tenantId: string, orderId: string): Promise<VentaTicket | null> {
  const [o, promos] = await Promise.all([
    db.order.findFirst({
      where: { id: orderId, tenantId },
      select: {
        id: true,
        code: true,
        createdAt: true,
        subtotal: true,
        discount: true,
        total: true,
        paymentMethod: true,
        paid: true,
        customerName: true,
        customerPhone: true,
        status: true,
        items: {
          select: { productId: true, name: true, saleUnit: true, quantity: true, unitPrice: true, lineTotal: true },
          orderBy: { id: "asc" },
        },
        collections: { where: { originType: "ORDER" }, select: { method: true, amount: true }, orderBy: { id: "asc" } },
      },
    }),
    db.auditLog.findFirst({ where: wherePromosDeLaVenta(tenantId, orderId), select: { changes: true }, orderBy: { createdAt: "desc" } }),
  ]);
  return o ? ventaDeOrden({ ...o, promos: promos?.changes }) : null;
}
