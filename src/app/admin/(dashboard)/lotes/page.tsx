import { requireCapability } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { getCurrentTenantId } from "@/lib/tenant";
import { getCurrentTenantRubro } from "@/lib/carniceria/rubro";
import { hasCarniceriaSchema } from "@/lib/carniceria/schema-probe";
import { listBatches } from "@/lib/carniceria/lotes-actions";
import { expiryState, daysUntil, avgPackageWeight, summarizeBatches, type ExpiryState } from "@/lib/carniceria/lotes";
import { fmtShortDate } from "@/lib/datetime";
import { PageHeader, EmptyState } from "@/components/ui";
import LotesClient, { type LoteView } from "./LotesClient";

export const dynamic = "force-dynamic";

export default async function LotesPage() {
  await requireCapability("catalog:read");
  const [rubro, ready] = await Promise.all([getCurrentTenantRubro(), hasCarniceriaSchema()]);

  // Gate schema-ahead: sin la migración cárnica aplicada (o tenant no-retail) → "En preparación".
  if (!rubro.isRetail || !ready) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-8">
        <PageHeader title="Lotes / Envasado al vacío" description="Trazabilidad, vencimientos y peso por lote." />
        <EmptyState
          title="En preparación"
          description="La gestión de lotes de envasado al vacío se activa cuando se aplique la actualización del sistema. Ya está todo listo del lado del código."
        />
      </main>
    );
  }

  const now = new Date();
  const tenantId = await getCurrentTenantId();
  const [batches, products, suppliers] = await Promise.all([
    listBatches(),
    prisma.product.findMany({ where: { tenantId, deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.supplier.findMany({ where: { tenantId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  const summary = summarizeBatches(batches, now);
  const views: LoteView[] = batches.map((b) => {
    const st: ExpiryState = expiryState(b.expiresAt, now);
    return {
      id: b.id,
      code: b.code,
      productName: b.productName,
      supplierName: b.supplierName,
      packedAtLabel: b.packedAt ? fmtShortDate(b.packedAt) : null,
      expiresAtLabel: b.expiresAt ? fmtShortDate(b.expiresAt) : null,
      expiryState: st,
      daysToExpiry: daysUntil(b.expiresAt, now),
      netWeightKg: b.netWeightKg,
      packages: b.packages,
      avgPackageKg: avgPackageWeight(b.netWeightKg, b.packages),
      unitCost: b.unitCost,
      status: b.status,
    };
  });

  return (
    <main className="mx-auto max-w-5xl px-4 sm:px-6 py-6 sm:py-8">
      <PageHeader
        title="Lotes / Envasado al vacío"
        description="Cada lote al vacío con su fecha de envasado, su vencimiento, su peso real y su trazabilidad. Ordenados por el que vence antes (FEFO)."
      />
      <LotesClient
        views={views}
        summary={summary}
        products={products}
        suppliers={suppliers}
      />
    </main>
  );
}
