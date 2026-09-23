import { requireUser } from "@/lib/authz";
import { requireApp } from "@/lib/require-app";
import { roleHasCapability } from "@/lib/capabilities";
import { prisma } from "@/lib/prisma";
import { getCurrentTenantId } from "@/lib/tenant";
import { todayInBusinessTz } from "@/lib/datetime";
import { leerEstadoLotesYDespiece } from "@/lib/carniceria/schema-probe";
import { listarLotes } from "@/lib/carniceria/lotes-loader";
import {
  avgPackageWeight,
  daysUntil,
  diaDelLote,
  expiryState,
  fmtDia,
  plataEnRiesgo,
  summarizeBatches,
} from "@/lib/carniceria/lotes";
import { whereProveedoresActivos } from "@/lib/suppliers/supplier";
import { PageHeader, EmptyState } from "@/components/ui";
import LotesClient, { type LoteView } from "./LotesClient";

export const dynamic = "force-dynamic";

const TITULO = "Lotes y vencimientos";

// LOTES Y VENCIMIENTOS. Un negocio que vende perecederos y todavía no tiene la migración cárnica
// ve "En preparación" (así sigue MAGRA en producción hasta la ola 9): se decide ANTES de la
// guardia de la app, porque `requireApp` lo mandaría a "App no disponible" con un porqué menos
// claro. Todo lo demás pasa por `requireApp` (rol, módulo, rubro de perecederos y migración).
export default async function LotesPage() {
  if ((await leerEstadoLotesYDespiece()) === "falta-migracion") {
    // Sólo un aviso fijo, sin un dato del negocio: alcanza con la sesión.
    await requireUser();
    return (
      <main className="mx-auto max-w-3xl px-4 sm:px-6 py-6 sm:py-8">
        <PageHeader title={TITULO} description="Trazabilidad, vencimientos y peso de cada lote al vacío." />
        <EmptyState
          title="En preparación"
          description="Los lotes al vacío se activan cuando se aplique la actualización de la base de tu negocio. Mientras tanto, los vencimientos se siguen controlando como hasta ahora."
        />
      </main>
    );
  }
  const user = await requireApp("lotes-y-vencimientos");
  const conCostos = roleHasCapability(user.role, "costs:read");
  const tenantId = await getCurrentTenantId();
  const hoy = todayInBusinessTz();
  const [batches, products, suppliers] = await Promise.all([
    listarLotes(tenantId, conCostos),
    prisma.product.findMany({ where: { tenantId, deletedAt: null, active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.supplier.findMany({ where: whereProveedoresActivos(tenantId), select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  const views: LoteView[] = batches.map((b) => {
    const envasado = diaDelLote(b.packedAt);
    const vence = diaDelLote(b.expiresAt);
    return {
      id: b.id,
      code: b.code,
      productName: b.productName,
      supplierName: b.supplierName,
      packedAtLabel: envasado ? fmtDia(envasado) : null,
      expiresAtLabel: vence ? fmtDia(vence) : null,
      expiryState: expiryState(b.expiresAt, hoy),
      daysToExpiry: daysUntil(b.expiresAt, hoy),
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
        title={TITULO}
        description="Cada lote al vacío con su fecha de envasado, su vencimiento, su peso real y su trazabilidad. Ordenados por el que vence antes."
      />
      <LotesClient
        views={views}
        summary={summarizeBatches(batches, hoy)}
        riesgo={conCostos ? plataEnRiesgo(batches, hoy) : null}
        products={products}
        suppliers={suppliers}
        conCostos={conCostos}
        puedeCargar={roleHasCapability(user.role, "stock:receive")}
      />
    </main>
  );
}
