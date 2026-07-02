import { getReviews, togglePublished, deleteReview } from "@/lib/reviews-actions";
import { fmtShortDate } from "@/lib/datetime";

export const dynamic = "force-dynamic";

function Stars({ rating }: { rating: number }) {
  return (
    <span className="text-amber-500 tracking-tight">
      {"★".repeat(rating)}
      <span className="text-neutral-300">{"★".repeat(5 - rating)}</span>
    </span>
  );
}

export default async function ResenasPage() {
  const reviews = await getReviews();

  return (
    <main className="mx-auto max-w-4xl px-6 py-8">
      <h1 className="text-2xl font-semibold mb-1">Reseñas</h1>
      <p className="text-neutral-500 mb-8">
        Publicá las reseñas que quieras mostrar en la web. Por defecto quedan ocultas hasta que las
        apruebes.
      </p>

      <div className="space-y-3">
        {reviews.map((r) => (
          <div key={r.id} className="rounded-lg border p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Stars rating={r.rating} />
                  <span className="font-medium text-sm">{r.clientName}</span>
                  <span className="text-xs text-neutral-400">· {r.professional.name}</span>
                </div>
                {r.comment && <p className="text-sm text-neutral-600 mb-1">{r.comment}</p>}
                <p className="text-xs text-neutral-400">
                  {fmtShortDate(r.createdAt)}
                </p>
              </div>
              <div className="flex flex-col gap-2 items-end whitespace-nowrap">
                <form action={togglePublished}>
                  <input type="hidden" name="id" value={r.id} />
                  <input type="hidden" name="published" value={String(r.published)} />
                  <button
                    type="submit"
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      r.published ? "bg-emerald-100 text-emerald-800" : "bg-neutral-200 text-neutral-600"
                    }`}
                  >
                    {r.published ? "Publicada" : "Oculta"}
                  </button>
                </form>
                <form action={deleteReview}>
                  <input type="hidden" name="id" value={r.id} />
                  <button type="submit" className="text-xs text-red-600 hover:underline">
                    Eliminar
                  </button>
                </form>
              </div>
            </div>
          </div>
        ))}
        {reviews.length === 0 && (
          <p className="text-sm text-neutral-500">
            Todavía no hay reseñas. Van a aparecer acá cuando los clientes las dejen después de un
            turno completado.
          </p>
        )}
      </div>
    </main>
  );
}
