import { notFound } from "next/navigation";
import { requireApp } from "@/lib/require-app";
import { actorActual, puede } from "@/lib/proyectos/gestion.server";
import { datosDelNegocio } from "@/lib/proyectos/datos.server";
import { fechaCorta, pesos } from "@/lib/proyectos/core";
import { etiquetaMes, leerExtras } from "@/lib/proyectos/empresa-core";
import { liquidacionParaImprimir } from "@/lib/proyectos/empresa.server";
import { MarcarVista } from "../../administracion/_controles";
import { BotonImprimir } from "./_boton";

export const dynamic = "force-dynamic";
export const metadata = { title: "Liquidación" };

export default async function ImprimirLiquidacion({ params }: { params: Promise<{ id: string }> }) {
  await requireApp("proyectos");
  const a = await actorActual();
  const { id } = await params;
  const l = await liquidacionParaImprimir(a.tenantId, id);
  if (!l) notFound();
  const esMia = l.personaId === a.personaId;
  const administra = puede(a, "liquidaciones", "ver");
  // Un borrador todavía no existe para la persona. Para los demás, la misma respuesta que si no existiera.
  if (!administra && !(esMia && l.estado === "PUBLICADA")) notFound();
  const negocio = await datosDelNegocio(a.tenantId);
  const extras = leerExtras(l.extras);
  const volver = esMia && !administra ? `/admin/proyectos/mi-liquidacion?periodo=${l.periodo}` : `/admin/proyectos/administracion?tab=liquidaciones&mes=${l.periodo}`;
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-5">
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #papel, #papel * { visibility: visible !important; color: black !important; }
          #papel { position: absolute; inset: 0; margin: 0; border: 0 !important; box-shadow: none !important; background: transparent !important; }
          @page { size: A4; margin: 14mm; }
        }
      `}</style>
      {esMia && l.estado === "PUBLICADA" && <MarcarVista id={l.id} />}
      <BotonImprimir volver={volver} />
      <p className="mb-3 text-sm"><a href={`/admin/proyectos/imprimir-liquidacion/${l.id}/pdf`} className="underline">Descargar en PDF</a></p>
      <article id="papel" className="rounded-2xl border border-line bg-surface-raised p-6 text-sm text-strong">
        <header className="mb-4 flex flex-wrap justify-between gap-3 border-b border-line pb-3">
          <div>
            <p className="text-lg font-bold">{negocio.nombre}</p>
            <p className="text-muted">Recibo de liquidación</p>
          </div>
          <div className="text-right">
            <p className="font-semibold first-letter:uppercase">{etiquetaMes(l.periodo)}</p>
            <p className="text-muted">{l.estado === "PUBLICADA" ? `Publicada el ${fechaCorta(l.publicadaEl)}` : "Borrador, sin publicar"}</p>
          </div>
        </header>
        <dl className="mb-4 grid gap-1">
          <div className="flex justify-between gap-3"><dt className="text-muted">Persona</dt><dd className="text-right">{l.persona.nombre}</dd></div>
          {l.persona.puesto && <div className="flex justify-between gap-3"><dt className="text-muted">Puesto</dt><dd className="text-right">{l.persona.puesto}</dd></div>}
          <div className="flex justify-between gap-3"><dt className="text-muted">Factura a</dt><dd className="text-right">{l.facturaA || "—"}</dd></div>
        </dl>
        <table className="w-full">
          <thead className="text-left text-xs text-muted">
            <tr><th className="py-1 font-medium">Concepto</th><th className="text-right font-medium">Importe</th></tr>
          </thead>
          <tbody>
            <tr className="border-t border-line"><td className="py-1.5">Sueldo base</td><td className="text-right tabular-nums">{pesos(l.base)}</td></tr>
            {extras.map((e, i) => (
              <tr key={i} className="border-t border-line"><td className="py-1.5">{e.nombre}</td><td className="text-right tabular-nums">{pesos(e.monto)}</td></tr>
            ))}
            <tr className="border-t-2 border-line font-bold"><td className="py-2">Total</td><td className="text-right tabular-nums">{pesos(l.total)}</td></tr>
          </tbody>
        </table>
      </article>
    </main>
  );
}
