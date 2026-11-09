// TALLER DE STANDS (GSG-MIA-004 · T2) — pestaña «Despiece» del stand. Sólo se monta con el taller activo
// (flag + módulo + rubro): la productora no la ve. Server component: los formularios llaman server actions.
import Link from "next/link";
import { Button, buttonClasses, EmptyState } from "@/components/ui";
import { pesos } from "@/lib/proyectos/core";
import { costoDespiece, costoLinea } from "@/lib/taller-stands/core";
import { despieceDelProyecto, piezasDelTaller, stockDelDespiece, type StockLinea } from "@/lib/taller-stands/datos.server";
import { descontarMateriales, despieceAlPresupuesto, devolverMateriales, guardarLineaDespiece, quitarLineaDespiece } from "@/lib/taller-stands/acciones";
import { campo, etiqueta, tarjeta } from "../_vista";

export async function PestanaDespiece({ tenantId, proyectoId, edita, cotiza, aviso }: { tenantId: string; proyectoId: string; edita: boolean; cotiza: boolean; aviso?: string }) {
  const [{ sinMigrar, lineas }, catalogo, stock] = await Promise.all([despieceDelProyecto(tenantId, proyectoId), piezasDelTaller(tenantId, true), stockDelDespiece(tenantId, proyectoId)]);
  if (sinMigrar || catalogo.sinMigrar) {
    return <EmptyState title="El despiece todavía no está habilitado" description="Falta un paso de instalación del taller. Ya está anotado; cuando esté, vas a poder cargar las piezas de cada stand acá." />;
  }
  const total = costoDespiece(lineas);
  return (
    <section className={tarjeta} aria-labelledby="titulo-despiece">
      <h2 id="titulo-despiece" className="text-lg font-semibold text-strong">Despiece del stand</h2>
      <p className="text-sm text-muted">Las piezas del taller con su costo interno. El costo queda congelado al cargarlas; nunca sale en el presupuesto para la productora.</p>
      {aviso && <p role="status" className="mt-3 rounded-lg border border-line bg-surface px-3 py-2 text-sm">{aviso}</p>}

      {lineas.length === 0 ? (
        <p className="mt-4 text-sm">Todavía no cargaste piezas en este stand.</p>
      ) : (
        <table className="mt-4 w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-muted">
              <th scope="col" className="py-2">Pieza</th>
              <th scope="col" className="py-2 text-right">Cantidad</th>
              <th scope="col" className="py-2 text-right">Costo unitario</th>
              <th scope="col" className="py-2 text-right">Costo</th>
              {edita && <th scope="col" className="py-2"><span className="sr-only">Acciones</span></th>}
            </tr>
          </thead>
          <tbody>
            {lineas.map((l) => (
              <tr key={l.id} className="border-b border-line">
                <td className="py-2">{l.nombre}</td>
                <td className="py-2 text-right">{l.cantidad} {l.unidad}</td>
                <td className="py-2 text-right">{pesos(l.costoUnitSnap)}</td>
                <td className="py-2 text-right">{pesos(costoLinea(l))}</td>
                {edita && (
                  <td className="py-2 text-right">
                    <form action={quitarLineaDespiece}>
                      <input type="hidden" name="proyectoId" value={proyectoId} />
                      <input type="hidden" name="id" value={l.id} />
                      <Button type="submit" variant="ghost" size="sm" aria-label={`Quitar ${l.nombre}`}>Quitar</Button>
                    </form>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" colSpan={3} className="py-2 text-right">Costo del despiece</th>
              <td className="py-2 text-right font-semibold text-strong">{pesos(total)}</td>
              {edita && <td />}
            </tr>
          </tfoot>
        </table>
      )}

      {edita && (
        catalogo.piezas.length === 0 ? (
          <p className="mt-4 text-sm">No hay piezas activas en el catálogo. <Link href="/admin/proyectos/taller/piezas" className="underline">Cargá las piezas del taller</Link>.</p>
        ) : (
          <form action={guardarLineaDespiece} className="mt-4 grid gap-3 sm:grid-cols-[1fr_8rem_auto] sm:items-end">
            <input type="hidden" name="proyectoId" value={proyectoId} />
            <label className={etiqueta}>
              Pieza
              <select name="piezaId" required className={campo}>
                {catalogo.piezas.map((p) => <option key={p.id} value={p.id}>{p.nombre} · {pesos(p.costoUnit)} / {p.unidad}</option>)}
              </select>
            </label>
            <label className={etiqueta}>
              Cantidad
              <input name="cantidad" inputMode="decimal" required defaultValue="1" className={campo} />
            </label>
            <Button type="submit" variant="outline">Sumar o cambiar</Button>
          </form>
        )
      )}

      <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-3">
        {cotiza && (
          <form action={despieceAlPresupuesto}>
            <input type="hidden" name="proyectoId" value={proyectoId} />
            <Button type="submit">Pasar a presupuesto</Button>
          </form>
        )}
        <Link href={`/admin/proyectos/imprimir/productora/${proyectoId}`} className={buttonClasses("outline", "md")}>Presupuesto para la productora</Link>
        <Link href="/admin/proyectos/taller/piezas" className={buttonClasses("ghost", "md")}>Catálogo de piezas</Link>
      </div>

      {lineas.length > 0 && <StockDeMateriales proyectoId={proyectoId} edita={edita} sinMigrar={stock.sinMigrar} lineas={stock.lineas} />}
    </section>
  );
}

const num = (n: number) => String(Math.round(n * 1000) / 1000).replace(".", ",");

/**
 * T6 · stock real: de qué producto sale cada pieza y cuánto ya se descontó. «Descontar» registra la salida CONSUMO por
 * el ledger (sólo lo que falta); «Devolver» la deshace. Sin la migración del consumo, un aviso en vez de los botones.
 */
function StockDeMateriales({ proyectoId, edita, sinMigrar, lineas }: { proyectoId: string; edita: boolean; sinMigrar: boolean; lineas: readonly StockLinea[] }) {
  const conStock = lineas.filter((l) => l.producto?.trackStock);
  const descontado = lineas.some((l) => l.descontado > 0);
  return (
    <div className="mt-4 border-t border-line pt-3" aria-labelledby="titulo-stock-materiales">
      <h3 id="titulo-stock-materiales" className="font-semibold text-strong">Stock de materiales</h3>
      {sinMigrar ? (
        <p className="text-sm text-muted">El descuento de stock todavía no está habilitado (falta un paso de instalación). Ya está anotado.</p>
      ) : (
        <>
          <p className="text-sm text-muted">Al armar el stand, descontá del stock lo que usa el despiece. Sólo cuentan las piezas vinculadas a un producto que controla stock (se vinculan en el catálogo de piezas).</p>
          <ul className="mt-2 grid gap-1 text-sm">
            {lineas.map((l) => (
              <li key={l.piezaId}>
                <span className="font-medium">{l.nombre}</span> · {num(l.cantidad)} {l.unidad} ·{" "}
                {!l.producto ? <span className="text-muted">sin producto vinculado</span>
                  : !l.producto.trackStock ? <span className="text-muted">{l.producto.nombre} (no controla stock)</span>
                  : <>sale de {l.producto.nombre} (hay {num(l.producto.stock)} {l.producto.unidad}) · descontado: {num(l.descontado)}</>}
              </li>
            ))}
          </ul>
          {edita && (
            <div className="mt-3 flex flex-wrap gap-2">
              {conStock.length > 0 && (
                <form action={descontarMateriales}>
                  <input type="hidden" name="proyectoId" value={proyectoId} />
                  <Button type="submit" variant="outline">Descontar materiales del stock</Button>
                </form>
              )}
              {descontado && (
                <form action={devolverMateriales}>
                  <input type="hidden" name="proyectoId" value={proyectoId} />
                  <Button type="submit" variant="ghost">Devolver al stock</Button>
                </form>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
