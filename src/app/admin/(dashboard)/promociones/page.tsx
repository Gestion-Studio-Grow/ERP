import { requireApp } from "@/lib/require-app";
import { getCurrentTenantId } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { fmtNumberAR, PageContainer, PageHeader } from "@/components/ui";
import { cuponAgotado, whereCuponesVigentes } from "@/lib/venta-reglas";
import CouponsSection from "../catalogo/CouponsSection";

export const dynamic = "force-dynamic";

// PROMOCIONES Y CUPONES. Los cupones que carga la dueña valen en Vender (el cajero lo escribe
// en «Descuento → Cupón»), en la tienda online (el cliente lo escribe al pedir) y al reservar
// un turno. El máximo de usos se controla en la MISMA transacción que crea la venta o el turno:
// dos compras simultáneas no gastan el último uso las dos.
//
// Reusa la sección de cupones del Catálogo tal cual. En CH los cupones siguen dentro del
// Catálogo: esta app no está en su barra (no lleva `menuDeHoy`).
//
// Las promos 2x1 y por medio de pago van a la ola 9, con las listas de precio.
export default async function PromocionesPage() {
  await requireApp("promociones");
  const tenantId = await getCurrentTenantId();
  const ahora = new Date();
  const [coupons, vigentes] = await Promise.all([
    prisma.coupon.findMany({ where: { tenantId }, orderBy: { createdAt: "desc" } }),
    // El MISMO `where` y la misma cuenta que el número del botón (src/apps/kpis/precios.server.ts).
    prisma.coupon.findMany({ where: whereCuponesVigentes(tenantId, ahora), select: { maxUses: true, usedCount: true } }),
  ]);
  const agotados = vigentes.filter(cuponAgotado).length;

  return (
    <PageContainer>
      <PageHeader
        title="Promociones y cupones"
        description="Cupones de descuento: valen en Vender, en la tienda online y al reservar un turno. El cupón lo cargás vos: su descuento no tiene el tope del descuento a mano de recepción."
      />
      <p className="-mt-2 mb-6 text-sm text-body">
        {vigentes.length === 0
          ? "No hay cupones activos."
          : `${fmtNumberAR(vigentes.length)} ${vigentes.length === 1 ? "cupón activo" : "cupones activos"}`}
        {agotados > 0 && (
          <span className="text-muted">
            {" "}
            ({fmtNumberAR(agotados)} ya {agotados === 1 ? "llegó" : "llegaron"} a su máximo de usos: apagalos o creá uno nuevo).
          </span>
        )}
      </p>
      <CouponsSection coupons={coupons} />
    </PageContainer>
  );
}
