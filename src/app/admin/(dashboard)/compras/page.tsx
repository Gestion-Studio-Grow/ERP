import Link from "next/link";
import { requireApp } from "@/lib/require-app";
import { getNegocioApps } from "@/apps/contexto.server";
import { appPermitida } from "@/apps/visibles";
import { appPorId } from "@/apps/registro";
import { getComprasData } from "@/lib/inventario/compras-loader";
import { esStockBajo } from "@/lib/inventory/valuation";
import { Bloque, EmptyState, PageHeader, Plata, Renglon, buttonClasses, fmtMoneyARS } from "@/components/ui";
import { getActiveProfile } from "@/lib/profile-gating";
import { fmtShortDate, todayInBusinessTz } from "@/lib/datetime";
import { DIAS_DE_CUENTA_CORRIENTE, diaMasDias } from "@/lib/stock/purchase-egreso";
import { disenoNuevo } from "@/lib/diseno/diseno.server";
import { getCurrentTenantRubro } from "@/lib/carniceria/rubro";
import { vocabularioDelRubro } from "../catalogo/vocabulario";
import ComprasForm from "./ComprasForm";
import RecibirRenglon from "./RecibirRenglon";
import { cortosParaSumar, detalleDeEntrada, proveedorDeLaUrl } from "./recibir-core";

export const dynamic = "force-dynamic";

const qtyFmt = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 3 });

const KIND_LABEL: Record<string, string> = {
  COMPRA: "Compra",
  REPOSICION: "Reposición",
};

