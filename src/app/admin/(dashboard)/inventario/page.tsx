import { requireCapability } from "@/lib/authz";
import { getActiveProfile } from "@/lib/profile-gating";
import { getInventory } from "@/lib/inventario/loader";
import { PageHeader, EmptyState, fmtMoneyARS } from "@/components/ui";
import { InventoryTable } from "@/components/inventario/InventoryTable";

export const dynamic = "force-dynamic";

function Stat({ label, value, hint, tone = "neutral" }: { label: string; value: string; hint?: string; tone?: "neutral" | "warning" }) {
  const toneClass = tone === "warning" ? "text-warning" : "text-strong";
  return (
    <div className="rounded-lg border border-line p-4">
      <p className="text-sm text-muted">{label}</p>
      <p className={`text-2xl font-semibold tabular-nums ${toneClass}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

// Inventario (recuento/valuación, ADR-060 D5). RE-GATEADO a `lite` + RUBRO (fix de coherencia
// que se había elevado): aplica a TODO Comercio con stock — NO enterprise-only (el mínimo
// anti-oversell ya lo dan Ajustes/Compras; ADR-060 D5). El rubro-gating (qué tenants lo ven)
// vive en la nav (perfilMin=lite + módulo por rubro). Se mantiene en el CANAL gateado por
// `PROFILES_ENABLED` (via `getActiveProfile()===null` = motor OFF) para no renderear en prod
// con flags OFF — igual criterio que CxC. Enterprise ⊇ lite intacto (ambos lo ven con el motor
// ON). Read-only; datos vía read model de S1.
export default async function InventarioPage() {
  await requireCapability("catalog:read");
  const profile = await getActiveProfile();
  if (profile === null) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-8">
        <PageHeader title="Inventario" description="Niveles de stock y su valuación." />
        <EmptyState title="En preparación" description="El inventario valuado se activa junto con las nuevas funciones del panel." />
      </main>
    );
  }

  const { rows, summary } = await getInventory();

  return (
    <main className="mx-auto max-w-5xl px-4 sm:px-6 py-6 sm:py-8">
      <PageHeader
        title="Inventario"
        description="Niveles de stock actuales y su valuación por producto (solo lectura). La valuación usa el último costo de compra conocido."
      />
      <div className="mb-6 grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="Productos" value={String(summary.productos)} />
        <Stat label="Valuación total" value={fmtMoneyARS(summary.valuacionTotal)} />
        <Stat label="Stock bajo" value={String(summary.bajoStock)} tone={summary.bajoStock > 0 ? "warning" : "neutral"} hint="en o bajo el umbral" />
        <Stat label="Sin costo" value={String(summary.sinCosto)} hint="valuación incompleta" />
      </div>
      {rows.length === 0 ? (
        <EmptyState
          title="En preparación"
          description="El inventario valuado (niveles de stock actuales + costo por producto) se muestra cuando se active su lectura."
        />
      ) : (
        <InventoryTable rows={rows} />
      )}
    </main>
  );
}
