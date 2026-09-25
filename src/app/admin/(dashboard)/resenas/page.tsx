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
import MasDeResena from "./MasDeResena";
import { disenoNuevo } from "@/lib/diseno/diseno.server";
import { Marca, Renglon, buttonClasses } from "@/components/ui";

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
  const [reviews, piloto, negocio, nuevo] = await Promise.all([getReviews(), enInicioPorApps(), getNegocioApps(user.role), disenoNuevo()]);
  const resumen = piloto
    ? resumirResenasDeLista(
        reviews.map((r) => ({ rating: r.rating, published: r.published, professionalId: r.professionalId, profesional: r.professional.name })),
      )
    : null;

  // DISEÑO NUEVO («Renglón»): primero las que esperan tu OK, después las publicadas; un renglón
  // por reseña, «Publicar/Ocultar» a la mano y «Eliminar» al «⋯» con confirmación. Mismos datos.
  if (nuevo) {
    const vacio = (
      <PasoVacio paso={vacioDeResenas({ piloto, bandejaPermitida: appPermitida(appPorId("para-contactar-hoy"), negocio) })} />
    );
    const sinPublicar = reviews.filter((r) => !r.published);
    const publicadas = reviews.filter((r) => r.published);
    const promedio = reviews.length > 0 ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : null;
    const libro = (lista: typeof reviews, titulo: string, nota: string) =>
      lista.length > 0 && (
        <section aria-label={titulo} className="mb-6">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 border-b border-line-strong pb-2">
            <h2 className="text-[15px] font-semibold text-strong">{titulo}</h2>
            <span className="text-[13px] text-muted">{nota}</span>
          </div>
          <ul>
            {lista.map((r) => (
              <Renglon
                as="li"
                key={r.id}
                className="items-start py-2.5"
                folio={<span className="block w-[4.5rem] tabular-nums">{fmtShortDate(r.createdAt)}</span>}
                titulo={
                  <span className="flex flex-wrap items-baseline gap-x-2">
                    <span aria-label={`${r.rating} de 5`}>
                      <Stars rating={r.rating} />
                    </span>
                    <span className="font-medium">{r.clientName}</span>
                    <span className="text-[13px] text-muted">{`con ${r.professional.name}`}</span>
                  </span>
                }
                detalle={r.comment ? <span className="text-body">{r.comment}</span> : "Sin comentario, sólo las estrellas."}
                plata={r.published ? <Marca tipo="hecho">En la web</Marca> : <Marca tipo="pendiente">Oculta</Marca>}
                tecla={
                  <span className="inline-flex items-center gap-1">
                    <form action={togglePublished}>
                      <input type="hidden" name="id" value={r.id} />
                      <input type="hidden" name="published" value={String(r.published)} />
                      <button type="submit" className={buttonClasses(r.published ? "outline" : "solid", "md", "min-h-11 min-w-[6.5rem]")}>
                        {r.published ? "Ocultar" : "Publicar"}
                      </button>
                    </form>
                    <MasDeResena id={r.id} cliente={r.clientName} />
                  </span>
                }
              />
            ))}
          </ul>
        </section>
      );
    return (
      <main data-ui="pagina" className="mx-auto w-full max-w-4xl px-4 py-6">
        <header data-ui="page-header" className="mb-4">
          <h1 className="text-2xl font-bold text-strong">Reseñas</h1>
          <p className="mt-1 text-sm text-muted">
            {promedio === null ? (
              "Todavía no hay reseñas."
            ) : (
              <>
                <strong className="text-strong">{`${fmtNumberAR(promedio, 1)}★ de promedio`}</strong>
                {` · ${fmtNumberAR(reviews.length)} ${reviews.length === 1 ? "reseña" : "reseñas"}`}
                {sinPublicar.length > 0 && ` · ${fmtNumberAR(sinPublicar.length)} esperan tu OK para salir en la web`}
              </>
            )}
          </p>
        </header>
        {resumen && resumen.porProfesional.length > 1 && (
          <p className="mb-4 text-[13px] text-muted tabular-nums">
            {resumen.porProfesional.map((p) => `${p.profesional} ${fmtNumberAR(p.promedio, 1)}★ (${p.cantidad})`).join(" · ")}
          </p>
        )}
        {libro(sinPublicar, "Para revisar", "no salen en la web hasta que las publiques")}
        {libro(publicadas, "Publicadas", "se ven en la web")}
        {reviews.length === 0 && vacio}
      </main>
    );
  }

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
