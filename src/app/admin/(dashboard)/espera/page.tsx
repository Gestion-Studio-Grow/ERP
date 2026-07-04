import {
  getWaitlist,
  getWaitlistFormData,
  addToWaitlist,
  markWaitlistNotified,
  cancelWaitlistEntry,
} from "@/lib/waitlist-actions";
import { fmtShortDate, nextBusinessDays } from "@/lib/datetime";
import EntryBooking from "./EntryBooking";

export const dynamic = "force-dynamic";

export default async function EsperaPage() {
  // getWaitlist aplica requireCapability("waitlist:manage") — es el guard de la página.
  const [entries, { services, professionals }] = await Promise.all([
    getWaitlist(),
    getWaitlistFormData(),
  ]);
  const dates = nextBusinessDays(30);

  return (
    <main className="mx-auto max-w-4xl px-6 py-8">
      <h1 className="text-2xl font-semibold mb-1">Lista de espera</h1>
      <p className="text-neutral-500 mb-8">
        Anotá a quien quiere un turno cuando no hay horario. Cuando se libere un lugar (una
        cancelación o una reprogramación), buscá un hueco y reservalo con un clic.
      </p>

      {/* Alta */}
      <form
        action={addToWaitlist}
        className="rounded-lg border p-4 mb-8 grid gap-3 sm:grid-cols-2"
      >
        <div className="sm:col-span-2 text-sm font-medium text-neutral-700">Anotar a alguien</div>

        <label className="text-sm">
          <span className="block text-neutral-500 mb-1">Nombre *</span>
          <input name="clientName" required className="w-full rounded-md border px-2 py-1.5" />
        </label>
        <label className="text-sm">
          <span className="block text-neutral-500 mb-1">Teléfono *</span>
          <input name="clientPhone" required className="w-full rounded-md border px-2 py-1.5" />
        </label>

        <label className="text-sm">
          <span className="block text-neutral-500 mb-1">Email (opcional)</span>
          <input name="clientEmail" type="email" className="w-full rounded-md border px-2 py-1.5" />
        </label>
        <label className="text-sm">
          <span className="block text-neutral-500 mb-1">Servicio *</span>
          <select name="serviceId" required className="w-full rounded-md border px-2 py-1.5">
            <option value="">Elegí un servicio…</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm">
          <span className="block text-neutral-500 mb-1">Profesional preferido</span>
          <select name="professionalId" className="w-full rounded-md border px-2 py-1.5">
            <option value="">Cualquiera</option>
            {professionals.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="block text-neutral-500 mb-1">Preferencia de día/horario</span>
          <input
            name="preferenceNote"
            placeholder="ej: martes o jueves por la tarde"
            className="w-full rounded-md border px-2 py-1.5"
          />
        </label>

        <label className="text-sm sm:col-span-2">
          <span className="block text-neutral-500 mb-1">Nota interna (opcional)</span>
          <input name="notes" className="w-full rounded-md border px-2 py-1.5" />
        </label>

        <div className="sm:col-span-2">
          <button
            type="submit"
            className="rounded-md bg-black text-white px-4 py-2 text-sm font-medium"
          >
            Anotar en la lista
          </button>
        </div>
      </form>

      {/* Listado */}
      <div className="space-y-3">
        {entries.map((e) => (
          <div key={e.id} className="rounded-lg border p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm">{e.clientName}</span>
                  <span className="text-xs text-neutral-400">· {e.clientPhone}</span>
                  {e.status === "NOTIFIED" && (
                    <span className="rounded-full bg-amber-100 text-amber-800 px-2 py-0.5 text-[11px] font-medium">
                      Avisado
                    </span>
                  )}
                </div>
                <p className="text-sm text-neutral-600 mt-1">
                  {e.service.name}
                  {" · "}
                  {e.professional ? e.professional.name : "cualquier profesional"}
                </p>
                {e.preferenceNote && (
                  <p className="text-xs text-neutral-500 mt-0.5">Prefiere: {e.preferenceNote}</p>
                )}
                {e.notes && <p className="text-xs text-neutral-400 mt-0.5">{e.notes}</p>}
                <p className="text-xs text-neutral-400 mt-1">Anotado el {fmtShortDate(e.createdAt)}</p>
              </div>

              <div className="flex flex-col gap-2 items-stretch sm:items-end whitespace-nowrap">
                {e.status === "WAITING" && (
                  <form action={markWaitlistNotified}>
                    <input type="hidden" name="id" value={e.id} />
                    <button type="submit" className="chip-btn text-xs min-h-8 w-full sm:w-auto">
                      Marcar avisado
                    </button>
                  </form>
                )}
                <form action={cancelWaitlistEntry}>
                  <input type="hidden" name="id" value={e.id} />
                  <button
                    type="submit"
                    className="chip-btn chip-btn-danger text-xs min-h-8 w-full sm:w-auto"
                  >
                    Quitar
                  </button>
                </form>
              </div>
            </div>

            <EntryBooking entryId={e.id} dates={dates} />
          </div>
        ))}

        {entries.length === 0 && (
          <p className="text-sm text-neutral-500">
            La lista de espera está vacía. Anotá a alguien arriba cuando no tengas horario para
            ofrecerle.
          </p>
        )}
      </div>
    </main>
  );
}
