import { getAgendaDay, getMananaConfirmar } from "@/lib/actions";
import Link from "next/link";
import CalendarGrid from "./CalendarGrid";
import MananaConfirmar from "./MananaConfirmar";
import { todayInBusinessTz, fmtCalendarDateLabel } from "@/lib/datetime";
import { requireApp } from "@/lib/require-app";
import { roleHasCapability } from "@/lib/capabilities";
import { buttonClasses } from "@/components/ui";
import { appPermitida } from "@/apps/visibles";
import { appPorId } from "@/apps/registro";
import { getNegocioApps } from "@/apps/contexto.server";
import { cargarHuecosLiberados } from "@/lib/crm/cargas.server";
import { anotadosConHueco } from "@/lib/crm/huecos";
import { enInicioPorApps } from "../inicio/piloto";

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

// Un turno cancelado que le sirve a alguien de la lista de espera (Inicio por apps). Cancelar
// antes no miraba la lista: el hueco se perdía salvo que alguien se acordara. Acá se ofrece,
// con el mismo cruce que la lista de espera (huecos liberados, src/lib/crm/huecos.ts).
async function HuecosParaLaEspera({ role }: { role: Parameters<typeof getNegocioApps>[0] }) {
  const negocio = await getNegocioApps(role);
  if (!appPermitida(appPorId("lista-de-espera"), negocio)) return null;
  const huecos = await cargarHuecosLiberados();
  if (huecos.length === 0) return null;
  const personas = anotadosConHueco(huecos);
  return (
    <div className="mb-6 flex flex-col gap-2 rounded-md border border-accent/30 bg-accent-soft px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between">
      <p className="text-strong">
        {huecos.length === 1 ? "Se liberó un turno" : `Se liberaron ${huecos.length} turnos`} que le{" "}
        {personas === 1 ? "sirve a 1 persona" : `sirven a ${personas} personas`} de la lista de espera.
      </p>
      <Link href="/admin/espera" className={buttonClasses("solid", "md", "whitespace-nowrap")}>
        Ofrecer el hueco
      </Link>
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
  const user = await requireApp("agenda");
  const canManage = roleHasCapability(user.role, "agenda:manage");
  // El profesional cobra sus turnos aunque no pueda gestionarlos (decisión del dueño).
  const canCollect = roleHasCapability(user.role, "agenda:collect");

  const { date: dateParam } = await searchParams;
  const today = todayInBusinessTz();
  const date = dateParam ?? today;
  // "Mañana: confirmar" sólo en la vista de HOY y para quien gestiona la agenda: es la tarea
  // de la recepción al final del día, y mañana es mañana de verdad (no "el día siguiente al
  // que se está mirando"). Al profesional no se le muestra: confirmar no es su tarea.
  const verManana = canManage && date === today;
  const [{ professionals, appointments, blocksToday }, manana, piloto] = await Promise.all([
    getAgendaDay(date),
    verManana ? getMananaConfirmar() : Promise.resolve(null),
    enInicioPorApps(),
  ]);

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

      {piloto && canManage && <HuecosParaLaEspera role={user.role} />}

      {manana && <MananaConfirmar dia={manana.dia} turnos={manana.turnos} />}

      <CalendarGrid professionals={professionals} appointments={appointments} canManage={canManage} canCollect={canCollect} viewer={{ role: user.role, professionalId: user.professionalId }} />
    </main>
  );
}
