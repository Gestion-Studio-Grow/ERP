// TALLER DE STANDS (GSG-MIA-004 · T3) — sección «Horas» de la pestaña Despiece: carga de horas por persona, la lista
// y la mano de obra teórica (horas estándar del despiece) contra la real (horas × valor congelado), con el desvío.
// Sólo se monta con el taller activo, igual que el despiece. Server component: los formularios llaman server actions.
import { randomUUID } from "node:crypto";
import Link from "next/link";
import { Button, EmptyState } from "@/components/ui";
import { pesos } from "@/lib/proyectos/core";
import { costoManoObraReal, costoManoObraTeorico, desvio, horasReales, horasTeoricas, valorHoraReferencia, valorHoraVigente } from "@/lib/taller-stands/horas";
import { horasDelProyecto, personasDelTaller, valoresHoraDelTaller } from "@/lib/taller-stands/datos.server";
import { borrarHoras, cargarHoras } from "@/lib/taller-stands/acciones";
import { campo, etiqueta, tarjeta } from "../_vista";

const fechaCorta = (d: Date) => d.toLocaleDateString("es-AR", { timeZone: "UTC" });
const hoyIso = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });

export async function SeccionHoras({ tenantId, proyectoId, edita }: { tenantId: string; proyectoId: string; edita: boolean }) {
  const [{ sinMigrar, cargas, horasStd }, valores, personas] = await Promise.all([horasDelProyecto(tenantId, proyectoId), valoresHoraDelTaller(tenantId), personasDelTaller(tenantId)]);
  if (sinMigrar || valores.sinMigrar) {
    return <EmptyState title="La carga de horas todavía no está habilitada" description="Falta un paso de instalación del taller. Ya está anotado; cuando esté, vas a poder cargar las horas de cada stand acá." />;
  }
  const hoy = new Date();
  const vigentes = personas.map((p) => valorHoraVigente(valores.valores.filter((v) => v.personaId === p.id), hoy));
  const referencia = valorHoraReferencia(vigentes);
  const hsStd = horasTeoricas(horasStd);
  const teorico = costoManoObraTeorico(hsStd, referencia);
  const real = costoManoObraReal(cargas);
  const d = teorico == null ? null : desvio(teorico, real);

  return (
    <section className={`${tarjeta} mt-4`} aria-labelledby="titulo-horas">
      <h2 id="titulo-horas" className="text-lg font-semibold text-strong">Horas del stand</h2>
      <p className="text-sm text-muted">Cada carga congela el valor hora de la persona en esa fecha. Es costo interno: nunca sale en el presupuesto para la productora.</p>

      <dl className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-line px-3 py-2">
          <dt className="text-xs text-muted">Teórico ({hsStd} h estándar)</dt>
          <dd className="font-semibold text-strong">{teorico == null ? "Sin valor hora de referencia" : pesos(teorico)}</dd>
        </div>
        <div className="rounded-lg border border-line px-3 py-2">
          <dt className="text-xs text-muted">Real ({horasReales(cargas)} h cargadas)</dt>
          <dd className="font-semibold text-strong">{pesos(real)}</dd>
        </div>
        <div className="rounded-lg border border-line px-3 py-2">
          <dt className="text-xs text-muted">Desvío (real − teórico)</dt>
          <dd className={`font-semibold ${d && d.monto > 0 ? "text-danger" : "text-strong"}`}>
            {d == null ? "—" : `${d.monto > 0 ? "+" : ""}${pesos(d.monto)}${d.pct == null ? "" : ` (${d.pct > 0 ? "+" : ""}${d.pct.toLocaleString("es-AR")} %)`}`}
          </dd>
        </div>
      </dl>
      <p className="mt-2 text-xs text-muted">
        El teórico usa como referencia el promedio de los valores hora vigentes{referencia == null ? "" : ` (${pesos(referencia)})`}. Criterio provisional, a confirmar.
      </p>

      {cargas.length === 0 ? (
        <p className="mt-4 text-sm">Todavía no cargaste horas en este stand.</p>
      ) : (
        <table className="mt-4 w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-muted">
              <th scope="col" className="py-2">Fecha</th>
              <th scope="col" className="py-2">Persona</th>
              <th scope="col" className="py-2 text-right">Horas</th>
              <th scope="col" className="py-2 text-right">Valor hora</th>
              <th scope="col" className="py-2 text-right">Costo</th>
              {edita && <th scope="col" className="py-2"><span className="sr-only">Acciones</span></th>}
            </tr>
          </thead>
          <tbody>
            {cargas.map((c) => (
              <tr key={c.id} className="border-b border-line">
                <td className="py-2">{fechaCorta(c.fecha)}</td>
                <td className="py-2">{c.persona}{c.nota && <span className="block text-xs text-muted">{c.nota}</span>}</td>
                <td className="py-2 text-right">{c.horas}</td>
                <td className="py-2 text-right">{pesos(c.valorHoraSnap)}</td>
                <td className="py-2 text-right">{pesos(costoManoObraReal([c]))}</td>
                {edita && (
                  <td className="py-2 text-right">
                    <form action={borrarHoras}>
                      <input type="hidden" name="proyectoId" value={proyectoId} />
                      <input type="hidden" name="id" value={c.id} />
                      <Button type="submit" variant="ghost" size="sm" aria-label={`Borrar ${c.horas} h de ${c.persona} del ${fechaCorta(c.fecha)}`}>Borrar</Button>
                    </form>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {edita && (
        personas.length === 0 ? (
          <p className="mt-4 text-sm">No hay personas cargadas en el equipo.</p>
        ) : (
          <form action={cargarHoras} className="mt-4 grid gap-3 sm:grid-cols-[1fr_10rem_6rem_1fr_auto] sm:items-end">
            <input type="hidden" name="proyectoId" value={proyectoId} />
            <input type="hidden" name="envioId" value={randomUUID()} />
            <label className={etiqueta}>
              Persona
              <select name="personaId" required className={campo}>
                {personas.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
            </label>
            <label className={etiqueta}>Fecha<input type="date" name="fecha" required defaultValue={hoyIso()} className={campo} /></label>
            <label className={etiqueta}>Horas<input name="horas" inputMode="decimal" required placeholder="8" className={campo} /></label>
            <label className={etiqueta}>Nota<input name="nota" maxLength={200} className={campo} placeholder="Opcional" /></label>
            <Button type="submit" variant="outline">Cargar horas</Button>
          </form>
        )
      )}
      <p className="mt-3 text-sm"><Link href="/admin/proyectos/taller/valores-hora" className="underline">Valor hora por persona</Link></p>
    </section>
  );
}