// Recibir mercadería (en un negocio de servicios, "Compras y reposición", como siempre). La
// guardia es la de la app (`requireApp`): la misma regla que el menú.
// Perfil (ADR-058/059): la edición Empresa profundiza la MISMA pantalla con la orden formal a
// proveedor (razón social + CUIT + N° de orden, J45/18J). Con el motor OFF (profile===null) o
// Comercio, la cabecera es la simple de hoy.
export default async function ComprasPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireApp("recibir-mercaderia");
  const [{ products, recent, proveedores, conCostos }, profile, negocio] = await Promise.all([
    getComprasData(),
    getActiveProfile(),
    getNegocioApps(user.role),
  ]);
  const formal = profile === "enterprise";
  // El enlace a Proveedores, sólo si esta persona puede abrir esa app (la dueña).
  const veProveedores = appPermitida(appPorId("proveedores"), negocio);
  // "Qué pedir hoy", sólo donde existe (mostrador) y la persona lo puede abrir.
  const veSugerido = appPermitida(appPorId("sugerido-de-compra"), negocio);
  // El botón del vacío, sólo si quien recibe puede abrir el catálogo (el encargado no).
  const veCatalogo = appPermitida(appPorId("catalogo"), negocio);
  // A cuenta corriente sólo si la deuda se va a poder ver y pagar (Cuentas a pagar) y quien
  // carga ve el costo, que es el monto de la deuda. Un negocio sin Cuentas a pagar (CH hoy)
  // no ve la opción: su formulario queda como siempre. La acción lo vuelve a verificar.
  const cuentaCorriente =
    conCostos && appPermitida(appPorId("cuentas-a-pagar"), negocio)
      ? { venceSugerido: diaMasDias(todayInBusinessTz(), DIAS_DE_CUENTA_CORRIENTE), dias: DIAS_DE_CUENTA_CORRIENTE }
      : null;

  // Lo que conviene reponer primero: bajo el mínimo, con la definición única (`esStockBajo`:
  // sólo los que controlan stock).
  const lowStock = products.filter(esStockBajo);

  // Diseño nuevo («el remito en la mano»): mismos datos, misma acción; apagado, la de siempre.
  if (await disenoNuevo()) {
    const vocabulario = vocabularioDelRubro(
      (await getCurrentTenantRubro()).rubro,
    );
    const palabra = vocabulario.carniceria ? "Corte" : "Producto";
    const sp = await searchParams;
    const titulo = negocio.esMostrador
      ? "Recibir mercadería"
      : "Compras y reposición";
    return (
      <main className="mx-auto max-w-4xl px-4 sm:px-6 py-6 sm:py-8">
        <PageHeader
          title={titulo}
          description="Lo que llega, como viene en el remito: suma el stock de cada producto al registrarlo."
          actions={
            <>
              {veSugerido && (
                <Link
                  href="/admin/compras/sugerido"
                  className={buttonClasses("outline", "md")}
                >
                  Qué pedir
                </Link>
              )}
              {veProveedores && (
                <Link
                  href="/admin/proveedores"
                  className={buttonClasses("outline", "md")}
                >
                  Proveedores
                </Link>
              )}
            </>
          }
        />

        {products.length === 0 ? (
          <EmptyState
            title="Todavía no hay productos que reciban stock"
            description={
              veCatalogo
                ? "Lo que llega se suma al stock de un producto del catálogo. Cargalos y volvé con el remito."
                : "Lo que llega se suma al stock de un producto del catálogo. Pedile a la dueña o al dueño que los cargue."
            }
            action={
              veCatalogo ? (
                <Link
                  href="/admin/catalogo"
                  className={buttonClasses("solid", "md")}
                >
                  Ir al catálogo
                </Link>
              ) : undefined
            }
          />
        ) : (
          <RecibirRenglon
            productos={products}
            proveedores={proveedores}
            formal={formal}
            conCostos={conCostos}
            cuentaCorriente={cuentaCorriente}
            proveedorInicial={proveedorDeLaUrl(sp.proveedor, proveedores)}
            cortos={cortosParaSumar(products, esStockBajo).map((p) => p.id)}
            palabra={palabra}
          />
        )}

        {recent.length > 0 && (
          <Bloque
            titulo="Lo último que entró"
            cuenta={recent.length}
            className="mt-12"
          >
            {recent.map((e) => (
              <Renglon
                key={e.id}
                folio={`#${e.code}`}
                titulo={e.supplier ?? KIND_LABEL[e.kind] ?? e.kind}
                detalle={[
                  fmtShortDate(e.createdAt),
                  e.supplier ? KIND_LABEL[e.kind] : null,
                  detalleDeEntrada(e.items),
                  e.notes,
                ]
                  .filter(Boolean)
                  .join(" · ")}
                plata={
                  conCostos ? (
                    e.totalCost > 0 ? (
                      <Plata valor={e.totalCost} />
                    ) : (
                      "—"
                    )
                  ) : undefined
                }
              />
            ))}
          </Bloque>
        )}
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-4 sm:px-6 py-6 sm:py-8">
      <h1 className="text-2xl font-semibold mb-1">{negocio.esMostrador ? "Recibir mercadería" : "Compras y reposición"}</h1>
      <p className="text-muted mb-8">
        Registrá la entrada de mercadería (compra a proveedor o reposición interna): elegí los
        productos y las cantidades, y el sistema suma ese stock automáticamente. Es la contracara
        de la venta, que lo descuenta.
        {formal && " En la edición Empresa podés dejar registrada la orden formal (razón social, CUIT y N° de orden)."}
        {negocio.esMostrador && veProveedores && proveedores.length === 0 && (
          <>
            {" "}
            Si cargás tus{" "}
            <Link href="/admin/proveedores" className="font-medium text-accent-ink underline underline-offset-2">
              proveedores
            </Link>
            , los elegís de una lista y cada compra queda en su ficha.
          </>
        )}
        {veSugerido && (
          <>
            {" "}
            Para saber qué pedir y a quién, mirá el{" "}
            <Link href="/admin/compras/sugerido" className="font-medium text-accent-ink underline underline-offset-2">
              sugerido de compra
            </Link>
            .
          </>
        )}
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

      {products.length === 0 ? (
        <EmptyState
          title="Todavía no hay productos"
          description={
            veCatalogo
              ? "Lo que llega se suma al stock de un producto del catálogo. Cargalos en el catálogo y volvé a registrar la entrada."
              : "Lo que llega se suma al stock de un producto del catálogo. Pedile a la dueña o al dueño que los cargue."
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
        <ComprasForm
          products={products}
          proveedores={proveedores}
          formal={formal}
          conCostos={conCostos}
          cuentaCorriente={cuentaCorriente}
        />
      )}

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
                  {conCostos && (
                    <span className="ml-auto tabular-nums font-medium text-body">
                      {fmtMoneyARS(entry.totalCost)}
                    </span>
                  )}
                </div>
                <ul className="mt-1.5 text-muted">
                  {entry.items.map((it) => (
                    <li key={it.id} className="flex items-center justify-between gap-3">
                      <span className="min-w-0 truncate">
                        {it.name} · {qtyFmt.format(it.quantity)} {it.unit}
                      </span>
                      {conCostos && it.unitCost > 0 && (
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
