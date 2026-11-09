// TALLER DE STANDS (GSG-MIA-004 · T2) — catálogo de piezas con costo interno. Sólo con el taller activo
// (flag + módulo + rubro) y para quien ve costos; si no, «no encontrado».
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireApp } from "@/lib/require-app";
import { Button, EmptyState } from "@/components/ui";
import { pesos } from "@/lib/proyectos/core";
import { exigirVer, puede } from "@/lib/proyectos/gestion.server";
import { piezasDelTaller, tallerActivo } from "@/lib/taller-stands/datos.server";
import { cambiarActivaPieza, guardarPieza } from "@/lib/taller-stands/acciones";
import { campo, etiqueta, tarjeta } from "../../_vista";

export const dynamic = "force-dynamic";
export const metadata = { title: "Catálogo de piezas" };

export default async function CatalogoPiezas({ searchParams }: { searchParams: Promise<{ aviso?: string }> }) {
  await requireApp("proyectos");
  const a = await exigirVer("cotizaciones");
  if (!puede(a, "costos", "ver") || !(await tallerActivo(a.tenantId))) notFound();
  const [{ aviso }, { sinMigrar, piezas }] = await Promise.all([searchParams, piezasDelTaller(a.tenantId)]);
  const edita = puede(a, "cotizaciones", "editar");
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-5">
      <Link href="/admin/proyectos" className="inline-flex min-h-11 items-center text-sm underline">← Proyectos</Link>
      <h1 className="mb-1 text-2xl font-bold text-strong">Catálogo de piezas</h1>
      <p className="mb-4 text-sm text-muted">Lo que el taller fabrica o compra para armar un stand, con su costo interno. Ese costo nunca sale en un presupuesto.</p>
      {aviso && <p role="status" className="mb-4 rounded-lg border border-line bg-surface px-3 py-2 text-sm">{aviso}</p>}

      {sinMigrar ? (
        <EmptyState title="El catálogo todavía no está habilitado" description="Falta un paso de instalación del taller. Ya está anotado; cuando esté, vas a poder cargar tus piezas acá." />
      ) : (
        <>
          {edita && (
            <form action={guardarPieza} className={`${tarjeta} mb-4 grid gap-3 sm:grid-cols-[1fr_6rem_9rem_7rem_auto] sm:items-end`}>
              <label className={etiqueta}>Pieza<input name="nombre" required maxLength={120} className={campo} placeholder="Panel MDF 18 mm" /></label>
              <label className={etiqueta}>Unidad<input name="unidad" maxLength={12} defaultValue="u" className={campo} /></label>
              <label className={etiqueta}>Costo unitario<input name="costoUnit" inputMode="decimal" required className={campo} placeholder="0" /></label>
              <label className={etiqueta}>Horas estándar<input name="horasStd" inputMode="decimal" defaultValue="0" className={campo} /></label>
              <Button type="submit">Agregar</Button>
            </form>
          )}
          {piezas.length === 0 ? (
            <EmptyState title="Todavía no hay piezas" description="Cargá la primera arriba: nombre, unidad y cuánto te cuesta." />
          ) : (
            <ul className="grid gap-2">
              {piezas.map((p) => (
                <li key={p.id} className={tarjeta}>
                  {edita ? (
                    <div className="grid gap-2">
                      <form action={guardarPieza} className="grid gap-3 sm:grid-cols-[1fr_6rem_9rem_7rem_auto] sm:items-end">
                        <input type="hidden" name="id" value={p.id} />
                        <label className={etiqueta}>Pieza<input name="nombre" required maxLength={120} defaultValue={p.nombre} className={campo} /></label>
                        <label className={etiqueta}>Unidad<input name="unidad" maxLength={12} defaultValue={p.unidad} className={campo} /></label>
                        <label className={etiqueta}>Costo unitario<input name="costoUnit" inputMode="decimal" required defaultValue={String(p.costoUnit)} className={campo} /></label>
                        <label className={etiqueta}>Horas estándar<input name="horasStd" inputMode="decimal" defaultValue={String(p.horasStd)} className={campo} /></label>
                        <Button type="submit" variant="outline">Guardar</Button>
                      </form>
                      <form action={cambiarActivaPieza} className="flex items-center gap-2 text-sm">
                        <input type="hidden" name="id" value={p.id} />
                        <input type="hidden" name="activa" value={p.activa ? "0" : "1"} />
                        <span className="text-muted">{p.activa ? "Activa" : "Dada de baja"}</span>
                        <Button type="submit" variant="ghost" size="sm">{p.activa ? "Dar de baja" : "Volver a activar"}</Button>
                      </form>
                    </div>
                  ) : (
                    <p className="text-sm"><span className="font-semibold text-strong">{p.nombre}</span> · {pesos(p.costoUnit)} / {p.unidad} · {p.horasStd} h{p.activa ? "" : " · dada de baja"}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </main>
  );
}
