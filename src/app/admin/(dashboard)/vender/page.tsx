import Link from "next/link";
import { requireApp } from "@/lib/require-app";
import { getCurrentTenantId } from "@/lib/tenant";
import { todayInBusinessTz } from "@/lib/datetime";
import { roleHasCapability } from "@/lib/capabilities";
import { getTenantIdentity } from "@/lib/identidad-rubro";
import { getPosStockSnapshot } from "@/lib/stock/pos-stock";
import { posEmptyState } from "@/lib/stock/pos-stock-rules";
import { getProfessionalsWithServices } from "@/lib/actions";
import { ButtonLink, PageContainer, PageHeader, buttonClasses } from "@/components/ui";
import MostradorTabs from "../pedidos/MostradorTabs";
import VenderForm from "./VenderForm";
import { cargarVender } from "./datos";
import { topeDeDescuento } from "./reglas-venta";

export const dynamic = "force-dynamic";

// VENDER — el mostrador en su propia pantalla (antes era la solapa de arriba de Pedidos).
//
// En CH la solapa de /admin/pedidos queda igual hasta que el dueño apruebe el modelo nuevo:
// esta pantalla existe para todos, pero sólo se ofrece desde el Inicio por apps. La guardia es
// `requireApp("vender")` (rol, módulo pos, rubro): esconder la app no la protegería.
export default async function VenderPage({ searchParams }: { searchParams: Promise<{ modo?: string | string[] }> }) {
  const user = await requireApp("vender");
  const { modo } = await searchParams;
  const tenantId = await getCurrentTenantId();
  const [datos, stockSnap, identidad] = await Promise.all([
    cargarVender(tenantId, todayInBusinessTz()),
    getPosStockSnapshot(),
    getTenantIdentity(),
  ]);
  // Los servicios se cobran creando un turno (ver MostradorTabs): sólo en un negocio de
  // servicios y sólo para quien puede dar turnos. En un comercio no hay solapa de Servicios.
  const conServicios = !identidad.isRetail;
  const professionals =
    conServicios && roleHasCapability(user.role, "agenda:manage") ? await getProfessionalsWithServices() : [];
  // Sin ningún producto con precio, el aviso dice por qué y qué hacer, pero el formulario
  // SIGUE: «Precio a mano» es justamente para cobrar lo que no tiene precio cargado. Antes el
  // aviso reemplazaba al formulario y la venta se perdía igual.
  const sinPrecios =
    datos.products.length === 0
      ? posEmptyState({ activeProducts: stockSnap.activeProducts, canManageCatalog: stockSnap.canManageCatalog })
      : null;

  return (
    <PageContainer>
      <PageHeader
        title="Vender"
        description="Buscá el producto o tocá uno de los más vendidos, cargá el peso o la cantidad, elegí cómo pagó y cobrá."
        actions={
          <>
            <Link href="/admin/pedidos" className={buttonClasses("outline", "md")}>
              Pedidos para preparar
            </Link>
            <Link href="/admin/ventas" className={buttonClasses("outline", "md")}>
              Ventas del día
            </Link>
          </>
        }
      />
      <MostradorTabs
        viewer={{ role: user.role, professionalId: user.professionalId }}
        // El formulario de productos es el de Vender (abajo): el de la bandeja no se usa, así
        // que no se le mandan los productos dos veces al navegador.
        products={[]}
        stockById={{}}
        professionals={professionals}
        conServicios={conServicios}
        formProductos={
          <div className="space-y-4">
            {sinPrecios && (
              <div role="status" className="rounded-lg border border-warning/40 bg-warning-soft/40 p-3 text-sm">
                <p className="font-medium text-strong">{sinPrecios.title}</p>
                <p className="mt-1 text-body">
                  {sinPrecios.description} Mientras tanto, lo que haya que cobrar se carga con «Precio a
                  mano», con su motivo.
                </p>
                {sinPrecios.linkToCatalog && (
                  <ButtonLink href="/admin/catalogo#productos" variant="outline" className="mt-2">
                    Ir al catálogo a cargar precios
                  </ButtonLink>
                )}
              </div>
            )}
            <VenderForm
              products={datos.products}
              stockById={stockSnap.stockById}
              rapidos={datos.rapidos}
              negocio={datos.negocio}
              topeDescuentoPct={topeDeDescuento(user.role)}
              pedidoInicial={modo === "pedido"}
            />
          </div>
        }
      />
    </PageContainer>
  );
}
