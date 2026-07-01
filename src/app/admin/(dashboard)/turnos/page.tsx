import { getAgendaDay } from "@/lib/actions";
import Link from "next/link";
import CalendarGrid from "./CalendarGrid";

function toDateStr(d: Date) {
  return d.toISOString().slice(0, 10);
}

function addDays(dateStr: string, days: number) {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + days);
  return toDateStr(d);
}

export default async function TurnosCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const { date: dateParam } = await searchParams;
  const date = dateParam ?? toDateStr(new Date());
  const { professionals, appointments } = await getAgendaDay(date);

  const label = new Date(`${date}T00:00:00`).toLocaleDateString("es-AR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  });

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <h1 className="text-2xl font-semibold mb-1">Agenda</h1>
      <div className="flex gap-4 text-sm mb-6 border-b">
        <Link href="/admin/turnos" className="px-1 pb-2 border-b-2 border-black font-medium">
          Calendario
        </Link>
        <Link href="/admin/turnos/lista" className="px-1 pb-2 text-neutral-500 hover:text-black">
          Lista
        </Link>
      </div>

      <div className="flex items-center gap-3 mb-6">
        <Link
          href={`/admin/turnos?date=${addDays(date, -1)}`}
          className="rounded-md border px-3 py-1.5 text-sm hover:bg-neutral-50"
        >
          ← Anterior
        </Link>
        <Link
          href={`/admin/turnos?date=${toDateStr(new Date())}`}
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
        <span className="font-medium capitalize">{label}</span>
      </div>

      <CalendarGrid professionals={professionals} appointments={appointments} />
    </main>
  );
}
