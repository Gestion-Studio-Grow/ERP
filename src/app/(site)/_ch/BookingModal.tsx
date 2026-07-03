"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { getAvailableSlots, createBookingFromModal } from "@/lib/actions";
import { fmtTime } from "@/lib/datetime";
import type { BookingData, BookingGroup, BookingProfessional, BookingService } from "./types";

const STEP_LABELS = ["", "Servicio", "Profesional", "Día y hora", "Datos", "Confirmación"];

type SelectedService = BookingService & { categoria: string };

export default function BookingModal({
  data,
  onClose,
}: {
  data: BookingData;
  onClose: () => void;
}) {
  const [step, setStep] = useState(1);
  const [svc, setSvc] = useState<SelectedService | null>(null);
  const [pro, setPro] = useState<BookingProfessional | null>(null);
  const [day, setDay] = useState<string | null>(null);
  const [slot, setSlot] = useState<string | null>(null); // ISO UTC
  const [slots, setSlots] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [tel, setTel] = useState("");
  const [mail, setMail] = useState("");
  const [code, setCode] = useState<string | null>(null);
  const [confirmedStartsAt, setConfirmedStartsAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [slotsPending, startSlots] = useTransition();

  // Cerrar con Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Profesionales que hacen el servicio elegido.
  const prosForService = useMemo(
    () => (svc ? data.professionals.filter((p) => p.serviceIds.includes(svc.id)) : []),
    [svc, data.professionals]
  );

  function selectDay(value: string) {
    setDay(value);
    setSlot(null);
    setSlots([]);
    if (!pro || !svc) return;
    startSlots(async () => {
      const result = await getAvailableSlots(pro.id, svc.id, value);
      setSlots(result);
    });
  }

  const canNext = [
    false,
    !!svc,
    !!pro,
    !!(day && slot),
    !!(name.trim() && tel.trim()),
    true,
  ][step];

  async function confirmBooking() {
    if (!pro || !svc || !slot) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await createBookingFromModal({
        professionalId: pro.id,
        serviceId: svc.id,
        startsAtIso: slot,
        clientName: name,
        clientPhone: tel,
        clientEmail: mail,
      });
      setCode(res.id.slice(-6).toUpperCase());
      setConfirmedStartsAt(res.startsAt);
      setStep(5);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo confirmar el turno.");
    } finally {
      setSubmitting(false);
    }
  }

  function next() {
    if (step === 4) {
      confirmBooking();
      return;
    }
    if (step === 5) {
      onClose();
      return;
    }
    if (canNext) setStep(step + 1);
  }
  function back() {
    if (step > 1) setStep(step - 1);
  }

  const nextLabel = step >= 4 ? (step === 5 ? "Cerrar" : submitting ? "Confirmando…" : "Confirmar") : "Continuar";

  const accent = "var(--ch-petrol)";
  const rowSelected = (on: boolean) =>
    on
      ? { background: accent, color: "var(--ch-ivory)", borderColor: accent }
      : { background: "transparent", color: "var(--ch-ink)", borderColor: "var(--ch-clay)" };

  const whenLabel =
    confirmedStartsAt &&
    new Intl.DateTimeFormat("es-AR", {
      timeZone: "America/Argentina/Buenos_Aires",
      weekday: "long",
      day: "numeric",
      month: "long",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(confirmedStartsAt));

  const icsHref = useMemo(() => {
    if (!confirmedStartsAt || !svc) return null;
    const start = new Date(confirmedStartsAt);
    const end = new Date(start.getTime() + svc.durationMin * 60000);
    const z = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    const ics = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//CH Estetica//ES",
      "BEGIN:VEVENT",
      `UID:${Date.now()}@ch-estetica`,
      `DTSTAMP:${z(new Date())}`,
      `DTSTART:${z(start)}`,
      `DTEND:${z(end)}`,
      `SUMMARY:CH Estética — ${svc.name}`,
      `DESCRIPTION:${pro ? "Profesional: " + pro.name : "Turno confirmado"}`,
      "LOCATION:Barrio La Alameda\\, Canning\\, Buenos Aires",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    return "data:text/calendar;charset=utf-8," + encodeURIComponent(ics);
  }, [confirmedStartsAt, svc, pro]);

  const waHref =
    data.whatsapp && svc
      ? `https://wa.me/${data.whatsapp}?text=${encodeURIComponent(
          `Hola! Confirmo mi turno en CH Estética: ${svc.name}${whenLabel ? " — " + whenLabel : ""}${
            pro ? " con " + pro.name : ""
          }`
        )}`
      : null;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        background: "rgba(32,31,27,.55)",
        backdropFilter: "blur(2px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        style={{
          width: "100%",
          maxWidth: 512,
          background: "var(--ch-ivory)",
          color: "var(--ch-ink)",
          borderRadius: 2,
          boxShadow: "0 25px 50px -12px rgba(0,0,0,.35)",
          maxHeight: "92vh",
          overflow: "auto",
          fontFamily: "var(--font-body), system-ui, sans-serif",
        }}
      >
        {/* Header del modal */}
        <div style={{ padding: "24px 24px 0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: 18, color: "var(--ch-teal-logo)" }}>
              CH
            </span>
            <span style={{ textTransform: "uppercase", letterSpacing: ".22em", fontWeight: 600, fontSize: ".75rem", color: "var(--ch-mocha)" }}>
              Reservar
            </span>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar" style={{ background: "none", border: 0, color: "var(--ch-mocha)", fontSize: 22, lineHeight: 1, cursor: "pointer" }}>
            ×
          </button>
        </div>

        {/* Progreso */}
        <div style={{ padding: "16px 24px 0" }}>
          <div style={{ height: 1, background: "var(--ch-hairline)" }}>
            <div style={{ height: 1, background: accent, width: `${step * 20}%`, transition: "width .3s" }} />
          </div>
          <p style={{ margin: "8px 0 0", fontSize: 12, color: "var(--ch-mocha)" }}>
            Paso {step} de 5 · {STEP_LABELS[step]}
          </p>
        </div>

        {/* Cuerpo */}
        <div style={{ padding: 24, minHeight: 300 }}>
          {step === 1 && (
            <Step1 groups={data.groups} svc={svc} onPick={setSvc} rowSelected={rowSelected} />
          )}

          {step === 2 && (
            <>
              <StepTitle>Elegí profesional</StepTitle>
              {prosForService.length === 0 ? (
                <p style={{ fontSize: 14, color: "var(--ch-mocha)" }}>
                  No hay profesionales disponibles para este servicio. Probá con otro.
                </p>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  {prosForService.map((p) => {
                    const on = pro?.id === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setPro(p)}
                        style={{ border: "1px solid", padding: 12, borderRadius: 2, fontSize: 14, cursor: "pointer", ...rowSelected(on) }}
                      >
                        {p.name}
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {step === 3 && (
            <>
              <StepTitle>Día y hora</StepTitle>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, marginBottom: 20 }}>
                {data.days.map((d) => {
                  const on = day === d.value;
                  return (
                    <button
                      key={d.value}
                      type="button"
                      onClick={() => selectDay(d.value)}
                      style={{ border: "1px solid", padding: "8px 4px", borderRadius: 2, fontSize: 12, cursor: "pointer", textTransform: "capitalize", ...rowSelected(on) }}
                    >
                      {d.label}
                    </button>
                  );
                })}
              </div>
              {!day && <p style={{ fontSize: 13, color: "var(--ch-mocha)", margin: 0 }}>Elegí un día para ver los horarios disponibles.</p>}
              {day && slotsPending && <p style={{ fontSize: 13, color: "var(--ch-mocha)", margin: 0 }}>Buscando horarios…</p>}
              {day && !slotsPending && slots.length === 0 && (
                <p style={{ fontSize: 13, color: "var(--ch-mocha)", margin: 0 }}>No hay horarios disponibles ese día.</p>
              )}
              {day && !slotsPending && slots.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {slots.map((s) => {
                    const on = slot === s;
                    return (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setSlot(s)}
                        style={{ border: "1px solid", padding: "8px 14px", borderRadius: 2, fontSize: 14, cursor: "pointer", ...rowSelected(on) }}
                      >
                        {fmtTime(s)}
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {step === 4 && (
            <>
              <StepTitle>Tus datos</StepTitle>
              <p style={{ fontSize: 12, color: "var(--ch-mocha)", margin: "0 0 16px" }}>Solo lo necesario para confirmarte.</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <Field label="Nombre" value={name} onChange={setName} type="text" />
                <Field label="Teléfono" value={tel} onChange={setTel} type="tel" />
                <Field label="Email (opcional)" value={mail} onChange={setMail} type="email" />
              </div>
              {error && <p style={{ marginTop: 14, fontSize: 13, color: "var(--ch-terracotta)" }}>{error}</p>}
            </>
          )}

          {step === 5 && (
            <>
              <StepTitle>Listo. Te esperamos en La Alameda.</StepTitle>
              <div style={{ marginTop: 16, background: "var(--ch-linen)", padding: 20, borderRadius: 2, fontSize: 14, display: "flex", flexDirection: "column", gap: 4 }}>
                <p style={{ margin: 0 }}><span style={{ color: "var(--ch-mocha)" }}>Reserva</span> · Nº {code}</p>
                <p style={{ margin: 0 }}><span style={{ color: "var(--ch-mocha)" }}>Servicio</span> · {svc?.name} · {svc?.categoria}, {svc?.durationMin} min</p>
                <p style={{ margin: 0 }}><span style={{ color: "var(--ch-mocha)" }}>Profesional</span> · {pro?.name}</p>
                <p style={{ margin: 0, textTransform: "capitalize" }}><span style={{ color: "var(--ch-mocha)", textTransform: "none" }}>Cuándo</span> · {whenLabel} h</p>
              </div>
              <p style={{ margin: "12px 0 0", fontSize: 13, color: "var(--ch-mocha)", lineHeight: 1.6 }}>
                Te confirmamos por WhatsApp o email. Podés reprogramar o cancelar hasta 24 hs antes.
              </p>
              <div style={{ marginTop: 16, display: "flex", flexWrap: "wrap", gap: 16, alignItems: "center" }}>
                {icsHref && (
                  <a href={icsHref} download="turno-ch-estetica.ics" style={{ color: accent, textDecoration: "underline", textUnderlineOffset: 4, fontSize: 15 }}>
                    Agregar a mi calendario
                  </a>
                )}
                {waHref && (
                  <a href={waHref} target="_blank" rel="noopener noreferrer" style={{ color: accent, textDecoration: "underline", textUnderlineOffset: 4, fontSize: 15 }}>
                    Confirmar por WhatsApp
                  </a>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer del modal */}
        <div style={{ padding: "16px 24px", borderTop: "1px solid var(--ch-hairline)", display: "flex", alignItems: "center", justifyContent: "space-between", background: "var(--ch-ivory)" }}>
          <button
            type="button"
            onClick={back}
            disabled={step === 1 || step === 5}
            style={{ background: "none", border: 0, fontSize: 14, color: "var(--ch-mocha)", cursor: step === 1 || step === 5 ? "default" : "pointer", opacity: step === 1 || step === 5 ? 0.4 : 1 }}
          >
            Volver
          </button>
          <button
            type="button"
            onClick={next}
            disabled={!canNext || submitting}
            style={{
              padding: "8px 20px",
              border: 0,
              fontSize: 15,
              color: "var(--ch-ivory)",
              cursor: !canNext || submitting ? "not-allowed" : "pointer",
              background: !canNext || submitting ? "var(--ch-clay)" : "var(--ch-ink)",
            }}
          >
            {nextLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function StepTitle({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: "1.25rem", fontWeight: 420, margin: "0 0 16px" }}>
      {children}
    </p>
  );
}

function Step1({
  groups,
  svc,
  onPick,
  rowSelected,
}: {
  groups: BookingGroup[];
  svc: SelectedService | null;
  onPick: (s: SelectedService) => void;
  rowSelected: (on: boolean) => React.CSSProperties;
}) {
  return (
    <>
      <StepTitle>Elegí el servicio</StepTitle>
      {groups.map((g) => (
        <div key={g.id} style={{ marginBottom: 12 }}>
          <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".08em", color: "var(--ch-mocha)", margin: "0 0 4px" }}>{g.name}</p>
          {g.services.map((it) => {
            const on = svc?.id === it.id;
            return (
              <button
                key={it.id}
                type="button"
                onClick={() => onPick({ ...it, categoria: g.name })}
                style={{
                  display: "flex",
                  width: "100%",
                  justifyContent: "space-between",
                  alignItems: "center",
                  textAlign: "left",
                  padding: "10px 8px",
                  border: 0,
                  borderBottom: "1px solid var(--ch-hairline)",
                  cursor: "pointer",
                  fontSize: 15,
                  fontFamily: "var(--font-body), system-ui, sans-serif",
                  ...rowSelected(on),
                }}
              >
                <span>{it.name}</span>
                <span style={{ fontSize: 12, opacity: 0.75 }}>{it.durationMin} min · ${it.price.toLocaleString("es-AR")}</span>
              </button>
            );
          })}
        </div>
      ))}
    </>
  );
}

function Field({
  label,
  value,
  onChange,
  type,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type: string;
}) {
  return (
    <label style={{ display: "block" }}>
      <span style={{ fontSize: 14, color: "var(--ch-mocha)" }}>{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          marginTop: 4,
          width: "100%",
          boxSizing: "border-box",
          background: "rgba(230,221,206,.6)",
          border: "1px solid var(--ch-clay)",
          padding: "8px 12px",
          borderRadius: 0,
          fontSize: 15,
          fontFamily: "var(--font-body), system-ui, sans-serif",
          color: "var(--ch-ink)",
        }}
      />
    </label>
  );
}
