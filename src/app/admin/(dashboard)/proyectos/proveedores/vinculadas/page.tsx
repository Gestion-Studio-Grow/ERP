import Link from "next/link";
import { buttonClasses, cn } from "@/components/ui";
import { requireApp } from "@/lib/require-app";
import { exigirVer } from "@/lib/proyectos/gestion.server";
import { fechaCorta } from "@/lib/proyectos/core";
import { comprasAVinculadas, parametrosDeComprobantes, siHayM1 } from "@/lib/proyectos/comprobantes.server";
import { campo, etiqueta, tarjeta } from "../../_vista";
import { permisosDeCompras, NavCompras, plata, SinM1, SinPlata } from "../_compras";

export const dynamic = "force-dynamic";
export const metadata = { title: "Compras a sociedades vinculadas" };

// O44 · lo que este negocio le compró a sus sociedades vinculadas, con la referencia que las une. Nunca lee otro negocio.
export default async function Vinculadas({ searchParams }: { searchParams: Promise<{ referencia?: string }> }) {
  await requireApp("gestion-proveedores");
  const { a, vePlata } = await permisosDeCompras(await exigirVer("proveedores"));
  const referencia = ((await searchParams).referencia ?? "").trim();
  const [filas, p] = vePlata ? await Promise.all([siHayM1(() => comprasAVinculadas(a.tenantId)), parametrosDeComprobantes(a.tenantId)]) : [null, null];
  const visibles = (filas ?? []).filter((f) => !referencia || f.referenciaVinculada === referencia);
  const referencias = [...new Set((filas ?? []).map((f) => f.referenciaVinculada).filter((r): r is string => !!r))].sort();
  const total = visibles.filter((f) => !f.anuladoEl).reduce((s, f) => s + f.total, 0);

  return (
    <main className="mx-auto grid w-full max-w-6xl gap-4 px-4 py-5">
      <NavCompras actual="/admin/proyectos/proveedores/vinculadas" />
      <header>
        <h1 className="text-2xl font-bold text-strong">Compras a sociedades vinculadas</h1>
        <p className="text-sm text-muted">Comprobantes de proveedores que son sociedades del mismo grupo. Cada sociedad ve sólo lo suyo.</p>
      </header>
      {!vePlata ? (
        <SinPlata />
      ) : filas === null || p === null ? (
        <SinM1 />
      ) : (
        <>
          <p className={cn(tarjeta, "text-sm text-strong")}>
            Sociedades vinculadas: {p.vinculadas.length ? p.vinculadas.join(" · ") : "ninguna cargada"} · modelo de compra {p.modeloCompra === "CADA_UNA_COMPRA" ? "cada una compra a su nombre" : p.modeloCompra}
            {p.modeloCompraProvisional && <span className="text-muted"> (provisional a confirmar)</span>}
          </p>
          {referencias.length > 0 && (
            <form method="get" className="flex flex-wrap items-end gap-2">
              <label className={etiqueta}>
                Referencia
                <select name="referencia" defaultValue={referencia} className={campo}>
                  <option value="">Todas</option>
                  {referencias.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </label>
              <button type="submit" className={buttonClasses("outline", "md")}>Filtrar</button>
            </form>
          )}
          <section aria-labelledby="compras" className={cn(tarjeta, "overflow-x-auto")}>
            <h2 id="compras" className="font-semibold text-strong">Compras</h2>
            <p className="mb-2 text-sm text-muted">Total sin anuladas: <strong className="text-strong">{plata(total)}</strong></p>
            {visibles.length === 0 ? (
              <p className="text-sm text-muted">No hay compras a sociedades vinculadas{referencia ? " con esa referencia" : ""}.</p>
            ) : (
              <table className="w-full min-w-[32rem] text-sm">
                <thead className="text-left text-xs text-muted">
                  <tr><th className="py-1 pr-3 font-medium">Fecha</th><th className="pr-3 font-medium">Comprobante</th><th className="pr-3 font-medium">Sociedad</th><th className="pr-3 font-medium">Referencia</th><th className="text-right font-medium">Total</th></tr>
                </thead>
                <tbody>
                  {visibles.map((f) => (
                    <tr key={f.id} className={cn("border-t border-line", f.anuladoEl && "text-muted line-through")}>
                      <td className="py-2 pr-3">{fechaCorta(f.fecha)}</td>
                      <td className="pr-3"><Link href={`/admin/proyectos/proveedores/comprobantes/${f.id}`} className="underline underline-offset-2">{f.tipo} {f.numero}</Link></td>
                      <td className="pr-3">{f.supplier.name}</td>
                      <td className="pr-3">{f.referenciaVinculada ?? "—"}</td>
                      <td className="text-right">{plata(f.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}
    </main>
  );
}
