import Link from "next/link";
import { requireApp } from "@/lib/require-app";
import { getNegocioApps } from "@/apps/contexto.server";
import { appPermitida } from "@/apps/visibles";
import { appPorId } from "@/apps/registro";
import { getMovimientos, MAX_FILAS } from "@/lib/inventario/movimientos-loader";
import {
  TIPOS_DE_MOVIMIENTO,
  hrefMovimientos,
  leerFiltros,
  nombreDelTipo,
  quienHizo,
} from "@/lib/inventario/movimientos";
import { fmtDateTimeAr } from "@/lib/datetime";
import { formatearCantidad } from "@/lib/pos-peso";
import { EmptyState, PageHeader, buttonClasses, fmtMoneyARS } from "@/components/ui";
import { disenoNuevo } from "@/lib/diseno/diseno.server";
import Filtros from "./Filtros";
import { CabeceraMovimientos, LibroDeMovimientos, ParaRecontar } from "./MovimientosRenglon";

export const dynamic = "force-dynamic";

const firmado = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 3, signDisplay: "always" });

// MOVIMIENTOS DE UN PRODUCTO: "¿por qué el stock dice esto?". Cada entrada y salida del registro
// de movimientos con su saldo, su motivo y quién la hizo. Arriba de todo, la cola de los que
// quedaron EN NEGATIVO (se vendió más de lo que el sistema creía que había): hay que
// recontarlos antes de mirar cualquier otra cosa.
export default async function MovimientosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireApp("movimientos");
  const [sp, negocio] = await Promise.all([searchParams, getNegocioApps(user.role)]);
  const filtros = leerFiltros(sp);
  const datos = await getMovimientos(filtros);
  const puedeRecontar = appPermitida(appPorId("recuento"), negocio);
  // El encargado puede tener Movimientos sin tener Stock: sin esto, "Volver" lo mandaba a
  // "App no disponible".
  const veStock = appPermitida(appPorId("inventario"), negocio);
  const elegido = filtros.producto ? datos.productos.find((p) => p.id === filtros.producto) : undefined;
  const tipos = TIPOS_DE_MOVIMIENTO.map((t) => ({ id: t, nombre: nombreDelTipo(t) }));

  // DISEÑO NUEVO («Renglón»): el libro de la cámara. Lo que hay que recontar arriba, el filtro
  // suelto, y cada día con su rótulo y su cuenta; los días de más atrás, plegados.
  if (await disenoNuevo()) {
    return (
      <main data-ui="pagina" className="mx-auto w-full max-w-5xl px-4 py-6">
        <CabeceraMovimientos elegido={elegido} cuantos={datos.movimientos.length} hayMas={datos.hayMas} veStock={veStock} />
        <ParaRecontar negativos={datos.negativos} puedeRecontar={puedeRecontar} />
        <Filtros productos={datos.productos} tipos={tipos} inicial={filtros} renglon />
        <LibroDeMovimientos datos={datos} filtros={filtros} elegido={Boolean(elegido)} />
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl px-4 sm:px-6 py-6 sm:py-8">
      <PageHeader
        title={elegido ? `Movimientos de ${elegido.name}` : "Movimientos de stock"}
        description="Cada entrada y salida, con el stock que quedó después, el motivo y quién la hizo."
        actions={
          veStock ? (
            <Link href="/admin/inventario" className={buttonClasses("outline", "md")}>
              Volver a Stock
            </Link>
          ) : undefined
        }
      />

      {datos.negativos.length > 0 && (
        <section aria-labelledby="negativos-titulo" className="mb-6 rounded-lg border border-danger/30 bg-danger-soft p-4">
          <h2 id="negativos-titulo" className="text-base font-semibold text-danger">
            {datos.negativos.length === 1 ? "1 producto en negativo" : `${datos.negativos.length} productos en negativo`} — recontar
          </h2>
          <p className="mt-1 text-sm text-body">
            Se vendió más de lo que el sistema tenía cargado. Recontalos para que el stock vuelva a ser el real.
          </p>
          <ul className="mt-3 divide-y divide-line rounded-md border border-line bg-surface-raised">
            {datos.negativos.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                <Link href={hrefMovimientos({ producto: p.id })} className="text-sm text-strong underline-offset-2 hover:underline">
                  {p.name}{" "}
                  <span className="tabular-nums font-medium text-danger">
                    {formatearCantidad(p.stock)} {p.unit}
                  </span>
                </Link>
                {puedeRecontar && (
                  <Link href={`/admin/ajustes/recuento?producto=${encodeURIComponent(p.id)}`} className={buttonClasses("outline", "md")}>
                    Recontar
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <Filtros
        productos={datos.productos}
        tipos={tipos}
        inicial={filtros}
      />

      {elegido && (
        <p className="mt-4 text-sm text-body">
          Stock ahora: <span className="font-semibold tabular-nums text-strong">{formatearCantidad(elegido.stock)} {elegido.unit}</span>
        </p>
      )}

      <section className="mt-4" aria-label="Movimientos">
        {datos.movimientos.length === 0 ? (
          <EmptyState
            title="No hay movimientos con estos filtros"
            description="Probá con otro rango de fechas o sacá el filtro de tipo."
            action={
              <Link href="/admin/inventario/movimientos" className={buttonClasses("solid", "md")}>
                Ver todos los movimientos
              </Link>
            }
          />
        ) : (
          <ul className="divide-y divide-line rounded-lg border border-line">
            {datos.movimientos.map((m) => {
              const unidad = m.product?.unit ?? "";
              const origen = m.orderId
                ? datos.pedidos.has(m.orderId)
                  ? `Pedido #${datos.pedidos.get(m.orderId)}`
                  : "Pedido"
                : m.purchaseId
                  ? datos.compras.has(m.purchaseId)
                    ? `Compra #${datos.compras.get(m.purchaseId)}`
                    : "Compra"
                  : null;
              return (
                <li key={m.id} className="grid gap-1 px-3 py-3 sm:grid-cols-[10rem_1fr_auto] sm:items-baseline sm:gap-4">
                  <span className="text-xs text-faint tabular-nums">{fmtDateTimeAr(m.createdAt)}</span>
                  <span className="min-w-0 text-sm">
                    <span className="font-medium text-strong">{nombreDelTipo(m.type)}</span>
                    {!elegido && m.product && (
                      <>
                        {" · "}
                        <Link href={hrefMovimientos({ ...filtros, producto: m.productId })} className="text-body underline-offset-2 hover:underline">
                          {m.product.name}
                        </Link>
                      </>
                    )}
                    {m.reason && <span className="text-muted"> · {m.reason}</span>}
                    <span className="block text-xs text-muted">
                      {quienHizo(m.createdBy, datos.nombres)}
                      {origen && ` · ${origen}`}
                      {datos.conCostos && m.unitCost != null && m.unitCost > 0 && ` · costo ${fmtMoneyARS(m.unitCost)}/${unidad}`}
                    </span>
                  </span>
                  <span className="text-sm tabular-nums sm:text-right">
                    {m.qty === 0 ? (
                      <span className="text-faint">sin diferencia</span>
                    ) : (
                      <span className={m.qty > 0 ? "font-medium text-success" : "font-medium text-danger"}>
                        {firmado.format(m.qty)} {unidad}
                      </span>
                    )}
                    <span className="block text-xs text-muted">quedó {formatearCantidad(m.balanceAfter)} {unidad}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        {datos.hayMas && (
          <p className="mt-2 text-xs text-warning">
            Se muestran los {MAX_FILAS} más recientes. Achicá el rango de fechas o elegí un producto para ver los anteriores.
          </p>
        )}
      </section>
    </main>
  );
}
