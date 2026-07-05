import { getAdjustmentData } from "@/lib/stock-adjustment-actions";
import { fmtShortDate } from "@/lib/datetime";
import AjustesForm from "./AjustesForm";

export const dynamic = "force-dynamic";

const qtyFmt = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 3 });
// Delta con signo explícito (+/−) para que se lea de un vistazo si sumó o restó.
const signedFmt = new Intl.NumberFormat("es-AR", {
  maximumFractionDigits: 3,
  signDisplay: "always",
});

export default async function AjustesPage() {
  // getAdjustmentData aplica requireCapability("catalog:read") — guard de la página.
  const { products, recent } = await getAdjustmentData();

  return (
    <main className="mx-auto max-w-3xl px-6 py-8">
      <h1 className="text-2xl font-semibold mb-1">Ajustes y mermas</h1>
      <p className="text-muted mb-8">
        Corregí el stock por fuera de la venta y la compra: un recuento físico, una merma,
        una rotura o un vencimiento. Cada ajuste queda registrado con su motivo para poder
        auditar después por qué cambió el stock.
      </p>

      <AjustesForm products={products} />

      {recent.length > 0 && (
        <>
          <h2 className="text-lg font-medium mt-10 mb-3">Ajustes recientes</h2>
          <div className="space-y-2">
            {recent.map((m) => {
              const up = m.qty >= 0;
              return (
                <div
                  key={m.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-line px-4 py-3 text-sm"
                >
                  <span className="text-xs text-faint">{fmtShortDate(m.createdAt)}</span>
                  <span className="min-w-0 truncate text-body font-medium">
                    {m.product?.name ?? "(producto eliminado)"}
                  </span>
                  <span
                    className={`tabular-nums font-medium ${up ? "text-success" : "text-danger"}`}
                  >
                    {signedFmt.format(m.qty)}
                  </span>
                  <span className="text-xs text-faint">
                    → quedó {qtyFmt.format(m.balanceAfter)}
                  </span>
                  {m.reason && <span className="ml-auto text-muted">{m.reason}</span>}
                </div>
              );
            })}
          </div>
        </>
      )}
    </main>
  );
}
