"use client";

import { useEffect, useState, useTransition } from "react";
import { getAvailableSlots, getProfessionalsWithServices, rescheduleAppointment } from "@/lib/actions";
import SubmitButton from "@/components/SubmitButton";
import { fmtTime } from "@/lib/datetime";

type Professional = { id: string; name: string; box: { name: string } | null; services: { id: string }[] };

// Reprograma un turno existente: elige profesional (por defecto el actual, entre
// los que hacen ese servicio), fecha y una franja libre, y confirma. Reusa
// getAvailableSlots pasando el id del turno para que su propio horario no cuente
// como ocupado. La validación de choques real es server-side (rescheduleAppointment).
export default function RescheduleForm({
  appointmentId,
  serviceId,
  currentProfessionalId,
}: {
  appointmentId: string;
  serviceId: string;
  currentProfessionalId: string;
}) {
  const [open, setOpen] = useState(false);
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [professionalId, setProfessionalId] = useState(currentProfessionalId);
  const [date, setDate] = useState("");
  const [slots, setSlots] = useState<string[]>([]);
  const [selectedSlot, setSelectedSlot] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");

  // Al abrir, traigo profesionales+servicios y me quedo con los que hacen este
  // servicio (para poder cambiar de profesional si aplica).
  useEffect(() => {
    if (!open || professionals.length > 0) return;
    startTransition(async () => {
      const all = await getProfessionalsWithServices();
      setProfessionals(all.filter((p) => p.services.some((s) => s.id === serviceId)));
    });
  }, [open, professionals.length, serviceId]);

  function loadSlots(nextProfessionalId: string, nextDate: string) {
    setSlots([]);
    setSelectedSlot("");
    if (!nextProfessionalId || !nextDate) return;
    startTransition(async () => {
      const result = await getAvailableSlots(nextProfessionalId, serviceId, nextDate, appointmentId);
      setSlots(result);
    });
  }

  function reset() {
    setProfessionalId(currentProfessionalId);
    setDate("");
    setSlots([]);
    setSelectedSlot("");
    setError("");
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-sm text-neutral-500 hover:text-black text-left"
      >
        Reprogramar
      </button>
    );
  }

  return (
    <div className="rounded-md border bg-neutral-50 p-3 mt-1">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-medium">Reprogramar turno</p>
        <button
          onClick={() => {
            setOpen(false);
            reset();
          }}
          className="text-sm text-neutral-500"
        >
          Cerrar
        </button>
      </div>

      <form
        action={async (fd) => {
          setError("");
          try {
            await rescheduleAppointment(fd);
            setOpen(false);
            reset();
          } catch (err) {
            setError(err instanceof Error ? err.message : "No se pudo reprogramar el turno.");
          }
        }}
        className="space-y-3"
      >
        <input type="hidden" name="appointmentId" value={appointmentId} />

        <select
          name="professionalId"
          className="w-full rounded-md border px-3 py-2 text-sm"
          value={professionalId}
          onChange={(e) => {
            setProfessionalId(e.target.value);
            loadSlots(e.target.value, date);
          }}
        >
          {professionals.length === 0 && <option value={currentProfessionalId}>Cargando…</option>}
          {professionals.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} {p.box ? `— ${p.box.name}` : ""}
              {p.id === currentProfessionalId ? " (actual)" : ""}
            </option>
          ))}
        </select>

        <input
          type="date"
          required
          className="w-full rounded-md border px-3 py-2 text-sm"
          value={date}
          onChange={(e) => {
            setDate(e.target.value);
            loadSlots(professionalId, e.target.value);
          }}
        />

        {date && (
          <div>
            {isPending && <p className="text-sm text-neutral-500">Buscando horarios…</p>}
            {!isPending && slots.length === 0 && (
              <p className="text-sm text-neutral-500">No hay horarios disponibles ese día.</p>
            )}
            <div className="grid grid-cols-4 gap-2">
              {slots.map((slot) => {
                const isSelected = slot === selectedSlot;
                return (
                  <button
                    key={slot}
                    type="button"
                    onClick={() => setSelectedSlot(slot)}
                    className={`rounded-md border px-2 py-1.5 text-sm ${
                      isSelected ? "bg-black text-white border-black" : "bg-white"
                    }`}
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
            className="w-full rounded-md bg-black text-white py-2 text-sm font-medium"
          >
            Confirmar nuevo horario
          </SubmitButton>
        )}
      </form>
    </div>
  );
}
