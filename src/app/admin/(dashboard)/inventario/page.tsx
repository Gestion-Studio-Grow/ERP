import Link from "next/link";
import { requireCapability } from "@/lib/authz";
import { getActiveProfile } from "@/lib/profile-gating";
import { getCurrentTenantRubro } from "@/lib/carniceria/rubro";
import { getProductExtras } from "@/lib/carniceria/product-extras";
import { getInventory } from "@/lib/inventario/loader";
import { classifyCorte, categoriaMeta, CORTE_CATEGORIAS, type CorteCategoria } from "@/lib/carniceria/cortes";
import { PageHeader, EmptyState, Badge, fmtMoneyARS, buttonClasses } from "@/components/ui";
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

// Inventario (recuento/valuación, ADR-060 D5). Se enciende para el rubro RETAIL/carnicería
// (Magra) además del canal Empresa: un mostrador vive del control de stock. En servicios (CH,
// no-retail, motor de perfiles OFF) queda EXACTAMENTE como antes ("En preparación") → nav y
// pantalla byte-idénticas. Read-only; los movimientos (ajuste/merma) viven en /admin/ajustes.
export default async function InventarioPage() {
  await requireCapability("catalog:read");
  const [profile, rubro] = await Promise.all([getActiveProfile(), getCurrentTenantRubro()]);

  // Gate: retail (Magra) O motor de perfiles encendido. CH (servicios) no cumple ninguno.
  if (!rubro.isRetail && profile === null) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-8">
        <PageHeader title="Inventario" description="Niveles de stock y su valuación." />
        <EmptyState title="En preparación" description="El inventario valuado se activa junto con las nuevas funciones del panel." />
      </main>
    );
  }

  const [{ rows, summary }, extras] = await Promise.all([getInventory(), getProductExtras()]);

  return (
    <main className="mx-auto max-w-5xl px-4 sm:px-6 py-6 sm:py-8">
      <PageHeader
        title="Inventario"
        description="Stock actual y su valuación por corte (solo lectura). La valuación usa el último costo de compra conocido."
      />

      <div className="mb-6 grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="Cortes / productos" value={String(summary.productos)} />
        <Stat label="Valuación total" value={fmtMoneyARS(summary.valuacionTotal)} />
        <Stat label="Stock bajo" value={String(summary.bajoStock)} tone={summary.bajoStock > 0 ? "warning" : "neutral"} hint="en o bajo el umbral" />
        <Stat label="Sin costo" value={String(summary.sinCosto)} hint="valuación incompleta" />
      </div>

      {/* Acceso al tercer flujo del inventario: ajustes y MERMAS (recuento/rotura). */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface-sunken px-4 py-3">
        <p className="text-sm text-muted">
          ¿Recontaste, tiraste algo o se echó a perder? Registrá un <span className="text-body font-medium">ajuste o merma</span> para que el stock quede fiel.
        </p>
        <Link href="/admin/ajustes" className={buttonClasses("outline", "sm")}>
          Registrar ajuste / merma
        </Link>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="En preparación"
          description="El inventario valuado (niveles de stock + costo por corte) se muestra cuando cargues productos y compras."
        />
      ) : rubro.isRetail ? (
        // Vista por GÓNDOLA para carnicería: cada corte bajo su categoría (explícita o
        // derivada del nombre), con stock, último costo y valuación. Stock bajo resaltado.
        <CarniceriaInventory rows={rows} extras={extras} />
      ) : (
        <InventoryTable rows={rows} />
      )}
    </main>
  );
}

type Row = Awaited<ReturnType<typeof getInventory>>["rows"][number];

function CarniceriaInventory({
  rows,
  extras,
}: {
  rows: Row[];
  extras: Map<string, { category: string | null; cost: number | null }>;
}) {
  const VALID = new Set<CorteCategoria>(CORTE_CATEGORIAS.map((c) => c.id));
  const catOf = (r: Row): CorteCategoria => {
    const explicit = extras.get(r.productId)?.category;
    if (explicit && VALID.has(explicit as CorteCategoria)) return explicit as CorteCategoria;
    return classifyCorte(r.name);
  };
  const grupos = CORTE_CATEGORIAS.map((c) => ({
    categoria: c,
    items: rows.filter((r) => catOf(r) === c.id),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="space-y-8">
      {grupos.map(({ categoria, items }) => (
        <div key={categoria.id}>
          <div className="flex items-baseline gap-2 mb-2">
            <span aria-hidden className="text-accent">{categoriaMeta(categoria.id).glyph}</span>
            <h2 className="text-base font-semibold text-strong">{categoria.label}</h2>
            <span className="text-xs text-faint">{items.length} corte{items.length !== 1 ? "s" : ""}</span>
          </div>
          <div className="sm:overflow-x-auto sm:rounded-lg sm:border sm:border-line">
            <table className="block sm:table w-full text-left">
              <thead className="hidden sm:table-header-group">
                <tr className="border-b bg-surface-sunken text-xs uppercase tracking-wide text-muted">
                  <th className="px-4 py-2 font-medium">Corte</th>
                  <th className="px-4 py-2 font-medium">Stock</th>
                  <th className="px-4 py-2 font-medium">Último costo</th>
                  <th className="px-4 py-2 font-medium text-right">Valuación</th>
                </tr>
              </thead>
              <tbody className="block sm:table-row-group">
                {items.map((r) => (
                  <tr key={r.productId} className="block sm:table-row rounded-lg border sm:border-0 sm:border-b sm:rounded-none sm:last:border-b-0 mb-3 sm:mb-0 px-3 py-2.5 sm:px-0 sm:py-0">
                    <td className="block sm:table-cell px-0 sm:px-4 py-1 sm:py-2.5 text-sm text-strong">{r.name}</td>
                    <td className="block sm:table-cell px-0 sm:px-4 py-1 sm:py-2.5 text-sm">
                      <span className="sm:hidden text-xs uppercase tracking-wide text-faint mr-1.5">Stock:</span>
                      <span className={`tabular-nums ${r.belowLowStock ? "text-danger font-medium" : "text-body"}`}>
                        {r.stock} {r.unit}
                      </span>
                      {r.belowLowStock && <Badge tone="danger" className="ml-2">Stock bajo</Badge>}
                    </td>
                    <td className="block sm:table-cell px-0 sm:px-4 py-1 sm:py-2.5 text-sm tabular-nums text-body">
                      <span className="sm:hidden text-xs uppercase tracking-wide text-faint mr-1.5">Costo:</span>
                      {r.sinCosto ? <span className="text-faint">sin costo</span> : `${fmtMoneyARS(r.unitCost)}/${r.unit}`}
                    </td>
                    <td className="block sm:table-cell px-0 sm:px-4 py-1 sm:py-2.5 text-sm tabular-nums sm:text-right text-body">
                      <span className="sm:hidden text-xs uppercase tracking-wide text-faint mr-1.5">Valuación:</span>
                      {r.sinCosto ? "—" : fmtMoneyARS(r.valuation)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}
