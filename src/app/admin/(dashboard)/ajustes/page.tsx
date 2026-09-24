import Link from "next/link";
import { requireApp } from "@/lib/require-app";
import { getNegocioApps } from "@/apps/contexto.server";
import { appPermitida } from "@/apps/visibles";
import { appPorId } from "@/apps/registro";
import { EmptyState, buttonClasses } from "@/components/ui";
import { roleHasCapability } from "@/lib/capabilities";
import { getCurrentTenantRubro } from "@/lib/carniceria/rubro";
import { getAdjustmentData } from "@/lib/inventario/ajustes-loader";
import { fmtShortDate } from "@/lib/datetime";
import { motivosDeAjuste, topeDeMermaPorCarga, type AdjustmentMotivo } from "@/lib/stock/adjustment-core";
import { rubroConPerecederos } from "@/blueprints/retail/rubros";
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
// un id que no está en la lista de productos del negocio, o un motivo que este negocio no
// ofrece, se ignoran. Un producto INACTIVO también llega: el loader lo suma a la lista.
const uno = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

function leerInicial(
  sp: { producto?: string | string[]; motivo?: string | string[] },
  productIds: ReadonlySet<string>,
  motivos: readonly AdjustmentMotivo[],
): AjusteInicial {
  const producto = uno(sp.producto);
  const motivo = uno(sp.motivo).toUpperCase();
  return {
    productId: productIds.has(producto) ? producto : undefined,
    motivo: (motivos as readonly string[]).includes(motivo) ? (motivo as AdjustmentMotivo) : undefined,
  };
}

// Mermas (en un negocio de servicios, "Ajustes y mermas", como siempre). La guardia es la de la
// app (`requireApp`): rol, módulo, rubro y edición, la misma regla que el menú. Un mostrador
// arranca en Merma y manda el recuento a su propia planilla; si vende comida fresca suma los
// motivos de perecederos.
export default async function AjustesPage({
  searchParams,
}: {
  searchParams: Promise<{ producto?: string | string[]; motivo?: string | string[] }>;
}) {
  const user = await requireApp("mermas");
  const [sp, negocio, rubro] = await Promise.all([searchParams, getNegocioApps(user.role), getCurrentTenantRubro()]);
  const { products, recent } = await getAdjustmentData(uno(sp.producto) || undefined);
  // Los motivos de perecederos salen del dato del blueprint (el mismo que prende Lotes y Despiece).
  const motivos = motivosDeAjuste({ esMostrador: negocio.esMostrador, perecederos: rubroConPerecederos(rubro.rubro?.id) });
  const inicial = leerInicial(sp, new Set(products.map((p) => p.id)), motivos);
  // El botón del vacío, sólo si quien carga puede abrir el catálogo (el encargado no).
  const veCatalogo = appPermitida(appPorId("catalogo"), negocio);

  return (
    <main className="mx-auto max-w-3xl px-4 sm:px-6 py-6 sm:py-8">
      <h1 className="text-2xl font-semibold mb-1">{negocio.esMostrador ? "Mermas" : "Ajustes y mermas"}</h1>
      {negocio.esMostrador ? (
        <p className="text-muted mb-8">
          Lo que se venció, se rompió, se decomisó o se consumió: cargalo acá y el stock baja. Queda registrado quién lo
          cargó y cuánto costaba ese día. Para contar una góndola entera usá el{" "}
          <Link href="/admin/ajustes/recuento" className="font-medium text-accent underline underline-offset-2">
            recuento
          </Link>
          .
        </p>
      ) : (
        <p className="text-muted mb-8">
          Corregí el stock por fuera de la venta y la compra: un recuento físico, una merma,
          una rotura o un vencimiento. Cada ajuste queda registrado con su motivo para poder
          auditar después por qué cambió el stock.
        </p>
      )}

      {products.length === 0 ? (
        <EmptyState
          title="Todavía no hay productos"
          description={
            veCatalogo
              ? "Para cargar una merma primero tiene que estar el producto. Cargalo en el catálogo y volvé."
              : "Para cargar una merma primero tiene que estar el producto. Pedile a la dueña o al dueño que lo cargue en el catálogo."
          }
          action={
            veCatalogo ? (
              <Link href="/admin/catalogo" className={buttonClasses("solid", "md")}>
                Ir al catálogo
              </Link>
            ) : undefined
          }
        />
      ) : (
        // La key re-monta el formulario si se llega con otro producto preelegido.
        <AjustesForm
          key={`${inicial.productId ?? ""}:${inicial.motivo ?? ""}`}
          products={products}
          motivos={motivos}
          inicial={inicial}
          topePesos={topeDeMermaPorCarga(user.role)}
          conCostos={roleHasCapability(user.role, "costs:read")}
        />
      )}

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
                  {/* Un recuento que coincidió con el sistema queda registrado en 0: se dice
                      así, no "+0", que parece que entró algo. */}
                  {m.qty === 0 ? (
                    <span className="tabular-nums text-faint">sin diferencia</span>
                  ) : (
                    <span className={`tabular-nums font-medium ${up ? "text-success" : "text-danger"}`}>
                      {signedFmt.format(m.qty)}
                    </span>
                  )}
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
