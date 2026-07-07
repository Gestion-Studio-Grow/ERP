import { getCatalog } from "@/lib/catalog-actions";
import { getCoupons } from "@/lib/coupon-actions";
import BoxesSection from "./BoxesSection";
import ServicesSection from "./ServicesSection";
import ProfessionalsSection from "./ProfessionalsSection";
import ProductsSection from "./ProductsSection";
import ResourcesSection from "./ResourcesSection";
import CouponsSection from "./CouponsSection";
import AsignacionSection from "./AsignacionSection";

export const dynamic = "force-dynamic";

export default async function CatalogoPage() {
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
