import { requireApp } from "@/lib/require-app";
import { getNegocioApps } from "@/apps/contexto.server";
import { appPermitida } from "@/apps/visibles";
import { appPorId } from "@/apps/registro";
import { getDevolucionesData } from "@/lib/suppliers/devoluciones";
import { fmtShortDate } from "@/lib/datetime";
import { formatearCantidad } from "@/lib/pos-peso";
import { Bloque, PageContainer, PageHeader, Plata, Renglon, fmtMoneyARS } from "@/components/ui";
import { disenoNuevo } from "@/lib/diseno/diseno.server";
import { DevolucionForm } from "./DevolucionForm";

export const dynamic = "force-dynamic";

// Devoluciones a proveedor (ADR-060 D4). La guardia es la de la app (`requireApp`): rol,
// módulo y edición con la misma regla que el menú. Antes la página se abría para cualquiera
// con la capability y mostraba "Disponible en la edición Empresa" aun en un negocio del piloto
// que tenía el módulo asignado: un callejón sin salida. Ahora, si la app no está, lo dice
// "App no disponible" con a quién pedírsela; si está, se usa.
export default async function DevolucionesProveedorPage() {
  const user = await requireApp("devoluciones-a-proveedor");
  const [{ compras, historial }, negocio] = await Promise.all([getDevolucionesData(), getNegocioApps(user.role)]);
  const veCompras = appPermitida(appPorId("recibir-mercaderia"), negocio);

  // DISEÑO NUEVO («Renglón»): la nota de devolución arriba (el mismo formulario) y lo devuelto como
  // renglones: la fecha en el folio, el producto y la compra en el asunto, lo que valía en la
  // columna de plata. La explicación de qué pasa con el stock y la plata la da el formulario.
  if (await disenoNuevo()) {
    return (
      <PageContainer width="narrow">
        <PageHeader
          title="Devoluciones a proveedor"
          estado={[
            "Sale del stock y se descuenta de la deuda o te la devuelven",
            historial.length > 0 ? `${historial.length} ${historial.length === 1 ? "devolución" : "devoluciones"} en el historial` : null,
          ]}
        />
        <div className="space-y-8">
          <Bloque id="nueva" titulo="Nueva devolución">
            <div className="pt-3">
              <DevolucionForm compras={compras} hrefCompras={veCompras ? "/admin/compras" : null} renglon />
            </div>
          </Bloque>
          <Bloque id="historial" titulo="Lo que devolviste">
            {historial.length === 0 ? (
              <p data-ui="vacio" className="border-b border-line py-4 text-sm text-body">
                Todavía no se devolvió nada.
              </p>
            ) : (
              <ul>
                {historial.map((h) => (
                  <Renglon
                    key={h.id}
                    as="li"
                    folio={fmtShortDate(h.at)}
                    titulo={h.productName}
                    detalle={[formatearCantidad(h.qty), h.compra !== null ? `compra #${h.compra}` : null, h.reason].filter(Boolean).join(" · ")}
                    plata={h.unitCost != null ? <Plata valor={h.value} /> : <span className="text-[13px] text-muted">sin costo</span>}
                  />
                ))}
              </ul>
            )}
          </Bloque>
        </div>
      </PageContainer>
    );
  }

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
        <DevolucionForm compras={compras} hrefCompras={veCompras ? "/admin/compras" : null} />
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
