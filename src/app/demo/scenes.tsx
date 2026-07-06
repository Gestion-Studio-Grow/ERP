"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Escenas de la DEMO — cada una es una "pantalla" de la app que vive dentro del
// marco del teléfono. Son componentes presentacionales puros con datos de
// EJEMPLO (ver demo-content.ts). Cero imports de DB/prod. Las animaciones de
// entrada se disparan al montar (DemoTour remonta la escena activa con `key`),
// usando las clases `d-*` definidas en el <style> de DemoTour.tsx.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import {
  AGENDA_DAY,
  AGENDA_INCOMING,
  ars,
  CAJA_METHOD,
  CAJA_SESSION_BEFORE,
  CAJA_TICKET,
  DUENO_INSIGHTS,
  DUENO_TREND,
  FACTURA,
  RESERVA_PICK,
  RESERVA_SERVICE,
  RESERVA_SLOTS,
  DEMO_BRAND,
  type Appt,
} from "./demo-content";

// Delay helper: los reveals se escalonan con animation-delay inline.
const d = (ms: number) => ({ animationDelay: `${ms}ms` } as const);

// Cuenta ascendente para los totales (respeta prefers-reduced-motion).
function useCountUp(target: number, durationMs = 900): number {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      // Sin animación: mostramos el total directo. Se difiere un frame para no
      // llamar a setState de forma síncrona dentro del efecto (cascading renders).
      const id = requestAnimationFrame(() => setVal(target));
      return () => cancelAnimationFrame(id);
    }
    let raf = 0;
    let start = 0;
    const step = (t: number) => {
      if (!start) start = t;
      const p = Math.min(1, (t - start) / durationMs);
      // easeOutCubic
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(Math.round(target * eased));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    // Red de seguridad: si rAF quedara throttled (pestaña en segundo plano),
    // garantizamos el valor final igual. Con rAF normal es un no-op.
    const safety = setTimeout(() => setVal(target), durationMs + 150);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(safety);
    };
  }, [target, durationMs]);
  return val;
}

// Chrome común de "pantalla de app": barra superior con negocio + pestaña.
function Screen({ tab, children }: { tab: string; children: React.ReactNode }) {
  return (
    <div className="flex h-full flex-col bg-surface">
      <div className="flex items-center justify-between border-b border-line bg-surface-raised px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="grid size-6 place-items-center rounded-md bg-accent text-[11px] font-bold text-on-accent">
            {DEMO_BRAND.sampleBusiness.slice(0, 1)}
          </span>
          <span className="text-[13px] font-semibold text-strong">{DEMO_BRAND.sampleBusiness}</span>
        </div>
        <span className="text-[11px] font-medium uppercase tracking-wider text-accent">{tab}</span>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden p-4">{children}</div>
    </div>
  );
}

const TONE_BAR: Record<Appt["tone"], string> = {
  accent: "bg-accent",
  success: "bg-success",
  warning: "bg-warning",
};

function ApptRow({ a, incoming, delay }: { a: Appt; incoming?: boolean; delay: number }) {
  return (
    <div
      className={`d-up flex items-stretch gap-2.5 rounded-lg border bg-surface-raised p-2.5 ${
        incoming ? "border-success shadow-raised d-pop" : "border-line"
      }`}
      style={d(delay)}
    >
      <span className={`w-1 shrink-0 rounded-full ${TONE_BAR[a.tone]}`} aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[13px] font-semibold text-strong">{a.time}</span>
          {incoming ? (
            <span className="rounded-full bg-success-soft px-2 py-0.5 text-[10px] font-semibold text-success">
              Reservado online ✓
            </span>
          ) : (
            <span className="text-[11px] text-faint">{a.pro}</span>
          )}
        </div>
        <p className="truncate text-[12px] text-body">{a.service}</p>
        <p className="truncate text-[11px] text-muted">{a.client}</p>
      </div>
    </div>
  );
}

export function AgendaScene() {
  // El turno entrante se inserta cronológicamente (16:15) tras un beat.
  const rows = [...AGENDA_DAY];
  return (
    <Screen tab="Agenda · Hoy">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[12px] font-medium text-muted">Martes 14 · 6 turnos</p>
        <span className="text-[11px] text-faint">Caro · Sofi</span>
      </div>
      <div className="space-y-2">
        <ApptRow a={rows[0]} delay={80} />
        <ApptRow a={rows[1]} delay={180} />
        <ApptRow a={rows[2]} delay={280} />
        <ApptRow a={rows[3]} delay={380} />
        {/* Entra reservado online, en su horario, sin pisar a nadie. */}
        <ApptRow a={AGENDA_INCOMING} incoming delay={2400} />
        <ApptRow a={rows[4]} delay={480} />
      </div>
    </Screen>
  );
}

