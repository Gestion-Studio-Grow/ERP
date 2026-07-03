import { getAgendaDay } from "@/lib/actions";
import Link from "next/link";
import CalendarGrid from "./CalendarGrid";
import { todayInBusinessTz, fmtCalendarDateLabel } from "@/lib/datetime";

// Muestra en un vistazo qué profesionales tienen novedad (franco/vacaciones)
// ese día, para no tener que ir a buscarlo a Catálogo (ADR-011 G9).
function NovedadesDelDia({
  blocks,
}: {
  blocks: { professional: { name: string }; reason: string }[];
}) {
  if (blocks.length === 0) return null;
  return (
    <div className="mb-6 rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-900">
      <span className="font-medium">Hoy no está: </span>
      {blocks.map((b, i) => (
        <span key={i}>
          {b.professional.name} ({b.reason})
          {i < blocks.length - 1 ? " · " : ""}
        </span>
      ))}
    </div>
  );
}

// Suma días a una fecha de calendario "YYYY-MM-DD" de forma estable ante zonas
// (se ancla a mediodía UTC, así nunca cruza la medianoche por el offset).
function addDays(dateStr: string, days: number) {
  const d = new Date(`${dateStr}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export default async function TurnosCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const { date: dateParam } = await searchParams;
  const today = todayInBusinessTz();
  const date = dateParam ?? today;
  const { professionals, appointments, blocksToday } = await getAgendaDay(date);

  const label = fmtCalendarDateLabel(date);

  return (
    <main className="mx-auto max-w-5xl px-4 sm:px-6 py-6 sm:py-8">
      <h1 className="text-2xl font-semibold mb-1">Agenda</h1>
      <div className="flex gap-4 text-sm mb-6 border-b">
        <Link href="/admin/turnos" className="px-1 pb-2 border-b-2 border-black font-medium">
          Calendario
        </Link>
        <Link href="/admin/turnos/lista" className="px-1 pb-2 text-neutral-500 hover:text-black">
          Lista
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-6">
        <Link
          href={`/admin/turnos?date=${addDays(date, -1)}`}
          className="rounded-md border px-3 py-1.5 text-sm hover:bg-neutral-50"
        >
          ← Anterior
        </Link>
        <Link
          href={`/admin/turnos?date=${today}`}
          className="rounded-md border px-3 py-1.5 text-sm hover:bg-neutral-50"
        >
          Hoy
        </Link>
        <Link
          href={`/admin/turnos?date=${addDays(date, 1)}`}
          className="rounded-md border px-3 py-1.5 text-sm hover:bg-neutral-50"
        >
          Siguiente →
        </Link>
        <span className="font-medium capitalize w-full sm:w-auto order-first sm:order-none">
          {label}
        </span>
      </div>

      <NovedadesDelDia blocks={blocksToday} />

      <CalendarGrid professionals={professionals} appointments={appointments} />
    </main>
  );
}
