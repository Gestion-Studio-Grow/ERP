import Link from "next/link";
import { requireApp } from "@/lib/require-app";
import { cuentasCorrientesEnabled } from "@/lib/settlement/asiento-libro";
import { puedeAbrirApp } from "./puede-abrir";
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
import { teclasDelMostrador, topeDeDescuento, topeDePrecioAMano } from "./reglas-venta";
import { Suspense } from "react";
import { disenoNuevo } from "@/lib/diseno/diseno.server";
import { getCurrentTenantRubro } from "@/lib/carniceria/rubro";
import { cargarKpi } from "@/apps/kpis/index.server";
import { LineaDeEstado } from "@/components/ui";
import type { Role } from "@/lib/capabilities";

/**
 * Diseño nuevo: arriba del ticket, cómo está la caja y cuánto se vendió hoy (los mismos números del
 * Inicio, cacheados). Con la caja cerrada, dice lo que de verdad pasa: se puede cobrar en efectivo, y
 * esa plata se anota en el libro del día sin turno, fuera del arqueo de un cajero
 * (caja/cash-sale.ts). El cartel no prohíbe lo que el sistema deja hacer.
 */
async function EstadoDelMostrador({ role }: { role: Role }) {
  const [caja, vender] = await Promise.all([cargarKpi("caja-del-dia", role), cargarKpi("vender", role)]);
  const datos: React.ReactNode[] = [];
  if (caja?.estado === "ok") {
    datos.push(
      caja.valor === "Cerrada" ? (
        <span key="caja">
          <strong>Caja cerrada</strong>: lo que cobres en efectivo se anota en el libro del día, sin turno ·{" "}
          <Link href="/admin/caja" className="font-semibold text-accent-ink underline">
            Abrir la caja
          </Link>
        </span>
      ) : (
        <strong key="caja">{`Caja ${caja.valor.toLowerCase()}${caja.detalle ? ` ${caja.detalle}` : ""}`}</strong>
      ),
    );
  }
  if (vender?.estado === "ok") datos.push(`${vender.valor} ${vender.detalle ?? ""}`.trim());
  return <LineaDeEstado datos={datos} className="mb-4" />;
}

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
  const [datos, stockSnap, identidad, puedeCuentas, puedeFacturar, nuevo, rubro] = await Promise.all([
    cargarVender(tenantId, todayInBusinessTz()),
    getPosStockSnapshot(),
    getTenantIdentity(),
    // «A cuenta» y «Facturar» se ofrecen con la MISMA regla que exige su action: la app de
    // Cuentas a cobrar / Facturación para este negocio y este rol (módulo, capability, rubro).
    puedeAbrirApp("cuentas-a-cobrar"),
    puedeAbrirApp("facturacion"),
    // Diseño nuevo: la misma lectura de interruptores del layout (cacheada), y el rubro (cacheado,
    // largado en la tanda del layout) para las palabras del buscador («corte» en una carnicería).
    disenoNuevo(),
    getCurrentTenantRubro(),
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

  const teclas = teclasDelMostrador(
    datos.rapidos,
    datos.products.map((p) => p.id),
  );

  const formProductos = (conVendedor: boolean) => (
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
        // Diseño nuevo: el primer día (sin ventas) las teclas se completan con el catálogo.
        // Apagado, igual que hoy: sólo los más vendidos.
        rapidos={nuevo ? teclas.ids : datos.rapidos}
        rotuloRapidos={nuevo ? teclas.rotulo : undefined}
        negocio={datos.negocio}
        topeDescuentoPct={topeDeDescuento(user.role)}
        pedidoInicial={modo === "pedido"}
        // Detrás del flag de cuentas corrientes: sin el asiento del cobro del fiado en el
        // libro, una deuda nacida en el mostrador no se podría cobrar bien.
        aCuentaDisponible={puedeCuentas && cuentasCorrientesEnabled()}
        puedeFacturar={puedeFacturar}
        topePrecioAMano={topeDePrecioAMano(user.role)}
        // Separa, en el almacén de la pestaña, el cobro sin confirmar de cada negocio.
        negocioId={tenantId}
        // La duda guardada de otra persona no se restaura en esta pestaña.
        usuarioId={user.id}
        {...(conVendedor ? { vendedor: user.name, sustantivo: rubro.rubro?.wording.itemNoun ?? "producto" } : {})}
      />
    </div>
  );

  // DISEÑO NUEVO («Renglón»): el ticket que crece. Sin encabezado ni párrafo (el nombre de la app ya
  // está en la cabecera y en la barra del celular; «Pedidos» y «Ventas del día» son las pestañas del
  // espacio); arriba sólo la línea de la caja, que es lo que cambia cómo se cobra en efectivo.
  if (nuevo) {
    return (
      <main data-ui="pagina" className="mx-auto w-full px-4 py-6">
        <h1 className="sr-only">Vender</h1>
        <Suspense fallback={<p data-ui="linea-estado" aria-hidden>&nbsp;</p>}>
          <EstadoDelMostrador role={user.role} />
        </Suspense>
        <MostradorTabs
          viewer={{ role: user.role, professionalId: user.professionalId }}
          products={[]}
          stockById={{}}
          professionals={professionals}
          conServicios={conServicios}
          formProductos={formProductos(true)}
        />
      </main>
    );
  }

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
        formProductos={formProductos(false)}
      />
    </PageContainer>
  );
}
