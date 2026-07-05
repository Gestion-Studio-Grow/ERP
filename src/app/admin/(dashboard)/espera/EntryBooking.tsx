"use client";

import { useState, useTransition } from "react";
import { findSlotsForWaitlistEntry, bookFromWaitlist } from "@/lib/waitlist-actions";
import { fmtTime } from "@/lib/datetime";
import { Select, buttonClasses } from "@/components/ui";

type SlotGroup = { professionalId: string; professionalName: string; slots: string[] };

// Widget por anotado: elige una fecha, busca huecos reales para su servicio
// (respetando profesional preferido si lo hay) y reserva con un clic. La reserva
// en sí es un form con Server Action (bookFromWaitlist) — al confirmar,
// revalidatePath refresca la lista y el anotado desaparece (pasa a BOOKED).
export default function EntryBooking({
  entryId,
  dates,
}: {
  entryId: string;
  dates: { value: string; label: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState("");
  const [groups, setGroups] = useState<SlotGroup[] | null>(null);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function search(nextDate: string) {
    setDate(nextDate);
    setGroups(null);
    setError("");
    if (!nextDate) return;
    startTransition(async () => {
      try {
        const res = await findSlotsForWaitlistEntry(entryId, nextDate);
        setGroups(res);
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudieron buscar horarios.");
      }
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="chip-btn text-xs min-h-8"
      >
        Buscar horario
      </button>
    );
  }

  return (
    <div className="mt-3 w-full rounded-md border border-line bg-surface-sunken p-3">
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-xs font-medium text-body">Buscar un hueco y reservar</span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-faint hover:underline"
        >
          Cerrar
        </button>
      </div>

      <Select
        value={date}
        onChange={(e) => search(e.target.value)}
        className="mb-2"
      >
        <option value="">Elegí un día…</option>
        {dates.map((d) => (
          <option key={d.value} value={d.value}>
            {d.label}
          </option>
        ))}
      </Select>

      {isPending && <p className="text-xs text-muted">Buscando horarios…</p>}
      {error && <p className="text-xs text-danger">{error}</p>}

      {!isPending && groups !== null && groups.length === 0 && (
        <p className="text-xs text-muted">
          No hay horarios libres ese día para este servicio. Probá otro día.
        </p>
      )}

      {!isPending &&
        groups?.map((g) => (
          <div key={g.professionalId} className="mb-2 last:mb-0">
            <p className="text-xs text-muted mb-1">{g.professionalName}</p>
            <div className="flex flex-wrap gap-1.5">
              {g.slots.map((slot) => (
                <form key={slot} action={bookFromWaitlist}>
                  <input type="hidden" name="entryId" value={entryId} />
                  <input type="hidden" name="professionalId" value={g.professionalId} />
                  <input type="hidden" name="startsAt" value={slot} />
                  <button
                    type="submit"
                    className={buttonClasses("outline", "sm")}
                    title="Reservar este horario para el anotado"
                  >
                    {fmtTime(slot)}
                  </button>
                </form>
              ))}
            </div>
          </div>
        ))}
    </div>
  );
}
