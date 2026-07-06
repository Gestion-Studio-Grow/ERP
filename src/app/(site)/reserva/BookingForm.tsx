"use client";

import { useMemo, useState, useTransition } from "react";
import { createAppointment, getAvailableSlots } from "@/lib/actions";
import SubmitButton from "@/components/SubmitButton";
import { fmtDateTime, fmtTime } from "@/lib/datetime";
import type { AgendaBookingCopy } from "@/blueprints/agenda";

type Service = { id: string; name: string; durationMin: number; price: number; residentPrice: number | null; depositAmount: number | null };
type Professional = {
  id: string;
  name: string;
  services: Service[];
  box: { name: string } | null;
};

// Encabezado de paso. Era un <label> sin `htmlFor` (no se asociaba a ningún
// control → los lectores de pantalla no le daban nombre al campo). Ahora es un
// heading con `id`, y cada control lo referencia por aria-labelledby — sirve
// igual para un control único (select/fecha) que para un grupo (horarios/datos).
function StepLabel({ n, id, children }: { n: number; id?: string; children: React.ReactNode }) {
  return (
    <div
      id={id}
      className="flex items-center gap-3 text-xs uppercase tracking-[0.15em] mb-3"
      style={{ color: "var(--text-strong)" }}
    >
      <span
        aria-hidden
        className="flex h-6 w-6 items-center justify-center text-xs font-serif"
        style={{ border: "1px solid var(--text-strong)" }}
      >
        {n}
      </span>
      {children}
    </div>
  );
}

const inputClass = "w-full px-3 py-2.5 text-sm bg-transparent";
const inputStyle = { border: "1px solid var(--line)", color: "var(--text-strong)" };

