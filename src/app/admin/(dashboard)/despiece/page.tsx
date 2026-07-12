import { requireCapability } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { getCurrentTenantId } from "@/lib/tenant";
import { getCurrentTenantRubro } from "@/lib/carniceria/rubro";
import { hasCarniceriaSchema } from "@/lib/carniceria/schema-probe";
import { listRuns } from "@/lib/carniceria/despiece-actions";
import { fmtShortDate } from "@/lib/datetime";
import { PageHeader, EmptyState } from "@/components/ui";
import DespieceClient, { type RunView } from "./DespieceClient";

export const dynamic = "force-dynamic";

export default async function DespiecePage() {
  await requireCapability("catalog:read");
  const [rubro, ready] = await Promise.all([getCurrentTenantRubro(), hasCarniceriaSchema()]);

  if (!rubro.isRetail || !ready) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-8">
        <PageHeader title="Despiece" description="De la media res a los cortes, con el rendimiento real." />
        <EmptyState
          title="En preparación"
          description="El despiece con rendimiento y merma se activa cuando se aplique la actualización del sistema. El código ya está listo."
        />
      </main>
    );
  }

  const tenantId = await getCurrentTenantId();
  const [runs, products] = await Promise.all([
    listRuns(),
    prisma.product.findMany({ where: { tenantId, deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  const runViews: RunView[] = runs.map((r) => ({
    id: r.id,
    code: r.code,
    inputName: r.inputName,
    inputWeightKg: r.inputWeightKg,
    inputCost: r.inputCost,
    totalOutputKg: r.totalOutputKg,
    mermaKg: r.mermaKg,
    mermaPct: r.inputWeightKg > 0 ? r.mermaKg / r.inputWeightKg : 0,
    costPerSellableKg: r.costPerSellableKg,
    createdAtLabel: fmtShortDate(r.createdAt),
    outputs: r.outputs,
  }));

  return (
    <main className="mx-auto max-w-4xl px-4 sm:px-6 py-6 sm:py-8">
      <PageHeader
        title="Despiece"
        description="Cargá la media res (o el cuarto) con su peso y su costo, y los cortes que sacaste. El sistema calcula el rendimiento por corte, la merma y el costo real por kilo vendible — y suma el stock de cada corte."
      />
      <DespieceClient runs={runViews} products={products} />
    </main>
  );
}
