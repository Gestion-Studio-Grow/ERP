"use client";

import { useEffect, useId, useMemo, useRef, useState, useTransition } from "react";
import { precioCongeladoDeReserva } from "@/lib/turnos/precio-reserva";
import { getAvailableSlots, getAvailableSlotsRange, createBookingFromModal } from "@/lib/actions";
import { checkCoupon } from "@/lib/coupon-actions";
import { isValidEmail, isValidArgentinePhone } from "@/lib/contact-validation";
import { fmtDateTime, fmtTime, wallHourMinuteInBusinessTz } from "@/lib/datetime";
import { useWhatsAppCta } from "@/components/whatsapp-cta";
import { useNegocioDelSitio } from "./negocio-del-sitio";
import { useDiseno } from "@/lib/diseno/DisenoProvider";
import type { PrefillReserva } from "./BookingProvider";
import { borrarReservaGuardada, guardarReserva } from "./reserva-guardada";
import { faltaParaSeguir } from "./reserva-falta";
import type { BookingData, BookingGroup, BookingProfessional, BookingService } from "./types";

const STEP_LABELS = ["", "Servicio", "Profesional", "Día y hora", "Datos", "Confirmación"];

type SelectedService = BookingService & { categoria: string };

// «Continuar» y «Confirmar» son el mismo botón: el segundo toque de un doble toque en el paso 3 caería en «Confirmar».
const VENTANA_DOBLE_TOQUE_MS = 500;

// Diseño nuevo de CH: el modal puede abrir con servicio, profesional, día y hora ya elegidos (la agenda viva, un
// renglón de la carta, la ficha). Sólo se toma lo que existe en los datos públicos y encadena: un profesional que
// no hace ese servicio, o un día fuera de los 14 visibles, se descarta y el modal arranca en el paso anterior. El
// horario igual lo vuelve a validar el servidor al confirmar (createBookingFromModal). Sin prefill: paso 1.
function estadoInicial(data: BookingData, prefill: PrefillReserva | null | undefined) {
  const vacio = { step: 1, svc: null as SelectedService | null, pro: null as BookingProfessional | null, day: null as string | null, slot: null as string | null };
  if (!prefill?.serviceId) return vacio;
  let svc: SelectedService | null = null;
  for (const g of data.groups) {
    const it = g.services.find((x) => x.id === prefill.serviceId);
    if (it) {
      svc = { ...it, categoria: g.name };
      break;
    }
  }
  if (!svc) return vacio;
  const elegido = svc;
  // `paso` (una reserva guardada al recargar): quien volvió atrás a cambiar algo vuelve a ese paso, no al más lejano.
  const hasta = (n: number) => Math.min(n, prefill.paso ?? n);
  const pro = prefill.professionalId
    ? (data.professionals.find((p) => p.id === prefill.professionalId && p.serviceIds.includes(elegido.id)) ?? null)
    : null;
  if (!pro) return { ...vacio, step: hasta(2), svc };
  const day = prefill.day && data.days.some((d) => d.value === prefill.day) ? prefill.day : null;
  const slot = day && prefill.slot ? prefill.slot : null;
  if (!day || !slot) return { ...vacio, step: hasta(3), svc, pro, day };
  return { step: hasta(4), svc, pro, day, slot };
}

