// Helpers de fecha/hora conscientes de la zona del negocio (AMD-004, ADR-010 G6).
//
// Regla: todo se persiste en UTC. Cuando el negocio dice "atiende de 09:00 a
// 19:00", esas son horas de PARED en la zona del negocio (BUSINESS_TIMEZONE),
// no en la zona del servidor. Estas funciones hacen la conversión correcta con
// Intl, sin librerías y sin hardcodear el offset (así un futuro tenant en otra
// zona, o un cambio de normativa horaria, se resuelve cambiando la config).

import { BUSINESS_TIMEZONE } from "@/lib/business-config";

// Offset (ms) de una zona en un instante dado. Positivo al este de UTC.
// Ej: para America/Argentina/Buenos_Aires devuelve -10800000 (-3h).
function tzOffsetMs(timeZone: string, instant: Date): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = dtf.formatToParts(instant);
  const map: Record<string, number> = {};
  for (const p of parts) if (p.type !== "literal") map[p.type] = Number(p.value);
  // hour "24" en algunos entornos representa medianoche
  const hour = map.hour === 24 ? 0 : map.hour;
  const asUtc = Date.UTC(map.year, map.month - 1, map.day, hour, map.minute, map.second);
  return asUtc - instant.getTime();
}

// Convierte una hora de pared ("2026-07-08", "09:00") en la zona del negocio
// al instante UTC correcto.
export function businessWallTimeToUtc(dateStr: string, timeStr: string): Date {
  const naiveUtc = new Date(`${dateStr}T${timeStr}:00.000Z`);
  const offset = tzOffsetMs(BUSINESS_TIMEZONE, naiveUtc);
  return new Date(naiveUtc.getTime() - offset);
}

// Día de la semana (0=domingo..6=sábado) de una fecha de calendario, estable
// ante la zona (se ancla al mediodía UTC para no cruzar la medianoche).
export function dayOfWeekForDate(dateStr: string): number {
  return new Date(`${dateStr}T12:00:00.000Z`).getUTCDay();
}

// Fecha de "hoy" (YYYY-MM-DD) en la zona del negocio — no en la del servidor.
export function todayInBusinessTz(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

// YYYY-MM-DD de un instante, expresado en la zona del negocio.
export function dateStrInBusinessTz(instant: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

// --- Formateo para mostrar (siempre en la zona del negocio) ---
// Evita depender de la zona del navegador de quien mira la pantalla.

export function fmtDateTime(instant: Date | string): string {
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: BUSINESS_TIMEZONE,
    dateStyle: "full",
    timeStyle: "short",
  }).format(new Date(instant));
}

// dd/mm/aaaa hh:mm en horario argentino — EL formatter de fecha+hora corta del
// producto (gate UX/UI, fix 1). TZ explícita SIEMPRE: en Netlify/Vercel el
// server corre en UTC y `new Date().getDate()` da la fecha corrida de día.
// Reemplaza a las copias locales que había en bancos/helpers.ts y CarteraPanel.
export function fmtDateTimeAr(instant: Date | string): string {
  const d = new Date(instant);
  if (Number.isNaN(d.getTime())) return String(instant);
  const parts = new Intl.DateTimeFormat("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    hour12: false,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(d);
  const map: Record<string, string> = {};
  for (const p of parts) if (p.type !== "literal") map[p.type] = p.value;
  const hour = map.hour === "24" ? "00" : map.hour; // "24" = medianoche en algunos ICU
  return `${map.day}/${map.month}/${map.year} ${hour}:${map.minute}`;
}

export function fmtTime(instant: Date | string): string {
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: BUSINESS_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(instant));
}

export function fmtShortDate(instant: Date | string): string {
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: BUSINESS_TIMEZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(instant));
}

// Etiqueta larga de una fecha de calendario ("YYYY-MM-DD"), sin hora.
export function fmtCalendarDateLabel(dateStr: string): string {
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: "UTC",
    weekday: "long",
    day: "2-digit",
    month: "long",
  }).format(new Date(`${dateStr}T12:00:00.000Z`));
}

// Próximos N días de calendario a partir de hoy (zona del negocio), para el
// selector de día del modal de reserva. value = "YYYY-MM-DD", label = "jue 3".
export function nextBusinessDays(count: number): { value: string; label: string }[] {
  const base = new Date(`${todayInBusinessTz()}T12:00:00.000Z`);
  const out: { value: string; label: string }[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(base.getTime() + i * 86400000);
    const value = d.toISOString().slice(0, 10);
    const label = new Intl.DateTimeFormat("es-AR", {
      timeZone: "UTC",
      weekday: "short",
      day: "numeric",
    })
      .format(d)
      .replace(".", "");
    out.push({ value, label });
  }
  return out;
}

// Hora y minuto de pared (en la zona del negocio) de un instante UTC.
export function wallHourMinuteInBusinessTz(instant: Date): { hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: BUSINESS_TIMEZONE,
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(instant);
  const map: Record<string, number> = {};
  for (const p of parts) if (p.type !== "literal") map[p.type] = Number(p.value);
  return { hour: map.hour === 24 ? 0 : map.hour, minute: map.minute };
}
