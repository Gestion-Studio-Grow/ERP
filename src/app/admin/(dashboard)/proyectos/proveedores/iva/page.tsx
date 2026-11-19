import Link from "next/link";
import { buttonClasses, cn } from "@/components/ui";
import { requireApp } from "@/lib/require-app";
import { exigirVer } from "@/lib/proyectos/gestion.server";
import { fechaCorta } from "@/lib/proyectos/core";
import { ivaCreditoDelPeriodo, siHayM1 } from "@/lib/proyectos/comprobantes.server";
import { mesDelParametro } from "@/lib/proyectos/comprobantes-core";
import { campo, etiqueta, tarjeta } from "../../_vista";
import { permisosDeCompras, NavCompras, plata, SinM1, SinPlata } from "../_compras";

export const dynamic = "force-dynamic";
export const metadata = { title: "IVA crédito fiscal" };

// O30 · el IVA que se imputó como crédito fiscal en el mes, comprobante por comprobante, listo para el contador.
export default async function IvaCredito({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  await requireApp("gestion-proveedores");
  const { a, vePlata } = permisosDeCompras(await exigirVer("proveedores"));
  const mes = mesDelParametro((await searchParams).mes);
  const datos = vePlata ? await siHayM1(() => ivaCreditoDelPeriodo(a.tenantId, mes)) : null;

  return (
    <main className="mx-auto grid w-full max-w-6xl gap-4 px-4 py-5">
      <NavCompras actual="/admin/proyectos/proveedores/iva" />
      <header>
        <h1 className="text-2xl font-bold text-strong">IVA crédito fiscal</h1>
        <p className="text-sm text-muted">Sólo la parte del IVA que se imputó como crédito. La que se imputó como costo va al proyecto y no aparece acá.</p>
      </header>
      {!vePlata ? (
        <SinPlata />
      ) : datos === null ? (
        <SinM1 />
      ) : (
        <>
          <form className="flex flex-wrap items-end gap-2" method="get">
            <label className={etiqueta}>Mes<input type="month" name="mes" defaultValue={mes} className={campo} /></label>
            <button type="submit" className={buttonClasses("outline", "md")}>Ver el mes</button>
            <a href={`/admin/proyectos/proveedores/iva/csv?mes=${mes}`} className={buttonClasses("ghost", "md")}>Bajar para el contador (CSV)</a>
          </form>
          <section aria-label="Totales del mes" className="grid gap-3 sm:grid-cols-2">
            <div className={tarjeta}><p className="text-xs text-muted">Neto gravado</p><p className="text-xl font-bold text-strong">{plata(datos.totalNeto)}</p></div>
            <div className={tarjeta}><p className="text-xs text-muted">IVA crédito</p><p className="text-xl font-bold text-strong">{plata(datos.totalIva)}</p></div>
          </section>
          <section aria-labelledby="renglones" className={cn(tarjeta, "overflow-x-auto")}>
            <h2 id="renglones" className="mb-2 font-semibold text-strong">Comprobantes del mes</h2>
            {datos.renglones.length === 0 ? (
              <p className="text-sm text-muted">No hay IVA crédito en este mes.</p>
            ) : (
              <>
              {/* En el teléfono, un renglón por comprobante; la tabla no entra en 390 px. */}
              <ul className="grid gap-2 text-sm sm:hidden">
                {datos.renglones.map((r) => (
                  <li key={r.id} className="border-t border-line pt-2">
                    <Link href={`/admin/proyectos/proveedores/comprobantes/${r.id}`} className="font-medium underline underline-offset-2">{r.tipo} {r.numero}</Link>
                    <p className="text-xs text-muted">{fechaCorta(r.fecha)} · {r.supplier.name}{r.supplier.taxId ? ` · CUIT ${r.supplier.taxId}` : ""}</p>
                    <p className="flex justify-between"><span className="text-muted">Neto {plata(r.neto)}</span><span className="font-medium">IVA {plata(r.iva)}</span></p>
                  </li>
                ))}
              </ul>
              <table className="hidden w-full text-sm sm:table">
                <thead className="text-left text-xs text-muted">
                  <tr><th className="py-1 pr-3 font-medium">Fecha</th><th className="pr-3 font-medium">Comprobante</th><th className="pr-3 font-medium">Proveedor</th><th className="pr-3 text-right font-medium">Neto</th><th className="text-right font-medium">IVA</th></tr>
                </thead>
                <tbody>
                  {datos.renglones.map((r) => (
                    <tr key={r.id} className="border-t border-line">
                      <td className="py-2 pr-3">{fechaCorta(r.fecha)}</td>
                      <td className="pr-3"><Link href={`/admin/proyectos/proveedores/comprobantes/${r.id}`} className="underline underline-offset-2">{r.tipo} {r.numero}</Link></td>
                      <td className="pr-3">{r.supplier.name}{r.supplier.taxId ? <span className="block text-xs text-muted">CUIT {r.supplier.taxId}</span> : null}</td>
                      <td className="pr-3 text-right">{plata(r.neto)}</td>
                      <td className="text-right">{plata(r.iva)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </>
            )}
          </section>
        </>
      )}
    </main>
  );
}
