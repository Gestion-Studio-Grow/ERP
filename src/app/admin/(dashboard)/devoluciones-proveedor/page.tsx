import { requireApp } from "@/lib/require-app";
import { getDevolucionesData } from "@/lib/suppliers/devoluciones";
import { fmtShortDate } from "@/lib/datetime";
import { formatearCantidad } from "@/lib/pos-peso";
import { PageHeader, fmtMoneyARS } from "@/components/ui";
import { DevolucionForm } from "./DevolucionForm";

export const dynamic = "force-dynamic";

// Devoluciones a proveedor (ADR-060 D4). La guardia es la de la app (`requireApp`): rol,
// módulo y edición con la misma regla que el menú. Antes la página se abría para cualquiera
// con la capability y mostraba "Disponible en la edición Empresa" aun en un negocio del piloto
// que tenía el módulo asignado: un callejón sin salida. Ahora, si la app no está, lo dice
// "App no disponible" con a quién pedírsela; si está, se usa.
export default async function DevolucionesProveedorPage() {
  await requireApp("devoluciones-a-proveedor");
  const { compras, historial } = await getDevolucionesData();

  return (
    <main className="mx-auto max-w-4xl px-4 sm:px-6 py-6 sm:py-8 space-y-8">
      <PageHeader
        title="Devoluciones a proveedor"
        description="Devolvé mercadería de una compra (fallada, vencida, error de pedido): sale del stock y la plata se descuenta de la deuda o te la devuelven. Se registra todo junto o nada."
      />

      <section aria-labelledby="nueva-titulo">
        <h2 id="nueva-titulo" className="mb-3 text-lg font-semibold text-strong">
          Nueva devolución
        </h2>
        <DevolucionForm compras={compras} />
      </section>

      <section aria-labelledby="historial-titulo">
        <h2 id="historial-titulo" className="mb-3 text-lg font-semibold text-strong">
          Historial
        </h2>
        {historial.length === 0 ? (
          <p className="text-sm text-muted">Todavía no se devolvió nada.</p>
        ) : (
          <ul className="divide-y divide-line rounded-lg border border-line">
            {historial.map((h) => (
              <li key={h.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-3 text-sm">
                <span>
                  <span className="text-strong">{h.productName}</span>{" "}
                  <span className="text-muted">
                    · {fmtShortDate(h.at)}
                    {h.compra !== null && ` · compra #${h.compra}`}
                    {h.reason && ` · ${h.reason}`}
                  </span>
                </span>
                <span className="tabular-nums text-body">
                  {formatearCantidad(h.qty)} · {h.unitCost != null ? fmtMoneyARS(h.value) : "sin costo"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
