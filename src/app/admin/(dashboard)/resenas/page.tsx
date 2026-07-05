import { getReviews, togglePublished, deleteReview } from "@/lib/reviews-actions";
import { fmtShortDate } from "@/lib/datetime";

export const dynamic = "force-dynamic";

function Stars({ rating }: { rating: number }) {
  return (
    <span className="text-warning tracking-tight">
      {"★".repeat(rating)}
      <span className="text-faint">{"★".repeat(5 - rating)}</span>
    </span>
  );
}

export default async function ResenasPage() {
  const reviews = await getReviews();

  return (
    <main className="mx-auto max-w-4xl px-6 py-8">
      <h1 className="text-2xl font-semibold mb-1">Reseñas</h1>
      <p className="text-muted mb-8">
        Publicá las reseñas que quieras mostrar en la web. Por defecto quedan ocultas hasta que las
        apruebes.
      </p>

      <div className="space-y-3">
        {reviews.map((r) => (
          <div key={r.id} className="rounded-lg border border-line p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
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
                <form action={togglePublished}>
                  <input type="hidden" name="id" value={r.id} />
                  <input type="hidden" name="published" value={String(r.published)} />
                  <button
                    type="submit"
                    className={`w-full sm:w-auto rounded-full px-3 py-1.5 text-xs font-medium ${
                      r.published ? "bg-success-soft text-success" : "bg-surface-sunken text-muted"
                    }`}
                  >
                    {r.published ? "Publicada" : "Oculta"}
                  </button>
                </form>
                <form action={deleteReview}>
                  <input type="hidden" name="id" value={r.id} />
                  <button type="submit" className="chip-btn chip-btn-danger w-full sm:w-auto text-xs min-h-8">
                    Eliminar
                  </button>
                </form>
              </div>
            </div>
          </div>
        ))}
        {reviews.length === 0 && (
          <p className="text-sm text-muted">
            Todavía no hay reseñas. Van a aparecer acá cuando los clientes las dejen después de un
            turno completado.
          </p>
        )}
      </div>
    </main>
  );
}
