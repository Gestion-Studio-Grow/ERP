import { getStockData } from "@/lib/stock-actions";
import { fmtMoneyARS } from "@/components/ui";
import { getActiveProfile } from "@/lib/profile-gating";
import { fmtShortDate } from "@/lib/datetime";
import ComprasForm from "./ComprasForm";

export const dynamic = "force-dynamic";

const qtyFmt = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 3 });

const KIND_LABEL: Record<string, string> = {
  COMPRA: "Compra",
  REPOSICION: "Reposición",
};

export default async function ComprasPage() {
  // getStockData aplica requireCapability("catalog:read") — guard de la página.
  // Perfil (ADR-058/059): la edición Empresa profundiza la MISMA pantalla con la orden
  // formal a proveedor (razón social + CUIT + N° de orden, J45/18J). Con el motor OFF
  // (profile===null) o Comercio, la cabecera es la simple de hoy → aditivo, sin dead-end.
  const [{ products, recent }, profile] = await Promise.all([getStockData(), getActiveProfile()]);
  const formal = profile === "enterprise";

  // Productos con stock por debajo del umbral: lo que conviene reponer primero.
  const lowStock = products.filter((p) => p.stock <= p.lowStockAt);

  return (
    <main className="mx-auto max-w-3xl px-6 py-8">
      <h1 className="text-2xl font-semibold mb-1">Compras y reposición</h1>
      <p className="text-muted mb-8">
        Registrá la entrada de mercadería (compra a proveedor o reposición interna): elegí los
        productos y las cantidades, y el sistema suma ese stock automáticamente. Es la contracara
        de la venta, que lo descuenta.
        {formal && " En la edición Empresa podés dejar registrada la orden formal (razón social, CUIT y N° de orden)."}
      </p>

      {lowStock.length > 0 && (
        <div className="mb-6 rounded-lg border border-warning-soft bg-warning-soft/40 px-4 py-3 text-sm">
          <span className="font-medium text-warning">Stock bajo:</span>{" "}
          <span className="text-body">
            {lowStock
              .map((p) => `${p.name} (${qtyFmt.format(p.stock)} ${p.unit})`)
              .join(" · ")}
          </span>
        </div>
      )}

      <ComprasForm products={products} formal={formal} />

      {recent.length > 0 && (
        <>
          <h2 className="text-lg font-medium mt-10 mb-3">Entradas recientes</h2>
          <div className="space-y-2">
            {recent.map((entry) => (
              <div key={entry.id} className="rounded-lg border border-line px-4 py-3 text-sm">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="rounded-full bg-surface-sunken px-2 py-0.5 text-[11px] font-medium text-muted">
                    {KIND_LABEL[entry.kind] ?? entry.kind} #{entry.code}
                  </span>
                  <span className="text-xs text-faint">{fmtShortDate(entry.createdAt)}</span>
                  {entry.supplier && <span className="text-body">· {entry.supplier}</span>}
                  <span className="ml-auto tabular-nums font-medium text-body">
                    {fmtMoneyARS(entry.totalCost)}
                  </span>
                </div>
                <ul className="mt-1.5 text-muted">
                  {entry.items.map((it) => (
                    <li key={it.id} className="flex items-center justify-between gap-3">
                      <span className="min-w-0 truncate">
                        {it.name} · {qtyFmt.format(it.quantity)} {it.unit}
                      </span>
                      {it.unitCost > 0 && (
                        <span className="tabular-nums text-faint">
                          {fmtMoneyARS(it.unitCost)} c/u
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
                {entry.notes && <p className="mt-1 text-xs text-faint">{entry.notes}</p>}
              </div>
            ))}
          </div>
        </>
      )}
    </main>
  );
}