export function ReservaScene() {
  return (
    <Screen tab="Vidriera · Reservá">
      <p className="d-up text-[11px] font-semibold uppercase tracking-wider text-accent" style={d(60)}>
        {DEMO_BRAND.sampleBusiness}
      </p>
      <h3 className="d-up font-display text-lg leading-tight text-strong" style={d(140)}>
        {RESERVA_SERVICE.name}
      </h3>
      <div className="d-up mb-3 mt-1 flex items-center gap-3 text-[12px] text-muted" style={d(220)}>
        <span>{RESERVA_SERVICE.mins} min</span>
        <span className="size-1 rounded-full bg-line-strong" />
        <span className="font-semibold text-accent">{RESERVA_SERVICE.price}</span>
      </div>
      <p className="d-up mb-2 text-[12px] font-medium text-body" style={d(320)}>
        Elegí tu horario · hoy
      </p>
      <div className="grid grid-cols-3 gap-2">
        {RESERVA_SLOTS.map((s, i) => {
          const picked = s === RESERVA_PICK;
          return (
            <div
              key={s}
              className={`d-up rounded-lg border py-2 text-center text-[13px] font-medium ${
                picked
                  ? "d-pick border-accent bg-accent text-on-accent shadow-raised"
                  : "border-line bg-surface-raised text-body"
              }`}
              style={d(420 + i * 90)}
            >
              {s}
            </div>
          );
        })}
      </div>
      <div className="d-up mt-4 rounded-lg bg-success-soft p-3" style={d(2600)}>
        <p className="text-[12px] font-semibold text-success">Turno confirmado ✓</p>
        <p className="text-[11px] text-body">
          {RESERVA_PICK} hs · te llega recordatorio por WhatsApp
        </p>
      </div>
    </Screen>
  );
}

