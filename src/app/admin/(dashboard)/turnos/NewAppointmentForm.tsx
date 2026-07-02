"use client";

import { useMemo, useState, useTransition } from "react";
import { createManualAppointment } from "@/lib/actions";
import { getAvailableSlots } from "@/lib/actions";
import SubmitButton from "@/components/SubmitButton";

type Service = { id: string; name: string; durationMin: number; price: number };
type Professional = { id: string; name: string; services: Service[]; box: { name: string } | null };

export default function NewAppointmentForm({ professionals }: { professionals: Professional[] }) {
  const [open, setOpen] = useState(false);
  const [professionalId, setProfessionalId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [date, setDate] = useState("");
  const [slots, setSlots] = useState<string[]>([]);
  const [selectedSlot, setSelectedSlot] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");

  const professional = useMemo(
    () => professionals.find((p) => p.id === professionalId),
    [professionalId, professionals]
  );

  function loadSlots(nextProfessionalId: string, nextServiceId: string, nextDate: string) {
    setSlots([]);
    setSelectedSlot("");
    if (!nextProfessionalId || !nextServiceId || !nextDate) return;
    startTransition(async () => {
      const result = await getAvailableSlots(nextProfessionalId, nextServiceId, nextDate);
      setSlots(result);
    });
  }

  function reset() {
    setProfessionalId("");
    setServiceId("");
    setDate("");
    setSlots([]);
    setSelectedSlot("");
    setError("");
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-md bg-black text-white px-4 py-2 text-sm font-medium mb-6"
      >
        + Nuevo turno
      </button>
    );
  }

  return (
    <div className="rounded-lg border p-4 mb-8 bg-neutral-50">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-medium">Nuevo turno (llamada / walk-in)</p>
        <button
          onClick={() => {
            setOpen(false);
            reset();
          }}
          className="text-sm text-neutral-500"
        >
          Cancelar
        </button>
      </div>

      <form
        action={async (fd) => {
          setError("");
          try {
            await createManualAppointment(fd);
            setOpen(false);
            reset();
          } catch (err) {
            setError(err instanceof Error ? err.message : "No se pudo crear el turno.");
          }
        }}
        className="space-y-3"
      >
        <div className="grid grid-cols-2 gap-3">
          <select
            name="professionalId"
            required
            className="rounded-md border px-3 py-2 text-sm"
            value={professionalId}
            onChange={(e) => {
              setProfessionalId(e.target.value);
              setServiceId("");
              loadSlots(e.target.value, "", date);
            }}
          >
            <option value="">Profesional</option>
            {professionals.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} {p.box ? `— ${p.box.name}` : ""}
              </option>
            ))}
          </select>

          <select
            name="serviceId"
            required
            className="rounded-md border px-3 py-2 text-sm"
            value={serviceId}
            disabled={!professional}
            onChange={(e) => {
              setServiceId(e.target.value);
              loadSlots(professionalId, e.target.value, date);
            }}
          >
            <option value="">Servicio</option>
            {professional?.services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.durationMin} min) — ${s.price.toLocaleString("es-AR")}
              </option>
            ))}
          </select>
        </div>

        <input
          type="date"
          required
          className="w-full rounded-md border px-3 py-2 text-sm"
          value={date}
          onChange={(e) => {
            setDate(e.target.value);
            loadSlots(professionalId, serviceId, e.target.value);
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
                const label = new Date(slot).toLocaleTimeString("es-AR", {
                  hour: "2-digit",
                  minute: "2-digit",
                });
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
                    {label}
                  </button>
                );
              })}
            </div>
            <input type="hidden" name="startsAt" value={selectedSlot} />
          </div>
        )}

        {selectedSlot && (
          <div className="space-y-2 border-t pt-3">
            <div className="grid grid-cols-2 gap-3">
              <input
                name="clientName"
                required
                placeholder="Nombre del cliente"
                className="rounded-md border px-3 py-2 text-sm"
              />
              <input
                name="clientPhone"
                required
                placeholder="Teléfono"
                className="rounded-md border px-3 py-2 text-sm"
              />
            </div>
            <select name="status" defaultValue="CONFIRMED" className="w-full rounded-md border px-3 py-2 text-sm">
              <option value="CONFIRMED">Confirmado (ya pagó o pactado en persona)</option>
              <option value="PENDING">Pendiente de pago</option>
            </select>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <SubmitButton
              pendingText="Creando turno…"
              className="w-full rounded-md bg-black text-white py-2 text-sm font-medium"
            >
              Crear turno
            </SubmitButton>
          </div>
        )}
      </form>
    </div>
  );
}
