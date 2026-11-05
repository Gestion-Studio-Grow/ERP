"use client";

import { useMemo, useState, useTransition } from "react";
import { createAppointment, getAvailableSlots } from "@/lib/actions";
import SubmitButton from "@/components/SubmitButton";
import { fmtDateTime, fmtTime } from "@/lib/datetime";
import { precioCongeladoDeReserva } from "@/lib/turnos/precio-reserva";
import type { AgendaBookingCopy } from "@/blueprints/agenda";
import { useNegocioDelSitio } from "../_ch/negocio-del-sitio";
import type { Preeleccion, Utm } from "@/lib/link-reserva";

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

// min-h-11: 44 px, el piso táctil de la casa (el gate «visual-aa» mide los desplegables en el celular).
const inputClass = "w-full min-h-11 px-3 py-2.5 text-sm bg-transparent";
const inputStyle = { border: "1px solid var(--line)", color: "var(--text-strong)" };

// «Cambiar» del resumen: vuelve a mostrar el paso que llegó resuelto por el link (44 px táctil).
function Cambiar({ onClick, que }: { onClick: () => void; que: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Cambiar ${que}`}
      className="ml-2 inline-flex min-h-11 min-w-11 items-center justify-center px-2 text-xs uppercase tracking-[0.1em] underline underline-offset-4"
      style={{ color: "var(--text-strong)" }}
    >
      Cambiar
    </button>
  );
}

export default function BookingForm({
  professionals,
  copy,
  preeleccion,
  utm,
}: {
  professionals: Professional[];
  copy: AgendaBookingCopy;
  /** Link para redes (docs/producto/link-servicio/PLAN.md §2): lo resuelto arranca elegido y oculto. */
  preeleccion?: Preeleccion;
  utm?: Utm;
}) {
  const { esCH } = useNegocioDelSitio();
  const [professionalId, setProfessionalId] = useState(preeleccion?.professionalId ?? "");
  const [serviceId, setServiceId] = useState(preeleccion?.serviceId ?? "");
  // Paso fijado por el link: oculto en el formulario y visible en el resumen con «Cambiar».
  const [profFijo, setProfFijo] = useState(Boolean(preeleccion?.professionalId));
  const [servFijo, setServFijo] = useState(Boolean(preeleccion?.serviceId));
  const [date, setDate] = useState("");
  const [slots, setSlots] = useState<string[]>([]);
  const [selectedSlot, setSelectedSlot] = useState("");
  const [isResident, setIsResident] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");

  // La acción devuelve el rechazo con su motivo (horario ocupado, ya pasado, profesional que no
  // hace ese servicio) en vez de tirarlo: tirado, en producción llegaba un genérico en inglés.
  // Si sale bien, la propia acción redirige a la confirmación.
  async function reservar(formData: FormData) {
    setError("");
    const r = await createAppointment(formData);
    if (!r.ok) setError(r.error);
  }

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
  // Con el servicio fijado y todavía sin profesional, el servicio se busca en todo el negocio.
  const service = useMemo(
    () =>
      professional
        ? professional.services.find((s) => s.id === serviceId)
        : servFijo
          ? professionals.flatMap((p) => p.services).find((s) => s.id === serviceId)
          : undefined,
    [professional, professionals, serviceId, servFijo]
  );
  // Servicio fijado: el paso de profesional lista sólo a quienes lo hacen.
  const profesionalesVisibles = useMemo(
    () => (servFijo && serviceId ? professionals.filter((p) => p.services.some((s) => s.id === serviceId)) : professionals),
    [servFijo, serviceId, professionals]
  );

  // Numeración coherente con lo visible: los pasos ocultos no cuentan.
  const verProf = !profFijo;
  const verServ = !servFijo && Boolean(professional);
  const nProf = 1;
  const nServ = (verProf ? 1 : 0) + 1;
  const nFecha = (verProf ? 1 : 0) + (servFijo ? 0 : 1) + 1;

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
              {profFijo && <Cambiar que={copy.summaryProviderLabel.toLowerCase()} onClick={() => setProfFijo(false)} />}
            </p>
          )}
          {service && (() => {
            // El importe del resumen y la etiqueta "(precio vecino/a)" salen de UNA sola
            // llamada a la regla que después congela el turno: separarlas es la clienta
            // leyendo un número en la confirmación y pagando otro.
            const { priceAtBooking, isResidentBooking } = precioCongeladoDeReserva(service, isResident);
            return (
            <p>
              <span style={{ color: "var(--text-muted)" }}>{copy.summaryServiceLabel}</span> — {service.name} · $
              {priceAtBooking.toLocaleString("es-AR")}
              {isResidentBooking && (
                <span style={{ color: "var(--text-muted)" }}> (precio vecino/a)</span>
              )}
              {servFijo && <Cambiar que={copy.summaryServiceLabel.toLowerCase()} onClick={() => setServFijo(false)} />}
            </p>
            );
          })()}
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

      <form action={reservar} className="space-y-8">
        {/* Origen del link para redes: viaja con el turno como marca saneada (createAppointment). */}
        <input type="hidden" name="utm_source" value={utm?.source ?? ""} />
        <input type="hidden" name="utm_medium" value={utm?.medium ?? ""} />
        <input type="hidden" name="utm_campaign" value={utm?.campaign ?? ""} />
        {!verProf && <input type="hidden" name="professionalId" value={professionalId} />}
        {servFijo && <input type="hidden" name="serviceId" value={serviceId} />}
        {verProf && (
        <div>
          <StepLabel n={nProf} id="reserva-step-profesional">{copy.providerLabel}</StepLabel>
          <select
            name="professionalId"
            required
            aria-labelledby="reserva-step-profesional"
            className={inputClass}
            style={inputStyle}
            value={professionalId}
            onChange={(e) => {
              setProfessionalId(e.target.value);
              // Servicio fijado por el link: se conserva (la lista ya son sólo quienes lo hacen).
              const sigue = servFijo ? serviceId : "";
              if (!servFijo) setServiceId("");
              loadSlots(e.target.value, sigue, date);
            }}
          >
            <option value="">{copy.providerPlaceholder}</option>
            {profesionalesVisibles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} {p.box ? `— ${p.box.name}` : ""}
              </option>
            ))}
          </select>
        </div>
        )}

        {verServ && professional && (
          <div>
            <StepLabel n={nServ} id="reserva-step-servicio">{copy.serviceLabel}</StepLabel>
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

        {serviceId && professional && (
          <div>
            <StepLabel n={nFecha} id="reserva-step-fecha">Fecha</StepLabel>
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
            <StepLabel n={nFecha + 1} id="reserva-step-horario">Horario disponible</StepLabel>
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
                    className="min-h-11 px-3 py-2 text-sm transition-colors"
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
            <StepLabel n={nFecha + 2} id="reserva-step-datos">Tus datos</StepLabel>
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
                {esCH ? "Soy vecino/a de La Alameda" : "Soy vecino/a"}
              </label>
            )}
            <input
              name="couponCode"
              aria-label="Cupón de descuento (opcional)"
              placeholder="Cupón de descuento (opcional)"
              className={inputClass}
              style={{ ...inputStyle, textTransform: "uppercase" }}
            />
            {error && (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            )}
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
