"use client";

import { useMemo, useState, useTransition } from "react";
import { createAppointment, getAvailableSlots } from "@/lib/actions";

type Service = { id: string; name: string; durationMin: number; price: number };
type Professional = {
  id: string;
  name: string;
  services: Service[];
  box: { name: string } | null;
};

function StepLabel({ n, active, children }: { n: number; active: boolean; children: React.ReactNode }) {
  return (
    <label className="flex items-center gap-2 text-sm font-medium mb-2">
      <span
        className={`flex h-5 w-5 items-center justify-center rounded-full text-xs ${
          active ? "bg-black text-white" : "bg-neutral-200 text-neutral-500"
        }`}
      >
        {n}
      </span>
      {children}
    </label>
  );
}

export default function BookingForm({ professionals }: { professionals: Professional[] }) {
  const [professionalId, setProfessionalId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [date, setDate] = useState("");
  const [slots, setSlots] = useState<string[]>([]);
  const [selectedSlot, setSelectedSlot] = useState("");
  const [isPending, startTransition] = useTransition();

  const professional = useMemo(
    () => professionals.find((p) => p.id === professionalId),
    [professionalId, professionals]
  );
  const service = useMemo(
    () => professional?.services.find((s) => s.id === serviceId),
    [professional, serviceId]
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

  return (
    <div className="space-y-8">
      {(professional || service || selectedSlot) && (
        <div className="rounded-lg border bg-neutral-50 p-4 text-sm space-y-1">
          {professional && (
            <p>
              <span className="text-neutral-500">Profesional:</span> {professional.name}
            </p>
          )}
          {service && (
            <p>
              <span className="text-neutral-500">Servicio:</span> {service.name} · $
              {service.price.toLocaleString("es-AR")}
            </p>
          )}
          {selectedSlot && (
            <p>
              <span className="text-neutral-500">Horario:</span>{" "}
              {new Date(selectedSlot).toLocaleString("es-AR", {
                dateStyle: "full",
                timeStyle: "short",
              })}
            </p>
          )}
        </div>
      )}

      <form action={createAppointment} className="space-y-6">
        <div>
          <StepLabel n={1} active>
            Profesional
          </StepLabel>
          <select
            name="professionalId"
            required
            className="w-full rounded-md border px-3 py-2"
            value={professionalId}
            onChange={(e) => {
              setProfessionalId(e.target.value);
              setServiceId("");
              loadSlots(e.target.value, "", date);
            }}
          >
            <option value="">Seleccioná un profesional</option>
            {professionals.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} {p.box ? `— ${p.box.name}` : ""}
              </option>
            ))}
          </select>
        </div>

        {professional && (
          <div>
            <StepLabel n={2} active>
              Servicio
            </StepLabel>
            <select
              name="serviceId"
              required
              className="w-full rounded-md border px-3 py-2"
              value={serviceId}
              onChange={(e) => {
                setServiceId(e.target.value);
                loadSlots(professionalId, e.target.value, date);
              }}
            >
              <option value="">Seleccioná un servicio</option>
              {professional.services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.durationMin} min) — ${s.price.toLocaleString("es-AR")}
                </option>
              ))}
            </select>
          </div>
        )}

        {serviceId && (
          <div>
            <StepLabel n={3} active>
              Fecha
            </StepLabel>
            <input
              type="date"
              required
              className="w-full rounded-md border px-3 py-2"
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                loadSlots(professionalId, serviceId, e.target.value);
              }}
            />
          </div>
        )}

        {date && (
          <div>
            <StepLabel n={4} active>
              Horario disponible
            </StepLabel>
            {isPending && <p className="text-sm text-neutral-500">Buscando horarios…</p>}
            {!isPending && slots.length === 0 && (
              <p className="text-sm text-neutral-500">No hay horarios disponibles ese día.</p>
            )}
            <div className="grid grid-cols-3 gap-2">
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
                    className={`rounded-md border px-3 py-2 text-sm ${
                      isSelected ? "border-black bg-black text-white" : "hover:border-black"
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
          <div className="space-y-3 border-t pt-6">
            <StepLabel n={5} active>
              Tus datos
            </StepLabel>
            <input
              name="clientName"
              required
              placeholder="Nombre y apellido"
              className="w-full rounded-md border px-3 py-2"
            />
            <input
              name="clientPhone"
              required
              placeholder="Teléfono"
              className="w-full rounded-md border px-3 py-2"
            />
            <input
              name="clientEmail"
              type="email"
              placeholder="Email (opcional)"
              className="w-full rounded-md border px-3 py-2"
            />
            <button
              type="submit"
              className="w-full rounded-md bg-black text-white py-2.5 font-medium"
            >
              Confirmar turno
            </button>
            <p className="text-xs text-neutral-500 text-center">
              Te vamos a contactar por WhatsApp para coordinar el pago y confirmar el turno.
            </p>
          </div>
        )}
      </form>
    </div>
  );
}
