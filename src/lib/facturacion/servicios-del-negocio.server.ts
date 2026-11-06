// Los servicios activos del negocio, para los chips de «¿Qué hiciste?» del facturador. Multi-tenant:
// `tenantId` explícito además de RLS; nada atado a un negocio. Sin servicios cargados → lista vacía
// (el facturador queda con texto libre).
import "server-only";
import { tenantTransaction } from "@/lib/rls";
import type { ServicioParaFacturar } from "@/lib/facturacion/facturador-una-pantalla";

/** Tope de chips: más que esto no se lee en un celular. */
const MAX_SERVICIOS = 12;

export async function serviciosParaFacturar(tenantId: string): Promise<ServicioParaFacturar[]> {
  const filas = await tenantTransaction(
    (tx) =>
      tx.service.findMany({
        where: { tenantId, active: true, deletedAt: null },
        select: { name: true, price: true },
        orderBy: { name: "asc" },
        take: MAX_SERVICIOS,
      }),
    { tenantId },
  );
  return filas.map((s) => ({ nombre: s.name, precio: Number(s.price) > 0 ? Number(s.price) : null }));
}
