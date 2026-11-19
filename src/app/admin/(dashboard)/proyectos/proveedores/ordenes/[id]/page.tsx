import Link from "next/link";
import { notFound } from "next/navigation";
import { buttonClasses, cn } from "@/components/ui";
import SubmitButton from "@/components/SubmitButton";
import { requireApp } from "@/lib/require-app";
import { exigirVer } from "@/lib/proyectos/gestion.server";
import { anularOrden, aprobarYPagarOrden } from "@/lib/proyectos/acciones-orden-pago";
import { fechaCorta, MEDIO_LABEL, type MedioPago } from "@/lib/proyectos/core";
import { ordenParaVer, siHayM1 } from "@/lib/proyectos/comprobantes.server";
import { ESTADO_ORDEN_LABEL, errorDeAprobacion, numeroDeOrden } from "@/lib/proyectos/orden-pago-core";
import { FormAccion } from "../../../[id]/_cliente";
import { tarjeta } from "../../../_vista";
import { permisosDeCompras, NavCompras, plata, SinPlata } from "../../_compras";
import { DetalleOrden } from "./_detalle";
import { CampoCodigo } from "@/components/segundo-paso/CampoCodigo";
import { rigeSegundoPaso } from "@/lib/proyectos/segundo-factor-core";
import { rubroDe } from "@/lib/proyectos/segundo-factor.server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Orden de pago" };

export default async function Orden({ params }: { params: Promise<{ id: string }> }) {
  await requireApp("gestion-proveedores");
  const { a, vePlata, paga } = permisosDeCompras(await exigirVer("proveedores"));
  const { id } = await params;
  if (!vePlata) return <main className="mx-auto grid w-full max-w-6xl gap-4 px-4 py-5"><SinPlata /></main>;
  const o = await siHayM1(() => ordenParaVer(a.tenantId, id));
  if (!o) notFound();
  const noPuedeAprobar = errorDeAprobacion(a.user.id, o.cargadores);
  // MIA-50 T11 (O47, D10): pagar pide el código de la app en el momento, donde rigen los dos pasos.
  const dosPasos = paga && o.estado === "PENDIENTE" && rigeSegundoPaso(await rubroDe(a.tenantId));

  return (
    <main className="mx-auto grid w-full max-w-4xl gap-4 px-4 py-5">
      <NavCompras actual="/admin/proyectos/proveedores/ordenes" />
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted"><Link href="/admin/proyectos/proveedores/ordenes" className="underline">Órdenes de pago</Link></p>
          <h1 className="text-2xl font-bold text-strong">{numeroDeOrden(o.numero)}</h1>
          <p className={cn("text-sm", o.estado === "PENDIENTE" ? "font-semibold text-strong" : "text-muted")}>{ESTADO_ORDEN_LABEL[o.estado]}</p>
        </div>
        <Link href={`/admin/proyectos/proveedores/ordenes/${o.id}/imprimir`} className={buttonClasses("outline", "md")}>Versión para imprimir</Link>
      </header>
      <DetalleOrden o={{ ...o, medio: MEDIO_LABEL[o.medio as MedioPago] ?? o.medio }} />
      {paga && o.estado === "PENDIENTE" && (
        <section className={cn(tarjeta, "grid gap-2")} aria-label="Aprobar y pagar">
          {noPuedeAprobar ? (
            <p className="text-sm text-strong">{noPuedeAprobar}</p>
          ) : (
            <FormAccion accion={aprobarYPagarOrden} className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="id" value={o.id} />
              {dosPasos && <div className="basis-full"><CampoCodigo accion="pagar" /></div>}
              <SubmitButton className={buttonClasses("solid", "md")}>Aprobar y pagar {plata(o.total)}</SubmitButton>
              <span className="text-xs text-muted">Sale de la caja hoy, con {MEDIO_LABEL[o.medio as MedioPago] ?? o.medio}.</span>
            </FormAccion>
          )}
        </section>
      )}
      {paga && o.estado !== "ANULADA" && (
        <FormAccion accion={anularOrden} className="flex justify-end">
          <input type="hidden" name="id" value={o.id} />
          <SubmitButton className={buttonClasses("ghost", "md")}>{o.estado === "PAGADA" ? "Anular la orden (vuelve la plata a la caja)" : "Anular la orden"}</SubmitButton>
        </FormAccion>
      )}
      {o.anuladaEl && <p className="text-sm text-muted">Anulada el {fechaCorta(o.anuladaEl)}{o.anuladaPor ? ` por ${o.anuladaPor}` : ""}.</p>}
    </main>
  );
}
