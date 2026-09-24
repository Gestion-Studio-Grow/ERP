import { getReviews, togglePublished } from "@/lib/reviews-actions";
import { fmtShortDate } from "@/lib/datetime";
import { requireApp } from "@/lib/require-app";
import { fmtNumberAR } from "@/components/ui";
import { resumirResenasDeLista, type ResumenResenas } from "@/lib/crm/resenas";
import { enInicioPorApps } from "../inicio/piloto";
import { appPermitida } from "@/apps/visibles";
import { appPorId } from "@/apps/registro";
import { getNegocioApps } from "@/apps/contexto.server";
import PasoVacio from "../turnos/PasoVacio";
import EliminarResena from "./EliminarResena";
import { vacioDeResenas } from "./vacio";

export const dynamic = "force-dynamic";

function Stars({ rating }: { rating: number }) {
  return (
    <span className="text-warning tracking-tight">
      {"★".repeat(rating)}
      <span className="text-faint">{"★".repeat(5 - rating)}</span>
    </span>
  );
}

// Promedio y desglose por profesional (Inicio por apps). Sale de la MISMA lista que se muestra
// abajo, así el promedio coincide con el número de Reseñas en el Inicio.
function ResumenDeResenas({ r }: { r: ResumenResenas }) {
  if (r.total === 0 || r.promedio === null) return null;
  return (
    <section className="mb-8 rounded-lg border border-line bg-surface-raised p-4">
      <p className="text-2xl font-semibold text-strong">
        {fmtNumberAR(r.promedio, 1)}★ <span className="text-base font-normal text-muted">promedio de {r.total}</span>
      </p>
      {r.sinPublicar > 0 && (
        <p className="text-sm text-muted">
          {r.sinPublicar} sin publicar: revisalas abajo y publicá las que quieras mostrar en la web.
        </p>
      )}
      <ul className="mt-3 divide-y divide-line/60 text-sm">
        {r.porProfesional.map((p) => (
          <li key={p.professionalId} className="flex items-center justify-between gap-3 py-2">
            <span className="text-strong">{p.profesional}</span>
            <span className="tabular-nums text-muted">
              {fmtNumberAR(p.promedio, 1)}★ · {p.cantidad} {p.cantidad === 1 ? "reseña" : "reseñas"}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default async function ResenasPage() {
  const user = await requireApp("resenas");
  const [reviews, piloto, negocio] = await Promise.all([getReviews(), enInicioPorApps(), getNegocioApps(user.role)]);
  const resumen = piloto
    ? resumirResenasDeLista(
        reviews.map((r) => ({ rating: r.rating, published: r.published, professionalId: r.professionalId, profesional: r.professional.name })),
      )
    : null;

  return (
    <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
      <h1 className="text-2xl font-semibold mb-1">Reseñas</h1>
      <p className="text-muted mb-8">
        Publicá las reseñas que quieras mostrar en la web. Por defecto quedan ocultas hasta que las
        apruebes.
      </p>

      {resumen && <ResumenDeResenas r={resumen} />}

      <div className="space-y-3">
        {reviews.map((r) => (
          <div key={r.id} className="rounded-lg border border-line p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <Stars rating={r.rating} />
                  <span className="font-medium text-sm">{r.clientName}</span>
                  <span className="text-xs text-faint">· {r.professional.name}</span>
                </div>
                {r.comment && <p className="text-sm text-body mb-1">{r.comment}</p>}
                <p className="text-xs text-faint">
                  {fmtShortDate(r.createdAt)}
                </p>
              </div>
              <div className="flex flex-col gap-2 items-stretch sm:items-end whitespace-nowrap">
                <span
                  className={`inline-flex w-full items-center justify-center rounded-full px-3 py-1 text-xs font-medium sm:w-auto ${
                    r.published ? "bg-success-soft text-success" : "bg-surface-sunken text-muted"
                  }`}
                >
                  {r.published ? "Publicada" : "Oculta"}
                </span>
                <form action={togglePublished}>
                  <input type="hidden" name="id" value={r.id} />
                  <input type="hidden" name="published" value={String(r.published)} />
                  <button type="submit" className="chip-btn w-full text-xs min-h-8 sm:w-auto max-sm:min-h-11!">
                    {r.published ? "Ocultar" : "Publicar"}
                  </button>
                </form>
                <EliminarResena id={r.id} cliente={r.clientName} />
              </div>
            </div>
          </div>
        ))}
        {reviews.length === 0 && (
          // El siguiente paso es pedirlas desde la bandeja, sólo en el piloto y si esta persona la
          // puede abrir (vacio.ts): en CH la bandeja no está en la barra.
          <PasoVacio
            paso={vacioDeResenas({
              piloto,
              bandejaPermitida: appPermitida(appPorId("para-contactar-hoy"), negocio),
            })}
          />
        )}
      </div>
    </main>
  );
}
