import { requireApp } from "@/lib/require-app";
import { getCurrentTenantId } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import {
  fmtNumberAR,
  LineaDeEstado,
  PageContainer,
  PageHeader,
  buttonClasses,
} from "@/components/ui";
import { disenoNuevo } from "@/lib/diseno/diseno.server";
import { CuponesRenglon } from "../catalogo/CatalogoServiciosRenglon";
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
export default async function PromocionesPage({
  searchParams,
}: {
  searchParams: Promise<{ agregar?: string | string[] }>;
}) {
  await requireApp("promociones");
  const [{ agregar }, nuevo] = await Promise.all([searchParams, disenoNuevo()]);
  const tenantId = await getCurrentTenantId();
  const ahora = new Date();
  const [coupons, vigentes] = await Promise.all([
    prisma.coupon.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
    }),
    // El MISMO `where` y la misma cuenta que el número del botón (src/apps/kpis/precios.server.ts).
    prisma.coupon.findMany({
      where: whereCuponesVigentes(tenantId, ahora),
      select: { maxUses: true, usedCount: true },
    }),
  ]);
  const agotados = vigentes.filter(cuponAgotado).length;

  // DISEÑO NUEVO («Renglón»): un renglón por cupón (código, descuento, usos, vencimiento), la
  // tecla Pausar/Activar, Eliminar en el ⋯ con confirmación y el alta en un cajón. Los mismos
  // cupones y las mismas actions (coupon-actions). Apagado, lo de abajo tal cual.
  if (nuevo) {
    return (
      <main
        data-ui="pagina"
        className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8"
      >
        <PageHeader
          title="Promociones y cupones"
          actions={
            <Link
              href="/admin/promociones?agregar=1"
              scroll={false}
              className={buttonClasses("solid", "md")}
            >
              Crear cupón
            </Link>
          }
        />
        <LineaDeEstado
          className="-mt-2 mb-4"
          datos={[
            <strong key="v">
              {vigentes.length === 1
                ? "1 activo"
                : `${fmtNumberAR(vigentes.length)} activos`}
            </strong>,
            agotados > 0
              ? `${fmtNumberAR(agotados)} ${agotados === 1 ? "llegó" : "llegaron"} al máximo de usos`
              : null,
            "valen en Vender, en la tienda online y en los turnos",
          ]}
        />
        <div className="mt-6">
          <CuponesRenglon
            cupones={coupons}
            agregar={agregar === "1"}
            vacio="Todavía no hay cupones. Creá el primero con su código, el descuento y, si querés, hasta cuándo vale y cuántas veces se puede usar."
          />
        </div>
      </main>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title="Promociones y cupones"
        description="Cupones de descuento: valen en Vender, en la tienda online y al reservar un turno. El cupón lo cargás vos: su descuento no tiene el tope del descuento a mano de recepción."
      />
      {/* Sin ningún cupón, el vacío de abajo ya dice qué hacer. */}
      {coupons.length > 0 && (
        <p className="-mt-2 mb-6 text-sm text-body">
          {vigentes.length === 0
            ? "No hay cupones activos."
            : `${fmtNumberAR(vigentes.length)} ${vigentes.length === 1 ? "cupón activo" : "cupones activos"}`}
          {agotados > 0 && (
            <span className="text-muted">
              {" "}
              ({fmtNumberAR(agotados)} ya{" "}
              {agotados === 1 ? "llegó" : "llegaron"} a su máximo de usos:
              apagalos o creá uno nuevo).
            </span>
          )}
        </p>
      )}
      <CouponsSection coupons={coupons} enPromociones />
    </PageContainer>
  );
}
