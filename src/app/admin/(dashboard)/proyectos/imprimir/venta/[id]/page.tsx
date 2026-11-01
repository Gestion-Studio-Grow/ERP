import Link from "next/link";
import { notFound } from "next/navigation";
import { requireApp } from "@/lib/require-app";
import { buttonClasses } from "@/components/ui";
import { fechaCorta } from "@/lib/proyectos/core";
import { planillaParaPapel } from "@/lib/proyectos/ficha.server";
import { exigirVer } from "@/lib/proyectos/gestion.server";
import { PlanillaVenta } from "../../../[id]/_planilla";
import { BotonImprimir } from "./_boton";

export const dynamic = "force-dynamic";
export const metadata = { title: "Planilla de venta" };

// "Guardar como PDF" lo hace el propio teléfono o la PC desde Imprimir. El papel sale sin costos, sin barra y sin botones.
export default async function PlanillaImprimible({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ version?: string }> }) {
  await requireApp("proyectos");
  const a = await exigirVer("cotizaciones");
  const [{ id }, { version }] = await Promise.all([params, searchParams]);
  const d = await planillaParaPapel(a, id, version);
  if (!d) notFound();
  const { proyecto: p } = d;
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
        <Link href={`/admin/proyectos/${p.id}?tab=cotizacion`} className={buttonClasses("outline", "md")}>Volver</Link>
      </div>
      <article id="papel" className="rounded-2xl border border-line bg-surface-raised p-5">
        <header className="mb-4 border-b border-line pb-3">
          <p className="text-sm text-muted">{d.negocio.nombre} · {d.codigo} · Versión {d.version}</p>
          <h1 className="text-xl font-bold text-strong">{p.nombre}</h1>
          <p className="text-sm">{[p.client.name, p.lugar, p.ciudad, p.fechaEvento && fechaCorta(p.fechaEvento)].filter(Boolean).join(" · ")}</p>
        </header>
        <PlanillaVenta grupos={d.grupos} neto={d.neto} ivaPct={d.ivaPct} />
        {d.condiciones && <p className="mt-4 whitespace-pre-line border-t border-line pt-3 text-sm">{d.condiciones}</p>}
      </article>
    </main>
  );
}
