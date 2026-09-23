import { getAdjustmentData } from "@/lib/stock-adjustment-actions";
import { fmtShortDate } from "@/lib/datetime";
import { ADJUSTMENT_MOTIVOS, type AdjustmentMotivo } from "@/lib/stock/adjustment-core";
import AjustesForm, { type AjusteInicial } from "./AjustesForm";

export const dynamic = "force-dynamic";

const qtyFmt = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 3 });
// Delta con signo explícito (+/−) para que se lea de un vistazo si sumó o restó.
const signedFmt = new Intl.NumberFormat("es-AR", {
  maximumFractionDigits: 3,
  signDisplay: "always",
});

// `?producto=<id>&motivo=RECUENTO` — lo manda el "Recontar" del catálogo. El catálogo ya no
// deja tipear el stock (lo pisaba con el número de cuando se abrió la pantalla, sin dejar
// rastro), así que corregirlo es venir acá, y llegar con el corte y el motivo ya elegidos
// es lo que hace que ese desvío sea un clic y no una búsqueda. Sólo se acepta lo que existe:
// un id que no está en la lista de productos del tenant, o un motivo inventado, se ignoran.
// Un producto INACTIVO también llega: el loader lo suma a la lista cuando viene preelegido.
const uno = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

function leerInicial(
  sp: { producto?: string | string[]; motivo?: string | string[] },
  productIds: ReadonlySet<string>,
): AjusteInicial {
  const producto = uno(sp.producto);
  const motivo = uno(sp.motivo).toUpperCase();
  return {
    productId: productIds.has(producto) ? producto : undefined,
    motivo: (ADJUSTMENT_MOTIVOS as readonly string[]).includes(motivo)
      ? (motivo as AdjustmentMotivo)
      : undefined,
  };
}

export default async function AjustesPage({
  searchParams,
}: {
  searchParams: Promise<{ producto?: string | string[]; motivo?: string | string[] }>;
}) {
  // getAdjustmentData aplica requireCapability("catalog:read") — guard de la página.
  const sp = await searchParams;
  const { products, recent } = await getAdjustmentData(uno(sp.producto) || undefined);
  const inicial = leerInicial(sp, new Set(products.map((p) => p.id)));

  return (
    <main className="mx-auto max-w-3xl px-6 py-8">
      <h1 className="text-2xl font-semibold mb-1">Ajustes y mermas</h1>
      <p className="text-muted mb-8">
        Corregí el stock por fuera de la venta y la compra: un recuento físico, una merma,
        una rotura o un vencimiento. Cada ajuste queda registrado con su motivo para poder
        auditar después por qué cambió el stock.
      </p>

      {/* La key re-monta el formulario si se llega con otro producto preelegido. */}
      <AjustesForm
        key={`${inicial.productId ?? ""}:${inicial.motivo ?? ""}`}
        products={products}
        inicial={inicial}
      />

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