export function CajaScene() {
  const total = CAJA_TICKET.reduce((s, l) => s + l.qty * l.price, 0);
  const shown = useCountUp(total, 1000);
  const session = useCountUp(CAJA_SESSION_BEFORE + total, 1100);
  return (
    <Screen tab="Caja · Cobro">
      <div className="space-y-1.5">
        {CAJA_TICKET.map((l, i) => (
          <div
            key={l.name}
            className="d-up flex items-center justify-between text-[13px]"
            style={d(120 + i * 160)}
          >
            <span className="text-body">
              <span className="text-muted">{l.qty}×</span> {l.name}
            </span>
            <span className="font-medium text-strong">{ars(l.qty * l.price)}</span>
          </div>
        ))}
      </div>
      <div className="d-up mt-3 border-t border-line pt-3" style={d(700)}>
        <div className="flex items-end justify-between">
          <span className="text-[12px] font-medium text-muted">Total</span>
          <span className="font-display text-2xl font-semibold text-strong tabular-nums">
            {ars(shown)}
          </span>
        </div>
      </div>
      <div className="d-up mt-3 flex items-center gap-2" style={d(1500)}>
        {["Efectivo", "Tarjeta", CAJA_METHOD].map((m) => (
          <span
            key={m}
            className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
              m === CAJA_METHOD
                ? "bg-accent text-on-accent"
                : "border border-line bg-surface-raised text-muted"
            }`}
          >
            {m}
          </span>
        ))}
      </div>
      <div className="d-up d-pop mt-3 rounded-lg bg-success-soft p-3" style={d(2100)}>
        <p className="text-[12px] font-semibold text-success">Cobrado ✓ — sumado a la caja del día</p>
        <p className="mt-0.5 text-[11px] text-body tabular-nums">
          Caja de hoy: <span className="font-semibold text-strong">{ars(session)}</span>
        </p>
      </div>
    </Screen>
  );
}

export function FacturaScene() {
  const total = useCountUp(FACTURA.total, 900);
  return (
    <Screen tab="Facturación · ARCA">
      <div className="d-up rounded-lg border border-line bg-surface-raised p-3" style={d(80)}>
        <div className="flex items-center justify-between">
          <span className="rounded bg-accent-soft px-2 py-0.5 text-[11px] font-semibold text-accent">
            {FACTURA.tipo}
          </span>
          <span className="text-[11px] text-faint">
            {FACTURA.pv}-{FACTURA.nro}
          </span>
        </div>
        <p className="mt-2 text-[12px] text-muted">{FACTURA.cliente}</p>
        <div className="mt-2 space-y-1 text-[12px]">
          <div className="flex justify-between text-muted">
            <span>Neto</span>
            <span className="tabular-nums">{ars(FACTURA.neto)}</span>
          </div>
          <div className="flex justify-between text-muted">
            <span>IVA 21%</span>
            <span className="tabular-nums">{ars(FACTURA.iva)}</span>
          </div>
          <div className="flex justify-between border-t border-line pt-1 text-strong">
            <span className="font-semibold">Total</span>
            <span className="font-display text-lg font-semibold tabular-nums">{ars(total)}</span>
          </div>
        </div>
      </div>
      {/* El sello del CAE "cae" (aparece) con un pop, como recién autorizado. */}
      <div className="d-up d-pop mt-3 rounded-lg border border-success bg-success-soft p-3" style={d(1800)}>
        <div className="flex items-center gap-2">
          <span className="grid size-5 place-items-center rounded-full bg-success text-[11px] text-white">
            ✓
          </span>
          <span className="text-[12px] font-semibold text-success">Autorizada por ARCA</span>
        </div>
        <p className="mt-1.5 text-[11px] text-body">
          CAE <span className="font-semibold tabular-nums text-strong">{FACTURA.cae}</span>
        </p>
        <p className="text-[11px] text-muted">Vto. {FACTURA.vto}</p>
      </div>
      <p className="d-up mt-3 text-center text-[11px] text-muted" style={d(2400)}>
        Sin entrar al sistema de AFIP. Todo desde acá.
      </p>
    </Screen>
  );
}

const SEV: Record<string, string> = {
  good: "bg-success-soft text-success",
  info: "bg-info-soft text-info",
  warn: "bg-warning-soft text-warning",
};

export function DuenoScene() {
  return (
    <Screen tab="Panel del Dueño">
      <h3 className="d-up font-display text-lg leading-tight text-strong" style={d(60)}>
        Tu negocio te habla
      </h3>
      <p className="d-up mb-3 text-[11px] text-muted" style={d(140)}>
        Lectura automática de tus números, en lenguaje llano.
      </p>

      {/* Tendencia con sparkline que "crece". */}
      <div className="d-up mb-3 rounded-lg border border-line bg-surface-raised p-3" style={d(260)}>
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[11px] text-muted">{DUENO_TREND.metric}</p>
            <p className="font-display text-xl font-semibold text-strong">{DUENO_TREND.value}</p>
          </div>
          <span className="rounded-full bg-success-soft px-2 py-0.5 text-[11px] font-semibold text-success">
            ↑ {DUENO_TREND.delta}
          </span>
        </div>
        <div className="mt-2 flex h-9 items-end gap-1">
          {DUENO_TREND.spark.map((h, i) => (
            <span
              key={i}
              className="d-bar flex-1 rounded-sm bg-accent/70"
              style={{ height: `${h}%`, animationDelay: `${400 + i * 70}ms` }}
            />
          ))}
        </div>
      </div>

      <div className="space-y-2">
        {DUENO_INSIGHTS.map((ins, i) => (
          <div
            key={i}
            className="d-up flex items-start gap-2 rounded-lg border border-line bg-surface-raised p-2.5"
            style={d(900 + i * 500)}
          >
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${SEV[ins.severity]}`}>
              {ins.label}
            </span>
            <p className="text-[12px] leading-snug text-strong">
              {ins.text}
              {ins.delta && <span className="ml-1 text-[11px] text-muted">({ins.delta})</span>}
            </p>
          </div>
        ))}
      </div>
    </Screen>
  );
}

// Escena de cierre: no es una pantalla de app, es la tarjeta de conversión.
export function CierreScene() {
  const pills = ["Agenda", "Reservá online", "Caja", "Facturación", "Panel del Dueño"];
  return (
    <div className="flex h-full flex-col items-center justify-center bg-surface px-6 text-center">
      <span
        aria-hidden
        className="d-up d-pop grid size-14 place-items-center rounded-2xl bg-accent text-2xl text-on-accent shadow-raised"
        style={d(60)}
      >
        ✦
      </span>
      <h3 className="d-up mt-4 font-display text-2xl font-semibold leading-tight text-strong" style={d(200)}>
        Todo tu negocio,
        <br />
        en un solo lugar
      </h3>
      <p className="d-up mt-2 text-[13px] leading-relaxed text-muted" style={d(320)}>
        Dejá las planillas, los cuadernos y el sistema de AFIP aparte.
      </p>
      <div className="mt-4 flex flex-wrap justify-center gap-1.5">
        {pills.map((p, i) => (
          <span
            key={p}
            className="d-up rounded-full border border-line bg-surface-raised px-2.5 py-1 text-[11px] font-medium text-body"
            style={d(440 + i * 110)}
          >
            {p}
          </span>
        ))}
      </div>
      <p className="d-up mt-5 text-[12px] font-medium text-accent" style={d(1100)}>
        Tocá abajo para empezar ↓
      </p>
    </div>
  );
}
