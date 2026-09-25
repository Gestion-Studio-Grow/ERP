import Link from "next/link";
import { getCatalog } from "@/lib/catalog-actions";
import { getCoupons } from "@/lib/coupon-actions";
import { getCurrentTenantRubro } from "@/lib/carniceria/rubro";
import { getCurrentTenantId } from "@/lib/tenant";
import { requireApp } from "@/lib/require-app";
import { roleHasCapability } from "@/lib/capabilities";
import { getNegocioApps } from "@/apps/contexto.server";
import { appPermitida } from "@/apps/visibles";
import { appPorId } from "@/apps/registro";
import { cargarCostosDelCatalogo, cargarGondolas } from "@/lib/catalogo/precios-lectura";
import { resumirCatalogo } from "@/lib/catalogo/resumen";
import { hrefMovimientos } from "@/lib/inventario/movimientos";
import { PageHeader, buttonClasses, fmtNumberAR } from "@/components/ui";
import { disenoNuevo } from "@/lib/diseno/diseno.server";
import BoxesSection from "./BoxesSection";
import ServicesSection from "./ServicesSection";
import ProfessionalsSection from "./ProfessionalsSection";
import ProductsSection from "./ProductsSection";
import ResourcesSection from "./ResourcesSection";
import CouponsSection from "./CouponsSection";
import AsignacionSection from "./AsignacionSection";
import CortesSection, { type Corte } from "./CortesSection";
import PlanillaCortes from "./PlanillaCortes";
import { vocabularioDelRubro } from "./vocabulario";
import CatalogoRenglon from "./CatalogoRenglon";
import CatalogoServiciosPagina from "./CatalogoServiciosPagina";
import { leerEditar, leerParametrosCatalogo, paginaDelCatalogo } from "./lista-core";

export const dynamic = "force-dynamic";

type Sp = Record<string, string | string[] | undefined>;

