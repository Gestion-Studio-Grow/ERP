"use client";

import { useEffect, useState, useTransition } from "react";
import { getAvailableSlots, getProfessionalsWithServices, rescheduleAppointment } from "@/lib/actions";
import SubmitButton from "@/components/SubmitButton";
import { fmtTime } from "@/lib/datetime";
import { Input, Select, buttonClasses, cn } from "@/components/ui";

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
        className="text-sm text-muted hover:text-strong text-left transition-colors"
      >
        Reprogramar
      </button>
    );
  }

  return (
    <div className="rounded-md border border-line bg-surface-raised p-3 mt-1">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-medium text-strong">Reprogramar turno</p>
        <button
          onClick={() => {
            setOpen(false);
            reset();
          }}
          className="text-sm text-muted hover:text-strong transition-colors"
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

        <Select
          name="professionalId"
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
        </Select>

        <Input
          type="date"
          required
          value={date}
          onChange={(e) => {
            setDate(e.target.value);
            loadSlots(professionalId, e.target.value);
          }}
        />

        {date && (
          <div>
            {isPending && <p className="text-sm text-muted">Buscando horarios…</p>}
            {!isPending && slots.length === 0 && (
              <p className="text-sm text-muted">No hay horarios disponibles ese día.</p>
            )}
            <div className="grid grid-cols-4 gap-2">
              {slots.map((slot) => {
                const isSelected = slot === selectedSlot;
                return (
                  <button
                    key={slot}
                    type="button"
                    onClick={() => setSelectedSlot(slot)}
                    className={cn(
                      "rounded-md border px-2 py-1.5 text-sm transition-colors",
                      isSelected
                        ? "bg-accent text-on-accent border-accent"
                        : "bg-surface-raised border-line-strong text-body hover:bg-accent-soft"
                    )}
                  >
                    {fmtTime(slot)}
                  </button>
                );
              })}
            </div>
            <input type="hidden" name="startsAt" value={selectedSlot} />
          </div>
        )}

        {error && <p className="text-sm text-danger">{error}</p>}

        {selectedSlot && (
          <SubmitButton
            pendingText="Reprogramando…"
            className={buttonClasses("solid", "md", "w-full")}
          >
            Confirmar nuevo horario
          </SubmitButton>
        )}
      </form>
    </div>
  );
}
