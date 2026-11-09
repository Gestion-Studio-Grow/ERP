// TALLER DE STANDS (GSG-MIA-004 · T2) — el presupuesto que el taller le pasa a mano a la productora (MIA):
// descripción, cantidad, precio y total. Nunca costo, costo real, recargo ni margen (`papelParaMia`, probado).
// "Guardar como PDF" lo hace el propio navegador desde Imprimir.
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireApp } from "@/lib/require-app";
import { buttonClasses } from "@/components/ui";
import { fechaCorta, pesos } from "@/lib/proyectos/core";
import { exigirVer } from "@/lib/proyectos/gestion.server";
import { papelMiaDelProyecto, tallerActivo } from "@/lib/taller-stands/datos.server";
import { BotonImprimir } from "../../venta/[id]/_boton";

export const dynamic = "force-dynamic";
export const metadata = { title: "Presupuesto para la productora" };

export default async function PresupuestoProductora({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ version?: string }> }) {
  await requireApp("proyectos");
  const a = await exigirVer("cotizaciones");
  if (!(await tallerActivo(a.tenantId))) notFound();
  const [{ id }, { version }] = await Promise.all([params, searchParams]);
  const d = await papelMiaDelProyecto(a, id, version);
  if (!d) notFound();
  const { proyecto: p, papel } = d;
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-5">
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #papel, #papel * { visibility: visible !important; }
          #papel { position: absolute; inset: 0; margin: 0; border: 0 !important; background: white; color: black; }
          @page { size: A4; margin: 14mm; }
        }
      `}</style>
      <div className="mb-4 flex flex-wrap gap-2">
        <BotonImprimir />
        <Link href={`/admin/proyectos/${p.id}?tab=despiece`} className={buttonClasses("outline", "md")}>Volver</Link>
      </div>
      <article id="papel" className="rounded-2xl border border-line bg-surface-raised p-5">
        <header className="mb-4 border-b border-line pb-3">
          <p className="text-sm text-muted">Presupuesto · Versión {d.version}</p>
          <h1 className="text-xl font-bold text-strong">{p.nombre}</h1>
          <p className="text-sm">{[p.client.name, p.lugar, p.fechaEvento && fechaCorta(p.fechaEvento)].filter(Boolean).join(" · ")}</p>
        </header>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left">
              <th scope="col" className="py-2">Descripción</th>
              <th scope="col" className="py-2 text-right">Cantidad</th>
              <th scope="col" className="py-2 text-right">Precio</th>
              <th scope="col" className="py-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {papel.lineas.map((l, i) => (
              <tr key={i} className="border-b border-line">
                <td className="py-2">{l.descripcion}</td>
                <td className="py-2 text-right">{l.cantidad} {l.unidad}</td>
                <td className="py-2 text-right">{pesos(l.precio)}</td>
                <td className="py-2 text-right">{pesos(l.total)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr><th scope="row" colSpan={3} className="py-1 text-right">Subtotal</th><td className="py-1 text-right">{pesos(papel.neto)}</td></tr>
            <tr><th scope="row" colSpan={3} className="py-1 text-right">IVA {papel.ivaPct}%</th><td className="py-1 text-right">{pesos(papel.iva)}</td></tr>
            <tr><th scope="row" colSpan={3} className="py-1 text-right">Total</th><td className="py-1 text-right font-bold text-strong">{pesos(papel.total)}</td></tr>
          </tfoot>
        </table>
        {d.condiciones && <p className="mt-4 whitespace-pre-line border-t border-line pt-3 text-sm">{d.condiciones}</p>}
      </article>
    </main>
  );
}