export default function BookingModal({
  data,
  onClose,
  prefill,
  onReservado,
}: {
  data: BookingData;
  onClose: () => void;
  prefill?: PrefillReserva | null;
  /** Se confirmó el turno: la agenda viva relee sin esperar a que se cierre el modal. */
  onReservado?: () => void;
}) {
  const { requestWhatsApp } = useWhatsAppCta();
  const negocio = useNegocioDelSitio();
  // Piel del diseño nuevo (sólo CH con su interruptor prendido; ver layout de (site)). Apagado, `k()` no pone
  // ninguna clase y el modal es el de siempre.
  const nuevo = useDiseno();
  const k = (c: string) => (nuevo ? c : undefined);
  const [inicio] = useState(() => estadoInicial(data, prefill));
  const [step, setStep] = useState(inicio.step);
  const [svc, setSvc] = useState<SelectedService | null>(inicio.svc);
  const [pro, setPro] = useState<BookingProfessional | null>(inicio.pro);
  // Vecino/a de La Alameda (ADR-013): se pregunta en el primer paso porque
  // cambia el precio que se ve de cada servicio — antes de que el cliente
  // elija, no después.
  const [isResident, setIsResident] = useState(prefill?.vecina === true);
  const [day, setDay] = useState<string | null>(inicio.day);
  const [slot, setSlot] = useState<string | null>(inicio.slot); // ISO UTC
  // Si el día llegó precargado, sus horarios se muestran cuando llega la disponibilidad (por si vuelve al paso 3).
  const diaPrecargado = useRef<string | null>(inicio.day);
  // La hora precargada puede haberse ocupado mientras tanto (se recargó, pasó el tiempo): se avisa antes de pedir datos.
  const horaPrecargada = useRef<string | null>(inicio.slot);
  const [horaOcupada, setHoraOcupada] = useState(false);
  const [slots, setSlots] = useState<string[]>([]);
  // Las horas que el servidor rechazó, sólo en memoria: salen de la lista sin releer. Con otro servicio o profesional se olvidan.
  const [horasRechazadas, setHorasRechazadas] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [tel, setTel] = useState("");
  const [mail, setMail] = useState("");
  const [reservaId, setReservaId] = useState<string | null>(null);
  const code = reservaId ? reservaId.slice(-6).toUpperCase() : null;
  const [confirmedStartsAt, setConfirmedStartsAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Doble toque: `submitting` recién apaga el botón en el render siguiente; la ref frena ya el segundo envío.
  const confirmando = useRef(false);
  const llegadaAlPaso4 = useRef(0);
  // Diseño nuevo: «Continuar»/«Confirmar» no quedan muertos; al tocarlos sin completar, se dice qué falta (faltaParaSeguir).
  // Guarda EN QUÉ PASO se intentó: al cambiar de paso, por el camino que sea, el aviso no viaja.
  const [intentoEn, setIntentoEn] = useState(0);
  // Sube cada vez que cambia el servicio o la profesional: lo que llegue de antes no vale.
  const eleccionActual = useRef(0);
  // El último día que tocó la clienta: de la lista de horarios sólo manda la respuesta de ese día.
  const diaPedido = useRef<string | null>(null);
  const intento = intentoEn === step;
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
  const idCupon = useId();

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
    setHoraOcupada(false);
    // El día que toca la clienta manda: una búsqueda en curso ya no le cambia la lista.
    diaPrecargado.current = null;
    horaPrecargada.current = null;
    diaPedido.current = value;
    const cached = dayAvailability[value];
    if (cached) {
      setSlots(cached);
      return;
    }
    setSlots([]);
    if (!pro || !svc) return;
    const eleccion = eleccionActual.current;
    startSlots(async () => {
      const result = await getAvailableSlots(pro.id, svc.id, value);
      if (eleccion !== eleccionActual.current) return; // Es de la combinación anterior.
      setDayAvailability((prev) => ({ ...prev, [value]: result }));
      // Respuesta tardía de otro día: vale para ese día, pero no pisa la lista del que está marcado (H2).
      if (diaPedido.current === value) setSlots(result);
    });
  }

  // Precalienta la disponibilidad de todos los días visibles apenas hay
  // profesional+servicio — así el calendario del paso 3 llega listo.
  // Cambiar de profesional o de servicio INVALIDA la disponibilidad ya traída. Ese
  // borrón se ajusta durante el render comparándolo con la combinación anterior — el
  // patrón de React para "reiniciar estado cuando cambian las props". Antes vivía
  // dentro del efecto, donde un `setState` síncrono provoca un render en cascada.
  const claveActual = pro && svc ? `${pro.id}:${svc.id}` : null;
  if (claveActual && availabilityKey !== claveActual) {
    setAvailabilityKey(claveActual);
    setDayAvailability({});
    setPrefetchingAvailability(true);
  }

  useEffect(() => {
    if (!pro || !svc) return;
    let cancelled = false;
    (async () => {
      // Una sola llamada batch por los 14 días — antes era una server action por
      // día (~7 queries × 14). El motor lee los datos compartidos una vez y trae
      // los turnos/bloqueos del rango completo de una (getAvailableSlotsRange).
      const map = await getAvailableSlotsRange(
        pro.id,
        svc.id,
        data.days.map((d) => d.value)
      );
      if (cancelled) return;
      setDayAvailability(map);
      setPrefetchingAvailability(false);
      if (diaPrecargado.current) {
        const libres = map[diaPrecargado.current] ?? [];
        setSlots(libres);
        const hora = horaPrecargada.current;
        if (hora && !libres.includes(hora)) {
          setSlot((actual) => (actual === hora ? null : actual));
          setHoraOcupada(true);
          setStep((s) => (s === 4 ? 3 : s));
        }
        diaPrecargado.current = null;
        horaPrecargada.current = null;
      }
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

  // Diseño nuevo (P1-2, QA 16): lo elegido sobrevive a un recargar, en esta pestaña. Sólo la elección: nombre, teléfono,
  // email y cupón no se guardan (son datos de una persona y este navegador puede ser de cualquiera). Confirmado, se borra.
  useEffect(() => {
    if (!nuevo) return;
    if (step >= 5) {
      borrarReservaGuardada();
      return;
    }
    if (svc) guardarReserva({ paso: step, serviceId: svc.id, professionalId: pro?.id, day: day ?? undefined, slot: slot ?? undefined, vecina: isResident || undefined });
  }, [nuevo, step, svc, pro, day, slot, isResident]);

  // Horarios agrupados como en TuTurno: mañana / tarde, en vez de una sola
  // grilla plana — se escanea más rápido con la vista partida.
  const horasDelDia = useMemo(() => slots.filter((s) => !horasRechazadas.includes(s)), [slots, horasRechazadas]);
  const slotsGrouped = useMemo(() => {
    const mañana: string[] = [];
    const tarde: string[] = [];
    for (const s of horasDelDia) {
      const { hour } = wallHourMinuteInBusinessTz(new Date(s));
      (hour < 13 ? mañana : tarde).push(s);
    }
    return { mañana, tarde };
  }, [horasDelDia]);

  // CH-A1: el "Confirmar" del paso 4 se habilita SOLO con teléfono válido (canal del recordatorio)
  // y, si se cargó email, con email válido. Antes bastaba con que no estuvieran vacíos → entraba un
  // turno con datos de contacto rotos y el aviso nunca llegaba.
  const telValid = isValidArgentinePhone(tel);
  const mailValid = mail.trim() === "" || isValidEmail(mail);
  const telError = tel.trim() !== "" && !telValid ? "Teléfono inválido (ej: 11 2345 6789)." : intento && !telValid ? "Falta tu teléfono: por ahí te confirmamos." : null;
  const nameError = intento && !name.trim() ? "Falta tu nombre." : null;
  const mailError = mail.trim() !== "" && !mailValid ? "Ese email no parece válido." : null;

  const canNext = [
    false,
    !!svc,
    !!pro,
    !!(day && slot),
    !!(name.trim() && telValid && mailValid),
    true,
  ][step];
  const falta = intento
    ? faltaParaSeguir(step, {
        servicio: !!svc,
        profesional: !!pro,
        hayProfesionales: prosForService.length > 0,
        dia: !!day,
        diaSinHorarios: !!day && !slotsPending && !prefetchingAvailability && horasDelDia.length === 0,
        hora: !!slot,
        nombre: !!name.trim(),
        telefono: tel.trim() === "" ? "vacio" : telValid ? "valido" : "invalido",
        emailValido: mailValid,
      })
    : null;
  // Diseño nuevo: un solo aviso, en el pie, que queda a la vista aunque el paso sea largo.
  const avisoPie = !nuevo
    ? null
    : falta ?? (step === 4 ? error : null) ?? (step === 3 && horaOcupada && !slot ? "La hora que tenías elegida se ocupó. Elegí otra." : null);

  // Precio base (ya con el beneficio vecino aplicado si corresponde) y precio
  // final con el cupón — el que se muestra acá es preview, el real se
  // recalcula server-side al confirmar (nunca se confía en el del cliente).
  //
  // La regla se LLAMA, no se reescribe: `precio-reserva.ts` es puro y sin imports
  // justamente para que esta pantalla pueda usar la misma que congela el turno. Que el
  // preview y el precio congelado se separen es la clienta viendo un número y pagando otro.
  const basePrice = svc ? precioCongeladoDeReserva(svc, isResident).priceAtBooking : 0;
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
    if (!pro || !svc || !slot || confirmando.current) return;
    confirmando.current = true;
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
      if (!res.ok) {
        // El motivo viene escrito para la clienta (horario ocupado, ya pasado…). Se queda en el paso 4 y no se relee nada:
        // una relectura acá podía dejar en la lista los horarios de un día que ya no es el marcado (H1).
        setError(res.error);
        // La hora sigue elegida mientras esté en el paso 4 (un cupón rechazado se puede sacar y reintentar); al volver, se va.
        setHorasRechazadas((h) => [...h, slot]);
        return;
      }
      setReservaId(res.id);
      setConfirmedStartsAt(res.startsAt);
      setStep(5);
      onReservado?.();
    } catch {
      // Sin red o el servidor no contestó: el mensaje del navegador no le sirve a nadie.
      setError("No pudimos confirmar tu turno: revisá la conexión y probá de nuevo.");
    } finally {
      confirmando.current = false;
      setSubmitting(false);
    }
  }

  function next() {
    if (step === 4 && Date.now() - llegadaAlPaso4.current < VENTANA_DOBLE_TOQUE_MS) return;
    if (nuevo && !canNext) {
      setIntentoEn(step);
      return;
    }
    setIntentoEn(0);
    // Un rechazo del servidor es de ESE intento: al seguir no acompaña a otra hora.
    if (nuevo) setError(null);
    if (step === 4) {
      confirmBooking();
      return;
    }
    if (step === 5) {
      onClose();
      return;
    }
    if (canNext) {
      if (step === 3) llegadaAlPaso4.current = Date.now();
      setStep(step + 1);
    }
  }

  // ELEGIR ES AVANZAR. Antes, tocar un servicio sólo lo pintaba de color: el botón
  // "Continuar" quedaba al final de los 70 servicios, fuera de la pantalla, así que
  // la sensación era que el clic no había hecho nada. Ahora la elección misma pasa
  // al paso siguiente, que es lo que hace cualquier reserva moderna. "Atrás" sigue
  // estando para cambiar de idea, y el paso 1 muestra igual el elegido si se vuelve.
  function elegirYSeguir(fn: () => void) {
    setIntentoEn(0);
    fn();
    setStep((sActual) => (sActual < 4 ? sActual + 1 : sActual));
  }
  // Otro servicio u otra profesional cambian qué horarios existen: se borran el día y la hora, y el efecto salta al primer
  // día con lugar en cuanto hay profesional y servicio. Una profesional que no hace el servicio nuevo no sigue elegida.
  function olvidarHorario() {
    eleccionActual.current += 1;
    setDay(null);
    setSlot(null);
    setSlots([]);
    setHorasRechazadas([]);
    setHoraOcupada(false);
    diaPrecargado.current = null;
    horaPrecargada.current = null;
  }
  function elegirServicio(elegido: SelectedService) {
    if (elegido.id !== svc?.id) {
      if (pro && !pro.serviceIds.includes(elegido.id)) setPro(null);
      olvidarHorario();
    }
    elegirYSeguir(() => setSvc(elegido));
  }
  function elegirProfesional(p: BookingProfessional) {
    if (p.id !== pro?.id) olvidarHorario();
    elegirYSeguir(() => setPro(p));
  }
  function back() {
    // Con la confirmación en curso no se vuelve: la respuesta encontraría a la clienta en otro paso (H3).
    if (submitting) return;
    setIntentoEn(0);
    if (nuevo) setError(null);
    if (slot && horasRechazadas.includes(slot)) setSlot(null);
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
      hour12: false, // 24h argentino (ADR-044/046) — es-AR por default rinde "a. m./p. m."
    }).format(new Date(confirmedStartsAt));

  const icsHref = useMemo(() => {
    if (!confirmedStartsAt || !svc) return null;
    const start = new Date(confirmedStartsAt);
    const end = new Date(start.getTime() + svc.durationMin * 60000);
    const z = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    const ics = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      negocio.esCH ? "PRODID:-//CH Estetica//ES" : "PRODID:-//Gestion Studio Grow//ES",
      "BEGIN:VEVENT",
      // UID y DTSTAMP salen del PROPIO turno, no del reloj: llamar a `Date.now()`
      // durante el render es impuro (y React 19 lo marca). De paso el archivo queda
      // estable — si el cliente lo agrega dos veces, el calendario reconoce el mismo
      // evento en vez de duplicarle el turno. El UID es el id del turno (P1-3): con la
      // hora, dos turnos a la misma hora se pisaban en el calendario.
      `UID:${reservaId ?? confirmedStartsAt}@${negocio.esCH ? "ch-estetica" : "gsgapp"}`,
      `DTSTAMP:${z(start)}`,
      `DTSTART:${z(start)}`,
      `DTEND:${z(end)}`,
      `SUMMARY:${negocio.nombre ? negocio.nombre + " — " : ""}${svc.name}`,
      `DESCRIPTION:${pro ? "Profesional: " + pro.name : "Turno confirmado"}`,
      // La dirección de CH sólo en el turno de CH; otro negocio, la suya (si la cargó) o ninguna.
      ...(negocio.esCH
        ? ["LOCATION:Barrio La Alameda\\, Canning\\, Buenos Aires"]
        : negocio.direccion
          ? [`LOCATION:${negocio.direccion.replace(/[,;\\]/g, (c) => "\\" + c)}`]
          : []),
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    return "data:text/calendar;charset=utf-8," + encodeURIComponent(ics);
  }, [confirmedStartsAt, reservaId, svc, pro, negocio]);

  // El CTA nunca abre a un número hardcodeado (ver WhatsAppCtaProvider en el
  // layout): si `data.whatsapp` no tiene un real configurado, el primer clic
  // pide el número ahí mismo antes de abrir WhatsApp.
  const waMessage = svc
    ? `Hola! Confirmo mi turno${negocio.nombre ? " en " + negocio.nombre : ""}: ${svc.name}${whenLabel ? " — " + whenLabel : ""}${pro ? " con " + pro.name : ""}`
    : null;

  return (
    <div
      onClick={onClose}
      className={k("chm-fondo")}
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
        className={k("chm")}
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
        <div className={k("chm-cab")} style={{ padding: "24px 24px 0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div id="booking-modal-title" style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            {nuevo ? (
              // El nombre del negocio del sitio (contexto), nunca «CH» escrito a mano.
              negocio.nombre && <span className="chm-marca">{negocio.nombre}</span>
            ) : (
              // El nombre del negocio (E1): «CH» sólo en CH; sin nombre, sólo «Reservar».
              (negocio.esCH || negocio.nombre) && (
                <span style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: 18, color: "var(--accent)", maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {negocio.esCH ? "CH" : negocio.nombre}
                </span>
              )
            )}
            <span style={{ textTransform: "uppercase", letterSpacing: ".22em", fontWeight: 600, fontSize: ".75rem", color: "var(--text-muted)" }}>
              Reservar
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className={k("chm-cerrar")}
            style={{
              background: "none",
              border: 0,
              color: "var(--text-muted)",
              fontSize: 22,
              lineHeight: 1,
              cursor: "pointer",
              // Touch target ≥ 44px (Gate SAP §accesibilidad): antes la × medía ~12×22px.
              width: 44,
              height: 44,
              display: "grid",
              placeItems: "center",
              margin: "-10px -10px 0 0", // compensa el área extra para no descolocar el header
            }}
          >
            ×
          </button>
        </div>

        {/* Progreso */}
        {nuevo ? (
          <div className="chm-progreso">
            <div className="chm-segmentos" aria-hidden>
              {[1, 2, 3, 4, 5].map((n) => (
                <span key={n} data-hecho={n <= step ? "" : undefined} />
              ))}
            </div>
            <p className="chm-paso">
              Paso {step} de 5 · {STEP_LABELS[step]}
            </p>
          </div>
        ) : (
        <div style={{ padding: "16px 24px 0" }}>
          <div style={{ height: 1, background: "var(--line)" }}>
            <div style={{ height: 1, background: accent, width: `${step * 20}%`, transition: "width var(--ch-transicion)" }} />
          </div>
          <p style={{ margin: "8px 0 0", fontSize: 12, color: "var(--text-muted)" }}>
            Paso {step} de 5 · {STEP_LABELS[step]}
          </p>
        </div>
        )}

        {/* Cuerpo */}
        <div className={k("chm-cuerpo")} style={{ padding: 24, minHeight: 300 }}>
          {step === 1 && (
            <Step1
              groups={data.groups}
              svc={svc}
              onPick={elegirServicio}
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
                <div className={k("chm-pros")} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  {prosForService.map((p) => {
                    const on = pro?.id === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        aria-pressed={on}
                        onClick={() => elegirProfesional(p)}
                        className={k("chm-pro")}
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
              {!nuevo && horaOcupada && !slot && (
                <p role="status" style={{ fontSize: 14, fontWeight: 600, color: "var(--text-strong)", margin: "0 0 12px" }}>
                  La hora que tenías elegida se ocupó. Elegí otra.
                </p>
              )}
              <div className={k("chm-dias")} style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, marginBottom: 8 }}>
                {data.days.map((d) => {
                  const on = day === d.value;
                  const known = dayAvailability[d.value]?.filter((s) => !horasRechazadas.includes(s));
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
                      className={k("chm-dia")}
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
                      {nuevo && <span className="chm-punto" aria-hidden data-hay={hasSlots === true ? "si" : undefined} />}
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
              {day && !slotsPending && !prefetchingAvailability && horasDelDia.length === 0 && (
                <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>No hay horarios disponibles ese día.</p>
              )}
              {day && !slotsPending && horasDelDia.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  {slotsGrouped.mañana.length > 0 && (
                    <div>
                      <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".08em", color: "var(--text-muted)", margin: "0 0 8px" }}>
                        Por la mañana
                      </p>
                      <div className={k("chm-horas")} style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                        {slotsGrouped.mañana.map((s) => (
                          <button
                            key={s}
                            type="button"
                            aria-pressed={slot === s}
                            onClick={() => setSlot(s)}
                            className={k("chm-hora")}
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
                      <div className={k("chm-horas")} style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                        {slotsGrouped.tarde.map((s) => (
                          <button
                            key={s}
                            type="button"
                            aria-pressed={slot === s}
                            onClick={() => setSlot(s)}
                            className={k("chm-hora")}
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
                <Field label="Nombre" value={name} onChange={setName} type="text" error={nameError} />
                <Field label="Teléfono" value={tel} onChange={setTel} type="tel" error={telError} />
                <Field label="Email (opcional)" value={mail} onChange={setMail} type="email" error={mailError} />
              </div>

              {/* Cupón de descuento (ADR-014) */}
              <div style={{ marginTop: 20 }}>
                <label htmlFor={idCupon} style={{ fontSize: 13, color: "var(--text-muted)", display: "block", marginBottom: 6 }}>
                  ¿Tenés un cupón?
                </label>
                <div className={k("chm-cupon")} style={{ display: "flex", gap: 8 }}>
                  <input
                    id={idCupon}
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
                  {/* Diseño nuevo: con quién y cuándo, a la vista (si llegó desde la agenda viva, no pasó por esos pasos). */}
                  {nuevo && pro && slot && (
                    <p style={{ margin: "0 0 6px", fontWeight: 600 }}>
                      Con {pro.name} · {fmtDateTime(slot)}
                    </p>
                  )}
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
                      {nuevo && !data.whatsapp ? (
                        <>Seña obligatoria para confirmar: ${svc.depositAmount.toLocaleString("es-AR")}. Te contactamos para coordinar el pago.</>
                      ) : (
                        <>
                      Seña obligatoria para confirmar: ${svc.depositAmount.toLocaleString("es-AR")}. Te
                      contactamos por WhatsApp para coordinar el pago.
                        </>
                      )}
                    </p>
                  )}
                </div>
              )}

              {!nuevo && error && <p role="alert" style={{ marginTop: 14, fontSize: 13, color: "var(--danger)" }}>{error}</p>}
            </>
          )}

          {step === 5 && (
            <>
              <StepTitle>{negocio.esCH ? "Listo. Te esperamos en La Alameda." : "Listo. Te esperamos."}</StepTitle>
              <div className={k("chm-tarjeta")} style={{ marginTop: 16, background: "var(--surface-sunken)", padding: 20, borderRadius: 2, fontSize: nuevo ? 16 : 14, display: "flex", flexDirection: "column", gap: 4 }}>
                {nuevo ? (
                  <p className="chm-codigo">
                    <span className="sr-only">Reserva número </span>Nº {code}
                  </p>
                ) : (
                <p style={{ margin: 0 }}><span style={{ color: "var(--text-muted)" }}>Reserva</span> · Nº {code}</p>
                )}
                <p style={{ margin: 0 }}><span style={{ color: "var(--text-muted)" }}>Servicio</span> · {svc?.name} · {svc?.categoria}, {svc?.durationMin} min</p>
                <p style={{ margin: 0 }}><span style={{ color: "var(--text-muted)" }}>Profesional</span> · {pro?.name}</p>
                <p style={{ margin: 0, textTransform: nuevo ? "none" : "capitalize" }}><span style={{ color: "var(--text-muted)", textTransform: "none" }}>Cuándo</span> · {whenLabel} h</p>
              </div>
              <p style={{ margin: "12px 0 0", fontSize: 13, color: "var(--text-muted)", lineHeight: 1.6 }}>
                {/* Diseño nuevo sin WhatsApp cargado: no se promete un canal que no existe (contacto-ch.ts). */}
                {nuevo && !data.whatsapp
                  ? "Te confirmamos el turno por mensaje o llamado. Podés reprogramar o cancelar hasta 24 hs antes."
                  : "Te confirmamos por WhatsApp o email. Podés reprogramar o cancelar hasta 24 hs antes."}
                {svc?.depositAmount != null && (
                  <> Recordá que para confirmar el turno hay una seña de ${svc.depositAmount.toLocaleString("es-AR")} — te escribimos para coordinarla.</>
                )}
              </p>
              <div className={k("chm-salidas")} style={{ marginTop: 16, display: "flex", flexWrap: "wrap", gap: 16, alignItems: "center" }}>
                {icsHref && (
                  <a href={icsHref} download={nuevo ? archivoIcs(negocio.nombre) : negocio.esCH ? "turno-ch-estetica.ics" : "turno.ics"} style={{ color: accent, textDecoration: "underline", textUnderlineOffset: 4, fontSize: 15 }}>
                    Agregar a mi calendario
                  </a>
                )}
                {/* Sin WhatsApp del negocio, el diseño nuevo no ofrece el botón: el aviso compartido mandaba a «otros
                    medios más abajo» que en CH no existen. Apagado, como siempre. */}
                {waMessage && (!nuevo || data.whatsapp) && (
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
        <div className={k("chm-pie")} style={{ padding: "16px 24px", borderTop: "1px solid var(--line)", display: "flex", flexWrap: avisoPie ? "wrap" : undefined, alignItems: "center", justifyContent: "space-between", background: "var(--surface-raised)" }}>
          {avisoPie && (
            <p role="alert" style={{ flexBasis: "100%", fontSize: 14, fontWeight: 600, color: "var(--danger)", margin: "0 0 12px" }}>
              {avisoPie}
            </p>
          )}
          <button
            type="button"
            onClick={back}
            disabled={step === 1 || step === 5 || submitting}
            className={k("chm-volver")}
            style={{ background: "none", border: 0, fontSize: 14, color: "var(--text-muted)", cursor: step === 1 || step === 5 || submitting ? "default" : "pointer", opacity: step === 1 || step === 5 || submitting ? 0.4 : 1, minHeight: 44, padding: "0 8px" }}
          >
            Volver
          </button>
          <button
            type="button"
            onClick={next}
            disabled={nuevo ? submitting : !canNext || submitting}
            className={k("chm-seguir")}
            style={{
              // Touch target ≥ 44px (Gate SAP §accesibilidad): antes ~38.5px de alto.
              minHeight: 44,
              padding: "10px 24px",
              border: 0,
              fontSize: 15,
              color: "var(--text-on-accent)",
              cursor: (nuevo ? submitting : !canNext || submitting) ? "not-allowed" : "pointer",
              background: (nuevo ? submitting : !canNext || submitting) ? "var(--line-strong)" : "var(--text-strong)",
            }}
          >
            {nextLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// «turno-ch-estetica.ics» con el diseño de siempre; con el nuevo, el nombre del negocio del sitio.
function archivoIcs(nombre: string): string {
  const base = nombre
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `turno${base ? "-" + base : ""}.ics`;
}

function StepTitle({ children }: { children: React.ReactNode }) {
  const nuevo = useDiseno();
  return (
    <p className={nuevo ? "chm-titulo" : undefined} style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: "1.25rem", fontWeight: 420, margin: "0 0 16px" }}>
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
  const negocio = useNegocioDelSitio();
  const nuevo = useDiseno();
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
        {negocio.esCH ? (
          <>¿Sos vecino/a de <strong>La Alameda</strong>? Tenés precio especial en algunos servicios.</>
        ) : (
          <>¿Sos vecino/a? Tenés precio especial en algunos servicios.</>
        )}
      </span>
      <div className={nuevo ? "chm-sino" : undefined} style={{ display: "flex", border: "1px solid var(--line-strong)", borderRadius: 2, flexShrink: 0 }}>
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

// Normaliza para buscar: sin acentos, sin eñe, minúsculas. Misma regla que el
// buscador del backoffice — quien tipea "depi" o "masaje relajante" no va a poner
// los acentos.
function normalizar(t: string): string {
  return t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
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
  // BUSCADOR DEL PASO 1. CH tiene 70 servicios en 9 categorías: sin filtro, elegir
  // uno era scrollear una lista interminable dentro de una ventanita. Se tipean dos
  // letras y quedan los que importan. Con la búsqueda activa se muestran todas las
  // coincidencias en una sola lista (sin encabezados de categoría): cuando bus qués
  // "masaje" no te importa en qué categoría cae cada uno.
  const [q, setQ] = useState("");
  const nuevo = useDiseno();
  const query = normalizar(q);
  // Se busca por el nombre del servicio Y por el de su categoría. Sin esto,
  // tipear "depilación" no encontraba NADA en CH: sus 16 servicios de depilación
  // se llaman "Combo: bozo + axilas…", "Cavado", "Media pierna" — la palabra
  // "depilación" está en la categoría, no en el nombre. Y la categoría es
  // justamente como la busca la gente: primero el rubro, después la zona.
  const gruposVisibles = query
    ? groups
        .map((g) => {
          const categoriaCoincide = normalizar(g.name).includes(query);
          return {
            ...g,
            services: categoriaCoincide
              ? g.services
              : g.services.filter((it) => normalizar(it.name).includes(query)),
          };
        })
        .filter((g) => g.services.length > 0)
    : groups;
  const totalVisible = gruposVisibles.reduce((n, g) => n + g.services.length, 0);

  return (
    <>
      <StepTitle>Elegí el servicio</StepTitle>
      <ResidentToggle value={isResident} onChange={onResidentChange} />
      <div style={{ position: "relative", marginBottom: 10 }}>
        <label htmlFor="ch-buscar-servicio" className="sr-only">
          Buscar un servicio por nombre
        </label>
        <input
          id="ch-buscar-servicio"
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar (ej.: masaje, depilación, facial)"
          autoComplete="off"
          className={nuevo ? "chm-buscar" : undefined}
          style={{
            width: "100%",
            boxSizing: "border-box",
            background: "var(--surface-sunken)",
            border: "1px solid var(--line-strong)",
            padding: "10px 12px",
            borderRadius: 0,
            fontSize: 15,
            minHeight: 44,
            fontFamily: "var(--font-body), system-ui, sans-serif",
            color: "var(--text-strong)",
          }}
        />
      </div>
      {query && (
        <p role="status" aria-live="polite" style={{ margin: "0 0 10px", fontSize: 13, color: "var(--text-muted)" }}>
          {totalVisible === 0
            ? "Ningún servicio coincide. Probá con otra palabra."
            : `${totalVisible} ${totalVisible === 1 ? "servicio" : "servicios"}`}
        </p>
      )}
      {gruposVisibles.map((g) => (
        <div key={g.id} style={{ marginBottom: 12 }}>
          <p className={nuevo ? "chm-grupo" : undefined} style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".08em", color: "var(--text-muted)", margin: "0 0 4px" }}>{g.name}</p>
          {g.services.map((it) => {
            const on = svc?.id === it.id;
            const hasResidentPrice = it.residentPrice != null;
            const shownPrice = precioCongeladoDeReserva(it, isResident).priceAtBooking;
            return (
              <button
                key={it.id}
                type="button"
                aria-pressed={on}
                onClick={() => onPick({ ...it, categoria: g.name })}
                className={nuevo ? "chm-fila" : undefined}
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
  error,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type: string;
  error?: string | null;
}) {
  const nuevo = useDiseno();
  const id = useId();
  return (
    <div className={nuevo ? "chm-campo" : undefined}>
      <label htmlFor={id} style={{ fontSize: 14, color: "var(--text-muted)" }}>{label}</label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode={type === "tel" ? "tel" : type === "email" ? "email" : undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        style={{
          marginTop: 4,
          width: "100%",
          boxSizing: "border-box",
          background: "var(--surface-sunken)",
          border: `1px solid ${error ? "var(--danger)" : "var(--line-strong)"}`,
          padding: "8px 12px",
          borderRadius: 0,
          fontSize: 15,
          fontFamily: "var(--font-body), system-ui, sans-serif",
          color: "var(--text-strong)",
        }}
      />
      {error && (
        <span id={`${id}-error`} role="alert" style={{ display: "block", marginTop: 4, fontSize: 12, color: "var(--danger)" }}>
          {error}
        </span>
      )}
    </div>
  );
}
