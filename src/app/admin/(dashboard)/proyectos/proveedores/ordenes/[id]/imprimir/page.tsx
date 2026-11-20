import { notFound } from "next/navigation";
import { requireApp } from "@/lib/require-app";
import { exigirVer } from "@/lib/proyectos/gestion.server";
import { MEDIO_LABEL, type MedioPago } from "@/lib/proyectos/core";
import { ordenParaVer, siHayM1 } from "@/lib/proyectos/comprobantes.server";
import { ESTADO_ORDEN_LABEL, numeroDeOrden } from "@/lib/proyectos/orden-pago-core";
import { BotonImprimir } from "../../../../imprimir/venta/[id]/_boton";
import { permisosDeCompras, SinPlata } from "../../../_compras";
import { DetalleOrden } from "../_detalle";

export const dynamic = "force-dynamic";
export const metadata = { title: "Orden de pago para imprimir" };

export default async function OrdenParaImprimir({ params }: { params: Promise<{ id: string }> }) {
  await requireApp("gestion-proveedores");
  const { a, vePlata } = await permisosDeCompras(await exigirVer("proveedores"));
  const { id } = await params;
  if (!vePlata) return <main className="mx-auto w-full max-w-3xl px-4 py-5"><SinPlata /></main>;
  const o = await siHayM1(() => ordenParaVer(a.tenantId, id));
  if (!o) notFound();
  return (
    <main className="mx-auto grid w-full max-w-3xl gap-4 px-4 py-5">
      {/* Al imprimir sale sólo el papel, sin el menú ni la barra de la app (mismo criterio que imprimir/venta). */}
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #papel, #papel * { visibility: visible !important; }
          #papel { position: absolute; inset: 0; margin: 0; background: white; color: black; }
          @page { size: A4; margin: 14mm; }
        }
      `}</style>
      <div className="print:hidden"><BotonImprimir /></div>
      <article id="papel" className="grid gap-4">
        <header>
          <div>
            <p className="text-sm text-muted">Orden de pago</p>
            <h1 className="text-2xl font-bold text-strong">{numeroDeOrden(o.numero)}</h1>
            <p className="text-sm text-muted">{ESTADO_ORDEN_LABEL[o.estado]}</p>
          </div>
        </header>
        <DetalleOrden o={{ ...o, medio: MEDIO_LABEL[o.medio as MedioPago] ?? o.medio }} />
        <div className="mt-8 grid grid-cols-2 gap-8 text-center text-xs text-muted">
          <p className="border-t border-line pt-2">Firma de quien aprueba</p>
          <p className="border-t border-line pt-2">Recibí conforme (proveedor)</p>
        </div>
      </article>
    </main>
  );
}
