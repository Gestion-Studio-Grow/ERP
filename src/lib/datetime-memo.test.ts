// Los formateadores de fecha REUSADOS (datetime.ts) dan exactamente lo mismo que uno recién
// armado en cada llamada, que es como estaba antes. Se compara cada función pública contra la
// versión vieja (copiada acá tal cual) sobre miles de instantes: bordes de día en la zona del
// negocio y en UTC, medianoche, fin de mes y de año, bisiestos, y una tanda al azar con semilla.

import { test } from "node:test";
import assert from "node:assert/strict";
import { BUSINESS_TIMEZONE } from "@/lib/business-config";
import {
  businessWallTimeToUtc,
  dateStrInBusinessTz,
  fmtCalendarDateLabel,
  fmtDateTime,
  fmtDateTimeAr,
  fmtShortDate,
  fmtTime,
  wallHourMinuteInBusinessTz,
} from "@/lib/datetime";

// ── La versión de antes, sin reusar nada ─────────────────────────────────────
function viejoOffset(timeZone: string, instant: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(instant);
  const map: Record<string, number> = {};
  for (const p of parts) if (p.type !== "literal") map[p.type] = Number(p.value);
  const hour = map.hour === 24 ? 0 : map.hour;
  return Date.UTC(map.year, map.month - 1, map.day, hour, map.minute, map.second) - instant.getTime();
}
const viejo = {
  businessWallTimeToUtc(dateStr: string, timeStr: string): Date {
    const naiveUtc = new Date(`${dateStr}T${timeStr}:00.000Z`);
    return new Date(naiveUtc.getTime() - viejoOffset(BUSINESS_TIMEZONE, naiveUtc));
  },
  dateStrInBusinessTz: (i: Date) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: BUSINESS_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(i),
  fmtDateTime: (i: Date | string) =>
    new Intl.DateTimeFormat("es-AR", { timeZone: BUSINESS_TIMEZONE, dateStyle: "full", timeStyle: "short", hour12: false }).format(new Date(i)),
  fmtDateTimeAr(instant: Date | string): string {
    const d = new Date(instant);
    if (Number.isNaN(d.getTime())) return String(instant);
    const parts = new Intl.DateTimeFormat("es-AR", {
      timeZone: "America/Argentina/Buenos_Aires", hour12: false, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
    }).formatToParts(d);
    const map: Record<string, string> = {};
    for (const p of parts) if (p.type !== "literal") map[p.type] = p.value;
    const hour = map.hour === "24" ? "00" : map.hour;
    return `${map.day}/${map.month}/${map.year} ${hour}:${map.minute}`;
  },
  fmtTime: (i: Date | string) =>
    new Intl.DateTimeFormat("es-AR", { timeZone: BUSINESS_TIMEZONE, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(i)),
  fmtShortDate: (i: Date | string) =>
    new Intl.DateTimeFormat("es-AR", { timeZone: BUSINESS_TIMEZONE, day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(i)),
  fmtCalendarDateLabel: (d: string) =>
    new Intl.DateTimeFormat("es-AR", { timeZone: "UTC", weekday: "long", day: "2-digit", month: "long" }).format(new Date(`${d}T12:00:00.000Z`)),
  wallHourMinuteInBusinessTz(instant: Date) {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: BUSINESS_TIMEZONE, hour12: false, hour: "2-digit", minute: "2-digit" }).formatToParts(instant);
    const map: Record<string, number> = {};
    for (const p of parts) if (p.type !== "literal") map[p.type] = Number(p.value);
    return { hour: map.hour === 24 ? 0 : map.hour, minute: map.minute };
  },
};

// ── Los instantes ────────────────────────────────────────────────────────────
function instantes(): Date[] {
  const out: Date[] = [];
  // Bordes: cada hora alrededor de medianoche (negocio y UTC), fin de mes/año, bisiestos.
  for (const dia of ["2024-02-28", "2024-02-29", "2024-03-01", "2025-12-31", "2026-01-01", "2026-09-24", "2026-10-31", "2027-03-01"]) {
    for (let h = 0; h < 24; h++) for (const m of [0, 1, 59]) out.push(new Date(`${dia}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00.000Z`));
  }
  // Al azar, con semilla fija (reproducible): 2000–2040.
  let x = 20260924;
  const azar = () => ((x = (x * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  const desde = Date.UTC(2000, 0, 1), hasta = Date.UTC(2040, 0, 1);
  for (let i = 0; i < 3000; i++) out.push(new Date(desde + Math.floor(azar() * (hasta - desde))));
  return out;
}

test("cada formateo reusado da lo mismo que uno recién armado (miles de instantes)", () => {
  const todos = instantes();
  for (const i of todos) {
    assert.equal(dateStrInBusinessTz(i), viejo.dateStrInBusinessTz(i), i.toISOString());
    assert.equal(fmtDateTime(i), viejo.fmtDateTime(i), i.toISOString());
    assert.equal(fmtDateTimeAr(i), viejo.fmtDateTimeAr(i), i.toISOString());
    assert.equal(fmtTime(i), viejo.fmtTime(i), i.toISOString());
    assert.equal(fmtShortDate(i), viejo.fmtShortDate(i), i.toISOString());
    assert.deepEqual(wallHourMinuteInBusinessTz(i), viejo.wallHourMinuteInBusinessTz(i), i.toISOString());
    const dia = i.toISOString().slice(0, 10);
    const hora = i.toISOString().slice(11, 16);
    assert.equal(businessWallTimeToUtc(dia, hora).getTime(), viejo.businessWallTimeToUtc(dia, hora).getTime(), `${dia} ${hora}`);
    assert.equal(fmtCalendarDateLabel(dia), viejo.fmtCalendarDateLabel(dia), dia);
  }
  // Strings y basura, como las recibe la pantalla.
  for (const raro of ["2026-09-24T03:00:00.000Z", "no es fecha"]) {
    assert.equal(fmtDateTimeAr(raro), viejo.fmtDateTimeAr(raro));
  }
});

test("reusar sale más barato que armar uno por llamada (medido acá, no afirmado)", () => {
  const todos = instantes().slice(0, 2000);
  const t0 = performance.now();
  for (const i of todos) viejo.dateStrInBusinessTz(i);
  const antes = performance.now() - t0;
  const t1 = performance.now();
  for (const i of todos) dateStrInBusinessTz(i);
  const ahora = performance.now() - t1;
  // No se fija un número (depende de la máquina): sólo que reusar no sea más lento.
  assert.ok(ahora <= antes, `reusado ${ahora.toFixed(1)} ms vs armado ${antes.toFixed(1)} ms`);
});