export default function BookingForm({
  professionals,
  copy,
}: {
  professionals: Professional[];
  copy: AgendaBookingCopy;
}) {
  const [professionalId, setProfessionalId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [date, setDate] = useState("");
  const [slots, setSlots] = useState<string[]>([]);
  const [selectedSlot, setSelectedSlot] = useState("");
  const [isResident, setIsResident] = useState(false);
  const [isPending, startTransition] = useTransition();

  // El precio "vecino/a" es exclusivo de CH Estética (ADR-013): sólo mostramos el
  // toggle si ALGÚN servicio tiene precio preferencial. Un club de pádel no lo usa
  // → el checkbox no aparece (Fiori: nada que no aplique al rol/negocio).
  const hasResidentPricing = useMemo(
    () => professionals.some((p) => p.services.some((s) => s.residentPrice != null)),
    [professionals]
  );

  // Hoy en fecha local (no UTC): evita que un turno se agende en el pasado.
  const today = useMemo(() => {
    const d = new Date();
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  }, []);

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
          style={{ background: "var(--surface-sunken)", color: "var(--text-strong)" }}
        >
          {professional && (
            <p>
              <span style={{ color: "var(--text-muted)" }}>{copy.summaryProviderLabel}</span> — {professional.name}
            </p>
          )}
          {service && (
            <p>
              <span style={{ color: "var(--text-muted)" }}>{copy.summaryServiceLabel}</span> — {service.name} · $
              {(isResident && service.residentPrice != null ? service.residentPrice : service.price).toLocaleString("es-AR")}
              {isResident && service.residentPrice != null && (
                <span style={{ color: "var(--text-muted)" }}> (precio vecino/a)</span>
              )}
            </p>
          )}
          {service?.depositAmount != null && (
            <p style={{ color: "var(--warning)" }}>
              Seña obligatoria: ${service.depositAmount.toLocaleString("es-AR")} — te contactamos por WhatsApp para coordinarla.
            </p>
          )}
          {selectedSlot && (
            <p>
              <span style={{ color: "var(--text-muted)" }}>Horario</span> —{" "}
              {fmtDateTime(selectedSlot)}
            </p>
          )}
        </div>
      )}

      <form action={createAppointment} className="space-y-8">
        <div>
          <StepLabel n={1} id="reserva-step-profesional">{copy.providerLabel}</StepLabel>
          <select
            name="professionalId"
            required
            aria-labelledby="reserva-step-profesional"
            className={inputClass}
            style={inputStyle}
            value={professionalId}
            onChange={(e) => {
              setProfessionalId(e.target.value);
              setServiceId("");
              loadSlots(e.target.value, "", date);
            }}
          >
            <option value="">{copy.providerPlaceholder}</option>
            {professionals.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} {p.box ? `— ${p.box.name}` : ""}
              </option>
            ))}
          </select>
        </div>

        {professional && (
          <div>
            <StepLabel n={2} id="reserva-step-servicio">{copy.serviceLabel}</StepLabel>
            <select
              name="serviceId"
              required
              aria-labelledby="reserva-step-servicio"
              className={inputClass}
              style={inputStyle}
              value={serviceId}
              onChange={(e) => {
                setServiceId(e.target.value);
                loadSlots(professionalId, e.target.value, date);
              }}
            >
              <option value="">{copy.servicePlaceholder}</option>
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
            <StepLabel n={3} id="reserva-step-fecha">Fecha</StepLabel>
            <input
              type="date"
              required
              min={today}
              aria-labelledby="reserva-step-fecha"
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
            <StepLabel n={4} id="reserva-step-horario">Horario disponible</StepLabel>
            <div aria-live="polite" role="status">
              {isPending && (
                <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                  Buscando horarios…
                </p>
              )}
              {!isPending && slots.length === 0 && (
                <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                  No hay horarios disponibles ese día.
                </p>
              )}
              {/* Antes, al cargar los horarios no cambiaba nada dentro de la región
                  viva → un lector de pantalla no anunciaba que llegaron resultados.
                  Este aviso (visible solo para lectores) cierra ese vacío. */}
              {!isPending && slots.length > 0 && (
                <p className="sr-only">
                  {slots.length} horario{slots.length !== 1 ? "s" : ""} disponible
                  {slots.length !== 1 ? "s" : ""}. Elegí uno de la lista.
                </p>
              )}
            </div>
            <div className="grid grid-cols-3 gap-2" role="group" aria-labelledby="reserva-step-horario">
              {slots.map((slot) => {
                const label = fmtTime(slot);
                const isSelected = slot === selectedSlot;
                return (
                  <button
                    key={slot}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => setSelectedSlot(slot)}
                    className="px-3 py-2 text-sm transition-colors"
                    style={
                      isSelected
                        ? { background: "var(--surface-inverted)", border: "1px solid var(--surface-inverted)", color: "var(--text-on-accent)" }
                        : { border: "1px solid var(--line)", color: "var(--text-strong)" }
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
          <div className="space-y-3 pt-8" role="group" aria-labelledby="reserva-step-datos" style={{ borderTop: "1px solid var(--line)" }}>
            <StepLabel n={5} id="reserva-step-datos">Tus datos</StepLabel>
            <input
              name="clientName"
              required
              aria-label="Nombre y apellido"
              placeholder="Nombre y apellido"
              className={inputClass}
              style={inputStyle}
            />
            <input
              name="clientPhone"
              required
              aria-label="Teléfono"
              placeholder="Teléfono"
              className={inputClass}
              style={inputStyle}
            />
            <input
              name="clientEmail"
              type="email"
              aria-label="Email (opcional)"
              placeholder="Email (opcional)"
              className={inputClass}
              style={inputStyle}
            />
            {hasResidentPricing && (
              <label className="flex items-center gap-2 text-sm" style={{ color: "var(--text-strong)" }}>
                <input
                  type="checkbox"
                  name="isResident"
                  checked={isResident}
                  onChange={(e) => setIsResident(e.target.checked)}
                />
                Soy vecino/a de La Alameda
              </label>
            )}
            <input
              name="couponCode"
              aria-label="Cupón de descuento (opcional)"
              placeholder="Cupón de descuento (opcional)"
              className={inputClass}
              style={{ ...inputStyle, textTransform: "uppercase" }}
            />
            <SubmitButton
              pendingText="Confirmando…"
              className="btn-editorial-solid w-full justify-center text-xs uppercase tracking-[0.1em] mt-2"
            >
              {copy.confirmCta}
            </SubmitButton>
            <p className="text-xs text-center" style={{ color: "var(--text-muted)" }}>
              Te vamos a contactar por WhatsApp para coordinar el pago y confirmar el turno.
            </p>
          </div>
        )}
      </form>
    </div>
  );
}
