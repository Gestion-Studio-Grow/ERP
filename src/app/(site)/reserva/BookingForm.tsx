"use client";

import { useMemo, useState, useTransition } from "react";
import { createAppointment, getAvailableSlots } from "@/lib/actions";
import SubmitButton from "@/components/SubmitButton";
import { fmtDateTime, fmtTime } from "@/lib/datetime";

type Service = { id: string; name: string; durationMin: number; price: number; residentPrice: number | null };
type Professional = {
  id: string;
  name: string;
  services: Service[];
  box: { name: string } | null;
};

function StepLabel({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <label
      className="flex items-center gap-3 text-xs uppercase tracking-[0.15em] mb-3"
      style={{ color: "var(--spa-ink)" }}
    >
      <span
        className="flex h-6 w-6 items-center justify-center text-xs font-serif"
        style={{ border: "1px solid var(--spa-ink)" }}
      >
        {n}
      </span>
      {children}
    </label>
  );
}

const inputClass = "w-full px-3 py-2.5 text-sm bg-transparent";
const inputStyle = { border: "1px solid var(--spa-hairline)", color: "var(--spa-ink)" };

export default function BookingForm({ professionals }: { professionals: Professional[] }) {
  const [professionalId, setProfessionalId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [date, setDate] = useState("");
  const [slots, setSlots] = useState<string[]>([]);
  const [selectedSlot, setSelectedSlot] = useState("");
  const [isResident, setIsResident] = useState(false);
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
    <div className="space-y-10">
      {(professional || service || selectedSlot) && (
        <div
          className="p-5 text-sm space-y-1.5"
          style={{ background: "var(--spa-sage-light)", color: "var(--spa-ink)" }}
        >
          {professional && (
            <p>
              <span style={{ color: "var(--spa-mocha)" }}>Profesional</span> — {professional.name}
            </p>
          )}
          {service && (
            <p>
              <span style={{ color: "var(--spa-mocha)" }}>Servicio</span> — {service.name} · $
              {(isResident && service.residentPrice != null ? service.residentPrice : service.price).toLocaleString("es-AR")}
              {isResident && service.residentPrice != null && (
                <span style={{ color: "var(--spa-mocha)" }}> (precio vecino/a)</span>
              )}
            </p>
          )}
          {selectedSlot && (
            <p>
              <span style={{ color: "var(--spa-mocha)" }}>Horario</span> —{" "}
              {fmtDateTime(selectedSlot)}
            </p>
          )}
        </div>
      )}

      <form action={createAppointment} className="space-y-8">
        <div>
          <StepLabel n={1}>Profesional</StepLabel>
          <select
            name="professionalId"
            required
            className={inputClass}
            style={inputStyle}
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
            <StepLabel n={2}>Servicio</StepLabel>
            <select
              name="serviceId"
              required
              className={inputClass}
              style={inputStyle}
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
                  {s.residentPrice != null ? ` · vecino/a $${s.residentPrice.toLocaleString("es-AR")}` : ""}
                </option>
              ))}
            </select>
          </div>
        )}

        {serviceId && (
          <div>
            <StepLabel n={3}>Fecha</StepLabel>
            <input
              type="date"
              required
              className={inputClass}
              style={inputStyle}
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
            <StepLabel n={4}>Horario disponible</StepLabel>
            {isPending && (
              <p className="text-sm" style={{ color: "var(--spa-mocha)" }}>
                Buscando horarios…
              </p>
            )}
            {!isPending && slots.length === 0 && (
              <p className="text-sm" style={{ color: "var(--spa-mocha)" }}>
                No hay horarios disponibles ese día.
              </p>
            )}
            <div className="grid grid-cols-3 gap-2">
              {slots.map((slot) => {
                const label = fmtTime(slot);
                const isSelected = slot === selectedSlot;
                return (
                  <button
                    key={slot}
                    type="button"
                    onClick={() => setSelectedSlot(slot)}
                    className="px-3 py-2 text-sm transition-colors"
                    style={
                      isSelected
                        ? { background: "var(--spa-ink)", border: "1px solid var(--spa-ink)", color: "var(--spa-ivory)" }
                        : { border: "1px solid var(--spa-hairline)", color: "var(--spa-ink)" }
                    }
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
          <div className="space-y-3 pt-8" style={{ borderTop: "1px solid var(--spa-hairline)" }}>
            <StepLabel n={5}>Tus datos</StepLabel>
            <input
              name="clientName"
              required
              placeholder="Nombre y apellido"
              className={inputClass}
              style={inputStyle}
            />
            <input
              name="clientPhone"
              required
              placeholder="Teléfono"
              className={inputClass}
              style={inputStyle}
            />
            <input
              name="clientEmail"
              type="email"
              placeholder="Email (opcional)"
              className={inputClass}
              style={inputStyle}
            />
            <label className="flex items-center gap-2 text-sm" style={{ color: "var(--spa-ink)" }}>
              <input
                type="checkbox"
                name="isResident"
                checked={isResident}
                onChange={(e) => setIsResident(e.target.checked)}
              />
              Soy vecino/a de La Alameda
            </label>
            <SubmitButton
              pendingText="Confirmando…"
              className="btn-editorial-solid w-full justify-center text-xs uppercase tracking-[0.1em] mt-2"
            >
              Confirmar turno
            </SubmitButton>
            <p className="text-xs text-center" style={{ color: "var(--spa-mocha)" }}>
              Te vamos a contactar por WhatsApp para coordinar el pago y confirmar el turno.
            </p>
          </div>
        )}
      </form>
    </div>
  );
}