export default async function CatalogoPage({ searchParams }: { searchParams: Promise<Sp> }) {
  // Guardia de la app (ADR-098): una app oculta no es una app protegida.
  const user = await requireApp("catalogo");
  const rubro = await getCurrentTenantRubro();

  // --- Rubro RETAIL / CARNICERÍA: panel de CORTES (no las secciones de spa) ---
  // Un mostrador no tiene boxes/profesionales/servicios; mostrarlos (vacíos) es lo que
  // hacía sentir el panel "genérico". Para retail renderizamos la góndola de cortes con
  // precio por kilo, stock y margen, más los cupones (promos, útiles a cualquier tienda).
  if (rubro.isRetail) {
    const tenantId = await getCurrentTenantId();
    // Los costos, sólo con costs:read (hoy la dueña, que es la única que abre el catálogo).
    const conCostos = roleHasCapability(user.role, "costs:read");
    const [{ products }, costos, gondolas, negocio] = await Promise.all([
      getCatalog(),
      conCostos ? cargarCostosDelCatalogo(tenantId) : null,
      cargarGondolas(tenantId),
      getNegocioApps(user.role),
    ]);
    // El enlace a los movimientos de cada corte, sólo si quien mira puede abrir Movimientos.
    const verMovimientos = appPermitida(appPorId("movimientos"), negocio);
    const cortes: Corte[] = products.map((p) => ({
      id: p.id,
      ...(verMovimientos ? { movimientos: hrefMovimientos({ producto: p.id }) } : {}),
      name: p.name,
      unit: p.unit,
      stock: p.stock,
      lowStockAt: p.lowStockAt,
      active: p.active,
      saleUnit: p.saleUnit === "WEIGHT" ? "WEIGHT" : "UNIT",
      price: p.price ?? null,
      pricePerKg: p.pricePerKg ?? null,
      // Costo VIGENTE (src/lib/stock/costo.ts), el mismo de Stock y Margen: el cargado a mano
      // si lo hay y, si no, el del último ingreso con costo (compra, reposición o despiece).
      cost: costos?.vigentes[p.id] ?? null,
      // El cargado a mano: es el que edita el formulario (ver `cargarCostosDelCatalogo`).
      costoCargado: costos?.cargados.get(p.id) ?? null,
      // Góndola explícita (Product.category) si está; null → CortesSection deriva del nombre.
      category: gondolas.get(p.id) ?? null,
      trackStock: p.trackStock,
    }));
    const heading = rubro.rubro?.wording.catalogHeading ?? "Catálogo de cortes";
    // Mismo resumen que el número del botón (src/apps/kpis/precios.server.ts): activos y no
    // borrados (`getCatalog` ya trae sólo los no borrados).
    const resumen = resumirCatalogo(
      products.filter((p) => p.active),
      costos?.vigentes ?? {},
    );
    const ve = {
      precios: appPermitida(appPorId("actualizar-precios"), negocio),
      etiquetas: appPermitida(appPorId("etiquetas-de-precio"), negocio),
    };

    // «Diseño nuevo» (Renglón): la tabla densa paginada en el servidor, con los MISMOS cortes de
    // arriba (cero consultas nuevas). Apagado, el catálogo de siempre.
    if (await disenoNuevo()) {
      const sp = await searchParams;
      const vocabulario = vocabularioDelRubro(rubro.rubro);
      const p = leerParametrosCatalogo(sp);
      const pagina = paginaDelCatalogo(cortes, p, vocabulario.carniceria);
      const idEditar = leerEditar(sp);
      const editando = idEditar ? (cortes.find((c) => c.id === idEditar) ?? null) : null;
      const agregar = sp.agregar === "1";
      return (
        <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
          {/* En el celular: el título y «Agregar» en una fila, sin la bajada (las vistas de la
              lista ya dicen cuántos hay sin precio); lo demás va al «⋯» de la lista. */}
          <PageHeader
            title="Catálogo"
            className="max-sm:mb-4 max-sm:flex-row max-sm:items-center max-sm:justify-between max-sm:[&_[data-parte=bajada]]:hidden"
            description={
              resumen.activos > 0
                ? `${fmtNumberAR(resumen.activos)} a la venta · ${fmtNumberAR(resumen.sinPrecio)} sin precio${conCostos ? ` · ${fmtNumberAR(resumen.sinCosto)} sin costo` : ""}`
                : undefined
            }
            actions={
              <>
                <Link href="/admin/catalogo?agregar=1" scroll={false} className={buttonClasses("solid", "md")}>
                  Agregar {vocabulario.carniceria ? "corte" : vocabulario.uno}
                </Link>
                {ve.precios && (
                  <Link href="/admin/catalogo/precios" className={buttonClasses("outline", "md") + " max-sm:hidden"}>
                    Actualizar precios
                  </Link>
                )}
                {ve.etiquetas && (
                  <Link href="/admin/catalogo/etiquetas" className={buttonClasses("ghost", "md") + " max-sm:hidden"}>
                    Etiquetas
                  </Link>
                )}
              </>
            }
          />
          <CatalogoRenglon
            filas={pagina.filas}
            coinciden={pagina.coinciden}
            conBusqueda={pagina.conBusqueda}
            total={cortes.length}
            pagina={pagina.pagina}
            paginas={pagina.paginas}
            porVista={pagina.porVista}
            q={p.q}
            vista={p.vista}
            conCostos={conCostos}
            vocabulario={vocabulario}
            puedeAumentar={ve.precios}
            editando={editando}
            agregando={agregar && editando === null}
            masAcciones={[
              ...(ve.precios ? [{ etiqueta: "Actualizar precios", href: "/admin/catalogo/precios" }] : []),
              ...(ve.etiquetas ? [{ etiqueta: "Etiquetas", href: "/admin/catalogo/etiquetas" }] : []),
            ]}
          />
          <div className="mt-10">
            <PlanillaCortes />
          </div>
        </main>
      );
    }

    return (
      <main className="mx-auto max-w-4xl px-4 sm:px-6 py-6 sm:py-8">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold mb-1 text-strong">Catálogo</h1>
            <p className="text-muted">
              Los cortes y productos de tu mostrador: precio, stock y margen. Lo que ve el cliente en la
              vidriera sale de acá.
            </p>
            {resumen.activos > 0 && (
              <p className="mt-2 text-sm text-body">
                <span className={resumen.sinPrecio > 0 ? "font-medium text-danger" : undefined}>
                  {fmtNumberAR(resumen.sinPrecio)} sin precio
                </span>
                {conCostos && (
                  <>
                    {" · "}
                    <span className={resumen.sinCosto > 0 ? "font-medium text-strong" : undefined}>
                      {fmtNumberAR(resumen.sinCosto)} sin costo
                    </span>
                  </>
                )}
                <span className="text-muted"> de {fmtNumberAR(resumen.activos)} activos</span>
              </p>
            )}
          </div>
          {(ve.precios || ve.etiquetas) && (
            <div className="flex shrink-0 flex-wrap gap-2">
              {ve.precios && (
                <Link href="/admin/catalogo/precios" className={buttonClasses("solid", "md")}>
                  Actualizar precios
                </Link>
              )}
              {ve.etiquetas && (
                <Link href="/admin/catalogo/etiquetas" className={buttonClasses("outline", "md")}>
                  Etiquetas
                </Link>
              )}
            </div>
          )}
        </div>
        <div className="space-y-10">
          {/* Planilla (bajar/subir en Excel): sólo acá, en la rama retail. CH no la ve. */}
          <PlanillaCortes />
          <CortesSection cortes={cortes} catalogHeading={heading} conCostos={conCostos} vocabulario={vocabularioDelRubro(rubro.rubro)} />
        </div>
      </main>
    );
  }

  // --- Rubro SERVICIOS (spa) y demás: layout histórico, sin cambios ---
  const [{ boxes, services, professionals, products, categories, resources }, coupons, conDisenoNuevo] = await Promise.all([
    getCatalog(),
    getCoupons(),
    disenoNuevo(),
  ]);

  // «Diseño nuevo» (Renglón): una pestaña por parte del catálogo y un renglón por ítem, con los
  // MISMOS datos de arriba (cero consultas nuevas). Apagado, CH sigue viendo el catálogo de siempre.
  if (conDisenoNuevo) {
    return (
      <CatalogoServiciosPagina
        sp={await searchParams}
        datos={{ boxes, services, professionals, products, categories, resources, coupons }}
      />
    );
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-8">
      <h1 className="text-2xl font-semibold mb-1">Catálogo</h1>
      <p className="text-muted mb-8">
        Profesionales, servicios, boxes y stock disponibles para la operación.
      </p>

      <div className="space-y-10">
        <BoxesSection boxes={boxes} />
        <ServicesSection
          services={services}
          products={products}
          categories={categories}
          resources={resources}
        />
        <ResourcesSection resources={resources} />
        <ProductsSection products={products} />
        <ProfessionalsSection professionals={professionals} boxes={boxes} services={services} />
        <AsignacionSection
          services={services.map((s) => ({
            id: s.id,
            name: s.name,
            active: s.active,
            categoryName: s.category?.name ?? null,
          }))}
          professionals={professionals.map((p) => ({
            id: p.id,
            name: p.name,
            active: p.active,
            serviceIds: p.services.map((s) => s.id),
          }))}
        />
        <CouponsSection coupons={coupons} />
      </div>
    </main>
  );
}
