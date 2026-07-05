"use client";

import { useState, useTransition } from "react";
import { getAvailableSlots } from "@/lib/actions";
import { rescheduleMyAppointment } from "@/lib/client-actions";
import SubmitButton from "@/components/SubmitButton";
import { fmtTime } from "@/lib/datetime";

// El cliente reprograma su propio turno a otra fecha/hora (mismo profesional y
// servicio). Reusa getAvailableSlots pasando el id del turno para no mostrar su
// propia franja como ocupada; la validación real es server-side
// (rescheduleMyAppointment).
export default function RescheduleButton({
  appointmentId,
  professionalId,
  serviceId,
}: {
  appointmentId: string;
  professionalId: string;
  serviceId: string;
}) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState("");
  const [slots, setSlots] = useState<string[]>([]);
  const [selectedSlot, setSelectedSlot] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");

  function loadSlots(nextDate: string) {
    setSlots([]);
    setSelectedSlot("");
    if (!nextDate) return;
    startTransition(async () => {
      const result = await getAvailableSlots(professionalId, serviceId, nextDate, appointmentId);
      setSlots(result);
    });
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mb-3 mr-3 rounded-md border px-4 py-2 text-sm font-medium hover:bg-neutral-50"
        style={{ borderColor: "var(--line-strong)", color: "var(--text-strong)" }}
      >
        Reprogramar turno
      </button>
    );
  }

  return (
    <div
      className="mb-6 rounded-lg p-4"
      style={{ background: "var(--surface-sunken)", color: "var(--text-strong)" }}
    >
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-medium">Elegí un nuevo horario</p>
        <button
          onClick={() => {
            setOpen(false);
            setDate("");
            setSlots([]);
            setSelectedSlot("");
            setError("");
          }}
          className="text-sm"
          style={{ color: "var(--text-muted)" }}
        >
          Cerrar
        </button>
      </div>

      <form
        action={async (fd) => {
          setError("");
          try {
            await rescheduleMyAppointment(fd);
            setOpen(false);
          } catch (err) {
            setError(err instanceof Error ? err.message : "No se pudo reprogramar.");
          }
        }}
        className="space-y-3"
      >
        <input type="hidden" name="id" value={appointmentId} />

        <input
          type="date"
          required
          value={date}
          onChange={(e) => {
            setDate(e.target.value);
            loadSlots(e.target.value);
          }}
          className="w-full rounded-md border px-3 py-2 text-sm"
          style={{ borderColor: "var(--line-strong)" }}
        />

        {date && (
          <div>
            {isPending && <p className="text-sm" style={{ color: "var(--text-muted)" }}>Buscando horarios…</p>}
            {!isPending && slots.length === 0 && (
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                No hay horarios disponibles ese día.
              </p>
            )}
            <div className="grid grid-cols-4 gap-2">
              {slots.map((slot) => {
                const isSelected = slot === selectedSlot;
                return (
                  <button
                    key={slot}
                    type="button"
                    onClick={() => setSelectedSlot(slot)}
                    className={`rounded-md border px-2 py-1.5 text-sm ${isSelected ? "text-white" : "bg-white"}`}
                    style={
                      isSelected
                        ? { background: "var(--text-strong)", borderColor: "var(--text-strong)" }
                        : { borderColor: "var(--line-strong)" }
                    }
                  >
                    {fmtTime(slot)}
                  </button>
                );
              })}
            </div>
            <input type="hidden" name="startsAt" value={selectedSlot} />
          </div>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}

        {selectedSlot && (
          <SubmitButton
            pendingText="Reprogramando…"
            className="w-full rounded-md py-2 text-sm font-medium text-white bg-[color:var(--text-strong)]"
          >
            Confirmar nuevo horario
          </SubmitButton>
        )}
      </form>
    </div>
  );
}
