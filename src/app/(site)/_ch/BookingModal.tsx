"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { getAvailableSlots, createBookingFromModal } from "@/lib/actions";
import { checkCoupon } from "@/lib/coupon-actions";
import { fmtTime, wallHourMinuteInBusinessTz } from "@/lib/datetime";
import { useWhatsAppCta } from "@/components/whatsapp-cta";
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
  const { requestWhatsApp } = useWhatsAppCta();
  const [step, setStep] = useState(1);
  const [svc, setSvc] = useState<SelectedService | null>(null);
  const [pro, setPro] = useState<BookingProfessional | null>(null);
  // Vecino/a de La Alameda (ADR-013): se pregunta en el primer paso porque
  // cambia el precio que se ve de cada servicio — antes de que el cliente
  // elija, no después.
  const [isResident, setIsResident] = useState(false);
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

  // Disponibilidad por día, precalculada para todo el rango visible apenas
  // hay profesional+servicio elegidos — así el calendario ya llega "pintado"
  // (verde/gris) al paso 3, en vez de que el cliente tenga que ir tocando
  // día por día para descubrir cuál tiene lugar (patrón tomado de TuTurno).
  const [dayAvailability, setDayAvailability] = useState<Record<string, string[]>>({});
  const [availabilityKey, setAvailabilityKey] = useState<string | null>(null);
  const [prefetchingAvailability, setPrefetchingAvailability] = useState(false);

  // Cupón de descuento (ADR-014). El descuento que se ve acá es solo preview
  // — el que realmente se cobra se vuelve a calcular server-side al confirmar.
  const [couponInput, setCouponInput] = useState("");
  const [couponApplied, setCouponApplied] = useState<{ code: string; discount: number } | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [couponChecking, setCouponChecking] = useState(false);

  const dialogRef = useRef<HTMLDivElement>(null);

  // Accesibilidad del modal (funnel de reserva): Escape cierra; el foco queda
  // ATRAPADO dentro del modal (Tab/Shift+Tab no se escapan al fondo); al abrir se
  // enfoca el diálogo y al cerrar se devuelve el foco al disparador; y se bloquea
  // el scroll del fondo mientras está abierto.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    dialog?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab" || !dialog) return;
      const focusables = dialog.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      previouslyFocused?.focus?.();
    };
  }, [onClose]);

  // Profesionales que hacen el servicio elegido.
  const prosForService = useMemo(
    () => (svc ? data.professionals.filter((p) => p.serviceIds.includes(svc.id)) : []),
    [svc, data.professionals]
  );

  function selectDay(value: string) {
    setDay(value);
    setSlot(null);
    const cached = dayAvailability[value];
    if (cached) {
      setSlots(cached);
      return;
    }
    setSlots([]);
    if (!pro || !svc) return;
    startSlots(async () => {
      const result = await getAvailableSlots(pro.id, svc.id, value);
      setSlots(result);
      setDayAvailability((prev) => ({ ...prev, [value]: result }));
    });
  }

  // Precalienta la disponibilidad de todos los días visibles apenas hay
  // profesional+servicio — así el calendario del paso 3 llega listo.
  useEffect(() => {
    if (!pro || !svc) return;
    const key = `${pro.id}:${svc.id}`;
    if (availabilityKey === key) return;
    setAvailabilityKey(key);
    setDayAvailability({});
    setPrefetchingAvailability(true);
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(
        data.days.map(async (d) => [d.value, await getAvailableSlots(pro.id, svc.id, d.value)] as const)
      );
      if (cancelled) return;
      const map: Record<string, string[]> = {};
      for (const [k, v] of entries) map[k] = v;
      setDayAvailability(map);
      setPrefetchingAvailability(false);
      // Si todavía no eligió día, saltar directo al primero con lugar.
      setDay((currentDay) => {
        if (currentDay) return currentDay;
        const firstFree = data.days.find((d) => (map[d.value]?.length ?? 0) > 0);
        if (firstFree) {
          setSlots(map[firstFree.value]);
          return firstFree.value;
        }
        return currentDay;
      });
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pro, svc]);

  // Horarios agrupados como en TuTurno: mañana / tarde, en vez de una sola
  // grilla plana — se escanea más rápido con la vista partida.
  const slotsGrouped = useMemo(() => {
    const mañana: string[] = [];
    const tarde: string[] = [];
    for (const s of slots) {
      const { hour } = wallHourMinuteInBusinessTz(new Date(s));
      (hour < 13 ? mañana : tarde).push(s);
    }
    return { mañana, tarde };
  }, [slots]);

  const canNext = [
    false,
    !!svc,
    !!pro,
    !!(day && slot),
    !!(name.trim() && tel.trim()),
    true,
  ][step];

  // Precio base (ya con el beneficio vecino aplicado si corresponde) y precio
  // final con el cupón — el que se muestra acá es preview, el real se
  // recalcula server-side al confirmar (nunca se confía en el del cliente).
  const basePrice = svc ? (isResident && svc.residentPrice != null ? svc.residentPrice : svc.price) : 0;
  const finalPrice = Math.max(0, basePrice - (couponApplied?.discount ?? 0));

  async function applyCoupon() {
    if (!svc || !couponInput.trim()) return;
    setCouponChecking(true);
    setCouponError(null);
    const res = await checkCoupon(couponInput, basePrice);
    setCouponChecking(false);
    if (res.ok) {
      setCouponApplied({ code: res.coupon.code, discount: res.discount });
    } else {
      setCouponApplied(null);
      setCouponError(res.reason);
    }
  }

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
        isResident,
        couponCode: couponApplied?.code,
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

  const accent = "var(--accent)";
  const rowSelected = (on: boolean) =>
    on
      ? { background: accent, color: "var(--text-on-accent)", borderColor: accent }
      : { background: "transparent", color: "var(--text-strong)", borderColor: "var(--line-strong)" };

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

  // El CTA nunca abre a un número hardcodeado (ver WhatsAppCtaProvider en el
  // layout): si `data.whatsapp` no tiene un real configurado, el primer clic
  // pide el número ahí mismo antes de abrir WhatsApp.
  const waMessage = svc
    ? `Hola! Confirmo mi turno en CH Estética: ${svc.name}${whenLabel ? " — " + whenLabel : ""}${pro ? " con " + pro.name : ""}`
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
        ref={dialogRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="booking-modal-title"
        style={{
          width: "100%",
          maxWidth: 512,
          background: "var(--surface-raised)",
          color: "var(--text-strong)",
          borderRadius: 2,
          boxShadow: "0 25px 50px -12px rgba(0,0,0,.35)",
          maxHeight: "92vh",
          overflow: "auto",
          fontFamily: "var(--font-body), system-ui, sans-serif",
        }}
      >
        {/* Header del modal */}
        <div style={{ padding: "24px 24px 0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div id="booking-modal-title" style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: 18, color: "var(--accent)" }}>
              CH
            </span>
            <span style={{ textTransform: "uppercase", letterSpacing: ".22em", fontWeight: 600, fontSize: ".75rem", color: "var(--text-muted)" }}>
              Reservar
            </span>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar" style={{ background: "none", border: 0, color: "var(--text-muted)", fontSize: 22, lineHeight: 1, cursor: "pointer" }}>
            ×
          </button>
        </div>

        {/* Progreso */}
        <div style={{ padding: "16px 24px 0" }}>
          <div style={{ height: 1, background: "var(--line)" }}>
            <div style={{ height: 1, background: accent, width: `${step * 20}%`, transition: "width .3s" }} />
          </div>
          <p style={{ margin: "8px 0 0", fontSize: 12, color: "var(--text-muted)" }}>
            Paso {step} de 5 · {STEP_LABELS[step]}
          </p>
        </div>

        {/* Cuerpo */}
        <div style={{ padding: 24, minHeight: 300 }}>
          {step === 1 && (
            <Step1
              groups={data.groups}
              svc={svc}
              onPick={setSvc}
              rowSelected={rowSelected}
              isResident={isResident}
              onResidentChange={setIsResident}
            />
          )}

          {step === 2 && (
            <>
              <StepTitle>Elegí profesional</StepTitle>
              {prosForService.length === 0 ? (
                <p style={{ fontSize: 14, color: "var(--text-muted)" }}>
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
                        aria-pressed={on}
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
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, marginBottom: 8 }}>
                {data.days.map((d) => {
                  const on = day === d.value;
                  const known = dayAvailability[d.value];
                  const hasSlots = known ? known.length > 0 : null; // null = todavía no se sabe
                  // Verde = hay lugar, rojo apagado = sin lugar ese día, gris = cargando.
                  // El color no reemplaza el estado de selección (ring), solo adelanta
                  // información — igual que el calendario de TuTurno.
                  const bg = on ? accent : hasSlots === true ? "var(--success-soft)" : hasSlots === false ? "var(--danger-soft)" : "transparent";
                  const border = on ? accent : hasSlots === true ? "var(--success)" : hasSlots === false ? "var(--danger)" : "var(--line-strong)";
                  return (
                    <button
                      key={d.value}
                      type="button"
                      aria-pressed={on}
                      aria-label={`${d.label}${hasSlots === true ? ", con horarios disponibles" : hasSlots === false ? ", sin horarios ese día" : ""}`}
                      onClick={() => selectDay(d.value)}
                      style={{
                        border: "1px solid",
                        borderColor: border,
                        background: bg,
                        color: on ? "var(--text-on-accent)" : "var(--text-strong)",
                        padding: "8px 4px",
                        borderRadius: 2,
                        fontSize: 12,
                        cursor: "pointer",
                        textTransform: "capitalize",
                        opacity: hasSlots === false && !on ? 0.6 : 1,
                      }}
                    >
                      {d.label}
                    </button>
                  );
                })}
              </div>
              {prefetchingAvailability && (
                <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "0 0 16px" }}>Buscando los próximos días con lugar…</p>
              )}
              {!prefetchingAvailability && <div style={{ marginBottom: 16 }} />}

              {!day && <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>Elegí un día para ver los horarios disponibles.</p>}
              {day && slotsPending && <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>Buscando horarios…</p>}
              {day && !slotsPending && slots.length === 0 && (
                <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>No hay horarios disponibles ese día.</p>
              )}
              {day && !slotsPending && slots.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  {slotsGrouped.mañana.length > 0 && (
                    <div>
                      <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".08em", color: "var(--text-muted)", margin: "0 0 8px" }}>
                        Por la mañana
                      </p>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                        {slotsGrouped.mañana.map((s) => (
                          <button
                            key={s}
                            type="button"
                            aria-pressed={slot === s}
                            onClick={() => setSlot(s)}
                            style={{ border: "1px solid", padding: "8px 14px", borderRadius: 2, fontSize: 14, cursor: "pointer", ...rowSelected(slot === s) }}
                          >
                            {fmtTime(s)}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {slotsGrouped.tarde.length > 0 && (
                    <div>
                      <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".08em", color: "var(--text-muted)", margin: "0 0 8px" }}>
                        Por la tarde
                      </p>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                        {slotsGrouped.tarde.map((s) => (
                          <button
                            key={s}
                            type="button"
                            aria-pressed={slot === s}
                            onClick={() => setSlot(s)}
                            style={{ border: "1px solid", padding: "8px 14px", borderRadius: 2, fontSize: 14, cursor: "pointer", ...rowSelected(slot === s) }}
                          >
                            {fmtTime(s)}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {step === 4 && (
            <>
              <StepTitle>Tus datos</StepTitle>
              <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "0 0 16px" }}>Solo lo necesario para confirmarte.</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <Field label="Nombre" value={name} onChange={setName} type="text" />
                <Field label="Teléfono" value={tel} onChange={setTel} type="tel" />
                <Field label="Email (opcional)" value={mail} onChange={setMail} type="email" />
              </div>

              {/* Cupón de descuento (ADR-014) */}
              <div style={{ marginTop: 20 }}>
                <label style={{ fontSize: 13, color: "var(--text-muted)", display: "block", marginBottom: 6 }}>
                  ¿Tenés un cupón?
                </label>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    type="text"
                    value={couponInput}
                    onChange={(e) => {
                      setCouponInput(e.target.value);
                      setCouponApplied(null);
                      setCouponError(null);
                    }}
                    placeholder="Código"
                    style={{
                      flex: 1,
                      boxSizing: "border-box",
                      background: "var(--surface-sunken)",
                      border: "1px solid var(--line-strong)",
                      padding: "8px 12px",
                      borderRadius: 0,
                      fontSize: 14,
                      textTransform: "uppercase",
                      color: "var(--text-strong)",
                    }}
                  />
                  <button
                    type="button"
                    onClick={applyCoupon}
                    disabled={!couponInput.trim() || couponChecking}
                    style={{
                      border: "1px solid var(--text-strong)",
                      background: "transparent",
                      padding: "0 16px",
                      fontSize: 13,
                      cursor: couponInput.trim() ? "pointer" : "default",
                      opacity: couponInput.trim() ? 1 : 0.5,
                    }}
                  >
                    {couponChecking ? "…" : "Aplicar"}
                  </button>
                </div>
                {couponApplied && (
                  <p style={{ marginTop: 6, fontSize: 12, color: "var(--success)" }}>
                    Cupón {couponApplied.code} aplicado: −${couponApplied.discount.toLocaleString("es-AR")}
                  </p>
                )}
                {couponError && <p style={{ marginTop: 6, fontSize: 12, color: "var(--danger)" }}>{couponError}</p>}
              </div>

              {/* Resumen de precio */}
              {svc && (
                <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid var(--line)", fontSize: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "var(--text-muted)" }}>{svc.name}</span>
                    <span>${basePrice.toLocaleString("es-AR")}</span>
                  </div>
                  {couponApplied && (
                    <div style={{ display: "flex", justifyContent: "space-between", color: "var(--success)" }}>
                      <span>Cupón {couponApplied.code}</span>
                      <span>−${couponApplied.discount.toLocaleString("es-AR")}</span>
                    </div>
                  )}
                  <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 600, marginTop: 4 }}>
                    <span>Total</span>
                    <span>${finalPrice.toLocaleString("es-AR")}</span>
                  </div>
                  {svc.depositAmount != null && (
                    <p style={{ marginTop: 10, fontSize: 12.5, color: "var(--warning)", lineHeight: 1.5 }}>
                      Seña obligatoria para confirmar: ${svc.depositAmount.toLocaleString("es-AR")}. Te
                      contactamos por WhatsApp para coordinar el pago.
                    </p>
                  )}
                </div>
              )}

              {error && <p style={{ marginTop: 14, fontSize: 13, color: "var(--danger)" }}>{error}</p>}
            </>
          )}

          {step === 5 && (
            <>
              <StepTitle>Listo. Te esperamos en La Alameda.</StepTitle>
              <div style={{ marginTop: 16, background: "var(--surface-sunken)", padding: 20, borderRadius: 2, fontSize: 14, display: "flex", flexDirection: "column", gap: 4 }}>
                <p style={{ margin: 0 }}><span style={{ color: "var(--text-muted)" }}>Reserva</span> · Nº {code}</p>
                <p style={{ margin: 0 }}><span style={{ color: "var(--text-muted)" }}>Servicio</span> · {svc?.name} · {svc?.categoria}, {svc?.durationMin} min</p>
                <p style={{ margin: 0 }}><span style={{ color: "var(--text-muted)" }}>Profesional</span> · {pro?.name}</p>
                <p style={{ margin: 0, textTransform: "capitalize" }}><span style={{ color: "var(--text-muted)", textTransform: "none" }}>Cuándo</span> · {whenLabel} h</p>
              </div>
              <p style={{ margin: "12px 0 0", fontSize: 13, color: "var(--text-muted)", lineHeight: 1.6 }}>
                Te confirmamos por WhatsApp o email. Podés reprogramar o cancelar hasta 24 hs antes.
                {svc?.depositAmount != null && (
                  <> Recordá que para confirmar el turno hay una seña de ${svc.depositAmount.toLocaleString("es-AR")} — te escribimos para coordinarla.</>
                )}
              </p>
              <div style={{ marginTop: 16, display: "flex", flexWrap: "wrap", gap: 16, alignItems: "center" }}>
                {icsHref && (
                  <a href={icsHref} download="turno-ch-estetica.ics" style={{ color: accent, textDecoration: "underline", textUnderlineOffset: 4, fontSize: 15 }}>
                    Agregar a mi calendario
                  </a>
                )}
                {waMessage && (
                  <button
                    type="button"
                    onClick={() => requestWhatsApp(waMessage)}
                    style={{ background: "none", border: "none", padding: 0, font: "inherit", color: accent, textDecoration: "underline", textUnderlineOffset: 4, fontSize: 15, cursor: "pointer" }}
                  >
                    Confirmar por WhatsApp
                  </button>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer del modal */}
        <div style={{ padding: "16px 24px", borderTop: "1px solid var(--line)", display: "flex", alignItems: "center", justifyContent: "space-between", background: "var(--surface-raised)" }}>
          <button
            type="button"
            onClick={back}
            disabled={step === 1 || step === 5}
            style={{ background: "none", border: 0, fontSize: 14, color: "var(--text-muted)", cursor: step === 1 || step === 5 ? "default" : "pointer", opacity: step === 1 || step === 5 ? 0.4 : 1 }}
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
              color: "var(--text-on-accent)",
              cursor: !canNext || submitting ? "not-allowed" : "pointer",
              background: !canNext || submitting ? "var(--line-strong)" : "var(--text-strong)",
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

// Toggle "¿Sos vecino/a?" — se muestra arriba de todo el listado de
// servicios porque cambia qué precio ve el cliente en cada uno. Encuadrado
// como beneficio ("tenés precio especial"), nunca como pregunta de control.
function ResidentToggle({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        padding: "10px 12px",
        marginBottom: 16,
        background: "var(--surface-sunken)",
        borderRadius: 2,
      }}
    >
      <span style={{ fontSize: 13, color: "var(--text-strong)" }}>
        ¿Sos vecino/a de <strong>La Alameda</strong>? Tenés precio especial en algunos servicios.
      </span>
      <div style={{ display: "flex", border: "1px solid var(--line-strong)", borderRadius: 2, flexShrink: 0 }}>
        {[
          { label: "No", val: false },
          { label: "Sí", val: true },
        ].map((opt) => {
          const on = value === opt.val;
          return (
            <button
              key={opt.label}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(opt.val)}
              style={{
                border: 0,
                padding: "6px 14px",
                fontSize: 13,
                cursor: "pointer",
                background: on ? "var(--accent)" : "transparent",
                color: on ? "var(--text-on-accent)" : "var(--text-strong)",
              }}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Step1({
  groups,
  svc,
  onPick,
  rowSelected,
  isResident,
  onResidentChange,
}: {
  groups: BookingGroup[];
  svc: SelectedService | null;
  onPick: (s: SelectedService) => void;
  rowSelected: (on: boolean) => React.CSSProperties;
  isResident: boolean;
  onResidentChange: (v: boolean) => void;
}) {
  return (
    <>
      <StepTitle>Elegí el servicio</StepTitle>
      <ResidentToggle value={isResident} onChange={onResidentChange} />
      {groups.map((g) => (
        <div key={g.id} style={{ marginBottom: 12 }}>
          <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".08em", color: "var(--text-muted)", margin: "0 0 4px" }}>{g.name}</p>
          {g.services.map((it) => {
            const on = svc?.id === it.id;
            const hasResidentPrice = it.residentPrice != null;
            const shownPrice = isResident && hasResidentPrice ? it.residentPrice! : it.price;
            return (
              <button
                key={it.id}
                type="button"
                aria-pressed={on}
                onClick={() => onPick({ ...it, categoria: g.name })}
                style={{
                  display: "flex",
                  width: "100%",
                  justifyContent: "space-between",
                  alignItems: "center",
                  textAlign: "left",
                  padding: "10px 8px",
                  border: 0,
                  borderBottom: "1px solid var(--line)",
                  cursor: "pointer",
                  fontSize: 15,
                  fontFamily: "var(--font-body), system-ui, sans-serif",
                  ...rowSelected(on),
                }}
              >
                <span>{it.name}</span>
                <span style={{ fontSize: 12, opacity: 0.75, textAlign: "right" }}>
                  {it.durationMin} min · ${shownPrice.toLocaleString("es-AR")}
                  {hasResidentPrice && !isResident && (
                    <span style={{ display: "block", opacity: 0.85 }}>
                      Vecino/a ${it.residentPrice!.toLocaleString("es-AR")}
                    </span>
                  )}
                  {it.depositAmount != null && (
                    <span style={{ display: "block", opacity: 0.7, fontSize: 11 }}>Requiere seña</span>
                  )}
                </span>
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
      <span style={{ fontSize: 14, color: "var(--text-muted)" }}>{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          marginTop: 4,
          width: "100%",
          boxSizing: "border-box",
          background: "var(--surface-sunken)",
          border: "1px solid var(--line-strong)",
          padding: "8px 12px",
          borderRadius: 0,
          fontSize: 15,
          fontFamily: "var(--font-body), system-ui, sans-serif",
          color: "var(--text-strong)",
        }}
      />
    </label>
  );
}
