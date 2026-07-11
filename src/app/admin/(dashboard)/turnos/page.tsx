import { getAgendaDay } from "@/lib/actions";
import Link from "next/link";
import CalendarGrid from "./CalendarGrid";
import { todayInBusinessTz, fmtCalendarDateLabel } from "@/lib/datetime";
import { requireCapability } from "@/lib/authz";
import { roleHasCapability } from "@/lib/capabilities";
import { buttonClasses } from "@/components/ui";

// Muestra en un vistazo qué profesionales tienen novedad (franco/vacaciones)
// ese día, para no tener que ir a buscarlo a Catálogo (ADR-011 G9).
function NovedadesDelDia({
  blocks,
}: {
  blocks: { professional: { name: string }; reason: string }[];
}) {
  if (blocks.length === 0) return null;
  return (
    <div className="mb-6 rounded-md bg-warning-soft border border-warning/30 px-3 py-2 text-sm text-warning">
      <span className="font-medium">Ausencias de hoy: </span>
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
  // El PROFESSIONAL ve el calendario de su propia agenda (getAgendaDay lo
  // scopea) pero sin las acciones de gestión (confirmar pago / cancelar), que
  // son de OWNER/RECEPTION. Sí puede cerrar sus turnos (completar / no-show).
  const user = await requireCapability("agenda:read");
  const canManage = roleHasCapability(user.role, "agenda:manage");

  const { date: dateParam } = await searchParams;
  const today = todayInBusinessTz();
  const date = dateParam ?? today;
  const { professionals, appointments, blocksToday } = await getAgendaDay(date);

  const label = fmtCalendarDateLabel(date);

  return (
    <main className="mx-auto max-w-5xl px-4 sm:px-6 py-6 sm:py-8">
      <h1 className="text-2xl font-semibold text-strong mb-1">Agenda</h1>
      <div className="flex gap-4 text-sm mb-6 border-b border-line">
        <Link href="/admin/turnos" className="px-1 pb-2 border-b-2 border-accent text-strong font-medium">
          Calendario
        </Link>
        <Link href="/admin/turnos/lista" className="px-1 pb-2 text-muted hover:text-strong">
          Lista
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-6">
        <Link
          href={`/admin/turnos?date=${addDays(date, -1)}`}
          className={buttonClasses("outline", "sm")}
        >
          ← Anterior
        </Link>
        <Link
          href={`/admin/turnos?date=${today}`}
          className={buttonClasses("outline", "sm")}
        >
          Hoy
        </Link>
        <Link
          href={`/admin/turnos?date=${addDays(date, 1)}`}
          className={buttonClasses("outline", "sm")}
        >
          Siguiente →
        </Link>
        {/* Salto directo a cualquier fecha, sin ir de a un día. Form GET
            nativo: funciona server-side sin componente client. Los controles se
            mantienen compactos (inline) con tokens en vez de los primitivos
            w-full/h-11, que son para formularios apilados. */}
        <form action="/admin/turnos" className="flex items-center gap-2">
          <input
            type="date"
            name="date"
            defaultValue={date}
            aria-label="Ir a una fecha"
            className="rounded-md border border-line-strong bg-surface-raised px-2 py-1.5 text-sm text-strong focus:border-accent"
          />
          <button type="submit" className={buttonClasses("outline", "sm")}>
            Ir
          </button>
        </form>
        <span className="font-medium capitalize w-full sm:w-auto order-first sm:order-none">
          {label}
        </span>
      </div>

      <NovedadesDelDia blocks={blocksToday} />

      <CalendarGrid professionals={professionals} appointments={appointments} canManage={canManage} />
    </main>
  );
}
