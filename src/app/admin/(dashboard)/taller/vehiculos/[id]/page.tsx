import Link from "next/link";
import { notFound } from "next/navigation";
import { requireApp } from "@/lib/require-app";
import { buttonClasses, cn, Input, Textarea } from "@/components/ui";
import { historialVehiculo } from "@/lib/taller/datos.server";
import { guardarVehiculo } from "@/lib/taller/acciones";
import { fechaCorta, pesos, totales, yaPaso, type EstadoOrden } from "@/lib/taller/core";
import { ChipEstado, Patente, tarjeta } from "../../_vista";
import { BotonEnviar } from "../../_piezas";

export const dynamic = "force-dynamic";
export const metadata = { title: "Taller · Historial del auto" };

const etiqueta = "mb-1 block text-sm font-semibold text-strong";
const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");
const ETIQUETAS = ["particular", "flota", "empresa", "VIP"];

export default async function VehiculoPage({ params }: { params: Promise<{ id: string }> }) {
  await requireApp("taller");
  const { id } = await params;
  const data = await historialVehiculo(id);
  if (!data) notFound();
  const { vehiculo: v, conPlata } = data;
  const otros = v.client.tallerVehiculos.filter((o) => o.id !== v.id);
  const gastado = v.ordenes.filter((o) => o.estado === "ENTREGADO").reduce((s, o) => s + totales(o.items).aprobado, 0);

  return (
    <main className="mx-auto grid grid-cols-1 w-full max-w-3xl gap-4 px-4 py-5">
      <Link href="/admin/taller/vehiculos" className="text-sm underline">← Autos y clientes</Link>

      <header className={cn(tarjeta, "grid grid-cols-1 gap-2")}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Patente valor={v.patente} grande />
          <Link href={`/admin/taller/ingreso?patente=${v.patente}`} className={buttonClasses("solid", "md")}>+ Ingresar este auto</Link>
        </div>
        <h1 className="text-xl font-bold text-strong">{`${v.marca} ${v.modelo}`.trim() || "Vehículo"}{v.anio ? ` (${v.anio})` : ""}</h1>
        <p className="text-sm">
          <span className="font-semibold text-strong">{v.client.name}</span> <span className="text-muted">· {v.client.phone}</span>
        </p>
        <p className="text-sm text-muted">
          {v.ordenes.length} {v.ordenes.length === 1 ? "visita" : "visitas"}
          {conPlata && gastado > 0 && ` · lleva gastados ${pesos(gastado)}`}
          {v.km != null && ` · ${v.km.toLocaleString("es-AR")} km`}
        </p>
        {otros.length > 0 && (
          <p className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted">Sus otros autos:</span>
            {otros.map((o) => (
              <Link key={o.id} href={`/admin/taller/vehiculos/${o.id}`} className="flex min-h-11 items-center gap-1.5 underline">
                <Patente valor={o.patente} /> {o.modelo}
              </Link>
            ))}
          </p>
        )}
      </header>

      <section className={tarjeta} aria-label="Historial">
        <h2 className="mb-3 text-lg font-bold text-strong">Historial</h2>
        {v.ordenes.length === 0 ? (
          <p className="text-sm text-muted">Todavía no tiene trabajos.</p>
        ) : (
          <ol className="grid grid-cols-1 gap-2">
            {v.ordenes.map((o) => {
              const t = totales(o.items);
              return (
                <li key={o.id}>
                  <Link href={`/admin/taller/orden/${o.id}`} className="grid grid-cols-1 gap-1 rounded-xl border border-line p-3">
                    <span className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold text-strong">{fechaCorta(o.createdAt)} · Orden #{o.numero}</span>
                      <ChipEstado estado={o.estado as EstadoOrden} />
                    </span>
                    <span className="text-sm">
                      {o.items.filter((i) => i.decision === "APROBADO").map((i) => i.descripcion).join(" · ") || o.problema || "Sin detalle"}
                    </span>
                    <span className="text-sm text-muted">
                      {o.km != null && `${o.km.toLocaleString("es-AR")} km`}
                      {conPlata && t.aprobado > 0 && ` · ${pesos(t.aprobado)}`}
                      {o.garantiaHasta && !yaPaso(o.garantiaHasta) && ` · en garantía hasta el ${fechaCorta(o.garantiaHasta)}`}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      {conPlata && (
        <section className={tarjeta} aria-label="Datos del auto y del cliente">
          <h2 className="mb-3 text-lg font-bold text-strong">Datos y recordatorios</h2>
          <form action={guardarVehiculo} className="grid grid-cols-1 gap-3">
            <input type="hidden" name="id" value={v.id} />
            <div className="grid grid-cols-2 gap-3">
              <div><label htmlFor="marca" className={etiqueta}>Marca</label><Input id="marca" name="marca" defaultValue={v.marca} className="h-12" /></div>
              <div><label htmlFor="modelo" className={etiqueta}>Modelo</label><Input id="modelo" name="modelo" defaultValue={v.modelo} className="h-12" /></div>
              <div><label htmlFor="anio" className={etiqueta}>Año</label><Input id="anio" name="anio" inputMode="numeric" defaultValue={v.anio ?? ""} className="h-12" /></div>
              <div><label htmlFor="color" className={etiqueta}>Color</label><Input id="color" name="color" defaultValue={v.color ?? ""} className="h-12" /></div>
              <div><label htmlFor="km" className={etiqueta}>Kilómetros</label><Input id="km" name="km" inputMode="numeric" defaultValue={v.km ?? ""} className="h-12" /></div>
              <div><label htmlFor="vtvVence" className={etiqueta}>Vence la VTV</label><Input id="vtvVence" name="vtvVence" type="date" defaultValue={iso(v.vtvVence)} className="h-12" /></div>
              <div><label htmlFor="proximoServiceKm" className={etiqueta}>Próximo service (km)</label><Input id="proximoServiceKm" name="proximoServiceKm" inputMode="numeric" defaultValue={v.proximoServiceKm ?? ""} className="h-12" /></div>
              <div><label htmlFor="proximoServiceFecha" className={etiqueta}>…o por fecha</label><Input id="proximoServiceFecha" name="proximoServiceFecha" type="date" defaultValue={iso(v.proximoServiceFecha)} className="h-12" /></div>
            </div>
            <div>
              <label htmlFor="notas" className={etiqueta}>Notas</label>
              <Textarea id="notas" name="notas" rows={2} defaultValue={v.notas ?? ""} placeholder="Correa cambiada a los 60.000 km, usa aceite 5W30…" />
            </div>
            <fieldset>
              <legend className={etiqueta}>Tipo de cliente</legend>
              <div className="flex flex-wrap gap-x-4">
                {ETIQUETAS.map((e) => (
                  <label key={e} className="flex min-h-11 items-center gap-2 text-sm capitalize">
                    <input type="checkbox" name="etiquetas" value={e} defaultChecked={v.client.tallerEtiquetas.includes(e)} className="size-5" /> {e}
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input type="checkbox" name="ctaCte" defaultChecked={v.client.tallerCtaCte} className="size-5" />
              Tiene cuenta corriente (puede llevarse el auto y pagar después)
            </label>
            <BotonEnviar pendingText="Guardando…" variant="solid" size="lg" className="justify-center">Guardar</BotonEnviar>
          </form>
        </section>
      )}
    </main>
  );
}
