// MIA-50 T09 · O05 y O04: la fecha prevista y la real de cada etapa, y la salida «cancelado» con lo que queda por resolver.
// Sin M7b (Gate 2), la sección avisa en vez de caerse; la marca de cancelado vive en el proyecto igual.

import { prisma } from "@/lib/prisma";
import { buttonClasses, cn } from "@/components/ui";
import { fechaCorta } from "@/lib/proyectos/core";
import { esCancelado, motivoDeCancelacion } from "@/lib/proyectos/cancelacion-core";
import { cancelacionDe, fechasDeEtapas } from "@/lib/proyectos/etapas-m7b.server";
import { guardarFechasPrevistas } from "@/lib/proyectos/acciones-etapas";
import { puede, type Actor } from "@/lib/proyectos/gestion.server";
import { valorDelNegocio } from "@/lib/proyectos/parametros/leer.server";
import { campo, tarjeta } from "../_vista";
import { FormAccion } from "./_cliente";
import { CancelarProyecto } from "./_etapas-cliente";

const paraElCampo = (d: Date | null) => (d ? new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Argentina/Buenos_Aires" }).format(d) : "");

export async function SeccionEtapas({ a, proyecto }: { a: Actor; proyecto: { id: string; perdidoEl: Date | null; motivoPerdida: string | null } }) {
  const { tenantId } = a;
  const lista = await valorDelNegocio(tenantId, "etapas.lista");
  const cancelado = !!proyecto.perdidoEl && esCancelado(proyecto.motivoPerdida);
  const [fechas, cancelacion, aprobada] = await Promise.all([
    fechasDeEtapas(tenantId, proyecto.id, lista),
    cancelado ? cancelacionDe(tenantId, proyecto.id) : null,
    prisma.proyectoPresupuesto.count({ where: { tenantId, proyectoId: proyecto.id, estado: "APROBADO" } }),
  ]);
  const edita = puede(a, "pipeline", "editar");
  const puedeCancelar = edita && a.rol === "DIRECCION" && !proyecto.perdidoEl && aprobada > 0;

  return (
    <section className={cn(tarjeta, "mb-4 grid gap-3")} aria-labelledby="etapas-fechas">
      <h2 id="etapas-fechas" className="font-semibold text-strong">Fechas por etapa</h2>
      {!fechas ? (
        <p className="text-sm text-muted">Las fechas por etapa todavía no están habilitadas en tu negocio.</p>
      ) : (
        <FormAccion accion={guardarFechasPrevistas} className="grid gap-3">
          <input type="hidden" name="id" value={proyecto.id} />
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {fechas.map(({ etapa, prevista, real }) => (
              <li key={etapa.id} className="grid gap-1 rounded-lg border border-line p-3 text-sm">
                <span className="font-medium text-strong">{etapa.nombre}</span>
                <label className="grid gap-1 text-muted">
                  Prevista
                  <input type="date" name={`prevista-${etapa.id}`} defaultValue={paraElCampo(prevista)} disabled={!edita} className={campo} />
                </label>
                <span className="text-muted">Real: <span className="text-strong">{real ? fechaCorta(real) : "todavía no"}</span></span>
              </li>
            ))}
          </ul>
          {edita && <button type="submit" className={cn(buttonClasses("outline", "md"), "justify-self-start")}>Guardar fechas previstas</button>}
        </FormAccion>
      )}

      {cancelado && (
        <div className="grid gap-2 border-t border-line pt-3 text-sm" role="note">
          <p className="font-semibold text-danger">Cancelado: {motivoDeCancelacion(proyecto.motivoPerdida!)}</p>
          {cancelacion && (
            <>
              <p className="text-muted">
                Lo canceló {cancelacion.autorNombre} el {fechaCorta(cancelacion.canceladoEl)}. Cuotas pendientes anuladas: {cancelacion.cuotasAnuladas}.
              </p>
              <p className="font-medium text-strong">Lo que queda por resolver a mano</p>
              <ul className="list-disc pl-5 text-strong">
                {cancelacion.pendientes.map((x) => <li key={x}>{x}</li>)}
              </ul>
            </>
          )}
        </div>
      )}
      {puedeCancelar && (
        <div className="border-t border-line pt-3">
          <CancelarProyecto id={proyecto.id} />
        </div>
      )}
    </section>
  );
}
