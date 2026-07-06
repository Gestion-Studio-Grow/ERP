"use client";

import { useMemo, useState, useTransition } from "react";
import { createManualAppointment } from "@/lib/actions";
import { getAvailableSlots } from "@/lib/actions";
import SubmitButton from "@/components/SubmitButton";
import { fmtTime } from "@/lib/datetime";
import { Input, Select, Textarea, Field, buttonClasses, cn } from "@/components/ui";

type Service = { id: string; name: string; durationMin: number; price: number; residentPrice: number | null; depositAmount: number | null };
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
        className={buttonClasses("solid", "md", "mb-6")}
      >
        + Nuevo turno
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-line bg-surface-raised shadow-xs p-4 mb-8">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-medium text-strong">Nuevo turno (llamada / walk-in)</p>
        <button
          onClick={() => {
            setOpen(false);
            reset();
          }}
          className="text-sm text-muted hover:text-strong transition-colors"
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
          <Field label="Profesional" htmlFor="na-professional">
            <Select
              id="na-professional"
              name="professionalId"
              required
              value={professionalId}
              onChange={(e) => {
                setProfessionalId(e.target.value);
                setServiceId("");
                loadSlots(e.target.value, "", date);
              }}
            >
              <option value="">Elegí un profesional</option>
              {professionals.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} {p.box ? `— ${p.box.name}` : ""}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Servicio" htmlFor="na-service">
            <Select
              id="na-service"
              name="serviceId"
              required
              value={serviceId}
              disabled={!professional}
              onChange={(e) => {
                setServiceId(e.target.value);
                loadSlots(professionalId, e.target.value, date);
              }}
            >
              <option value="">Elegí un servicio</option>
              {professional?.services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.durationMin} min) — ${s.price.toLocaleString("es-AR")}
                  {s.residentPrice != null ? ` · vecino/a $${s.residentPrice.toLocaleString("es-AR")}` : ""}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label="Fecha" htmlFor="na-date">
          <Input
            id="na-date"
            type="date"
            required
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              loadSlots(professionalId, serviceId, e.target.value);
            }}
          />
        </Field>

        {date && (
          <div>
            {isPending && <p className="text-sm text-muted">Buscando horarios…</p>}
            {!isPending && slots.length === 0 && (
              <p className="text-sm text-muted">No hay horarios disponibles ese día.</p>
            )}
            <div className="grid grid-cols-4 gap-2">
              {slots.map((slot) => {
                const label = fmtTime(slot);
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
                    {label}
                  </button>
                );
              })}
            </div>
            <input type="hidden" name="startsAt" value={selectedSlot} />
          </div>
        )}

        {selectedSlot && (
          <div className="space-y-2 border-t border-line pt-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Nombre del cliente" htmlFor="na-client-name">
                <Input id="na-client-name" name="clientName" required />
              </Field>
              <Field label="Teléfono" htmlFor="na-client-phone">
                <Input id="na-client-phone" name="clientPhone" type="tel" required />
              </Field>
            </div>
            <label className="flex items-center gap-2 text-sm text-body">
              <input type="checkbox" name="isResident" className="accent-accent" />
              Vecino/a de La Alameda
            </label>
            <Field label="Cupón (opcional)" htmlFor="na-coupon">
              <Input
                id="na-coupon"
                name="couponCode"
                className="uppercase placeholder:normal-case"
              />
            </Field>
            <Field label="Estado" htmlFor="na-status">
              <Select id="na-status" name="status" defaultValue="CONFIRMED">
                <option value="CONFIRMED">Confirmado (ya pagó o pactado en persona)</option>
                <option value="PENDING">Pendiente de pago</option>
              </Select>
            </Field>
            <Field label="Notas (opcional)" htmlFor="na-notes" hint="Preferencias, tono, alergias…">
              <Textarea id="na-notes" name="notes" rows={2} />
            </Field>
            {error && (
              <p className="text-sm text-danger" role="alert">
                {error}
              </p>
            )}
            <SubmitButton
              pendingText="Creando turno…"
              className={buttonClasses("solid", "md", "w-full")}
            >
              Crear turno
            </SubmitButton>
          </div>
        )}
      </form>
    </div>
  );
}
