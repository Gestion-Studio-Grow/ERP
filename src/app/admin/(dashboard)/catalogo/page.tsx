import { getCatalog } from "@/lib/catalog-actions";
import { getCoupons } from "@/lib/coupon-actions";
import { getCurrentTenantRubro } from "@/lib/carniceria/rubro";
import { getInventoryValuation } from "@/lib/inventory/inventory-loader";
import BoxesSection from "./BoxesSection";
import ServicesSection from "./ServicesSection";
import ProfessionalsSection from "./ProfessionalsSection";
import ProductsSection from "./ProductsSection";
import ResourcesSection from "./ResourcesSection";
import CouponsSection from "./CouponsSection";
import AsignacionSection from "./AsignacionSection";
import CortesSection, { type Corte } from "./CortesSection";

export const dynamic = "force-dynamic";

export default async function CatalogoPage() {
  const rubro = await getCurrentTenantRubro();

  // --- Rubro RETAIL / CARNICERÍA: panel de CORTES (no las secciones de spa) ---
  // Un mostrador no tiene boxes/profesionales/servicios; mostrarlos (vacíos) es lo que
  // hacía sentir el panel "genérico". Para retail renderizamos la góndola de cortes con
  // precio por kilo, stock y margen, más los cupones (promos, útiles a cualquier tienda).
  if (rubro.isRetail) {
    const [{ products }, valuation] = await Promise.all([
      getCatalog(),
      getInventoryValuation(),
    ]);
    const costByProduct = new Map(valuation.rows.map((r) => [r.id, r.unitCost ?? null]));
    const cortes: Corte[] = products.map((p) => ({
      id: p.id,
      name: p.name,
      unit: p.unit,
      stock: p.stock,
      lowStockAt: p.lowStockAt,
      active: p.active,
      saleUnit: p.saleUnit === "WEIGHT" ? "WEIGHT" : "UNIT",
      price: p.price ?? null,
      pricePerKg: p.pricePerKg ?? null,
      cost: costByProduct.get(p.id) ?? null,
    }));
    const heading = rubro.rubro?.wording.catalogHeading ?? "Catálogo de cortes";

    return (
      <main className="mx-auto max-w-4xl px-6 py-8">
        <h1 className="text-2xl font-semibold mb-1 text-strong">Catálogo</h1>
        <p className="text-muted mb-8">
          Los cortes y productos de tu mostrador: precio, stock y margen. Lo que ve el cliente en la
          vidriera sale de acá.
        </p>
        <div className="space-y-10">
          <CortesSection cortes={cortes} catalogHeading={heading} />
        </div>
      </main>
    );
  }

  // --- Rubro SERVICIOS (spa) y demás: layout histórico, sin cambios ---
  const [{ boxes, services, professionals, products, categories, resources }, coupons] = await Promise.all([
    getCatalog(),
    getCoupons(),
  ]);

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
