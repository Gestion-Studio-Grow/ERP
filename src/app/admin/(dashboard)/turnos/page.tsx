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
import { esFechaDeCalendario, vacioDiaSinTurnos, vacioSinProfesionales } from "./pasos";
import { disenoNuevo } from "@/lib/diseno/diseno.server";
import AgendaRenglon from "./AgendaRenglon";
import { extrasDeLaAgenda, proyectarAgenda } from "./agenda.server";
import LinkAlDia from "./_agenda/LinkAlDia";
import BotonBuscar from "../armazon/BotonBuscar";
import AtajosDelAlta from "./_agenda/AtajosDelAlta";
import { esteticaBackoffice } from "@/lib/estetica-backoffice";
import { getCurrentTenantSlug } from "@/lib/tenant-site";

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
  searchParams: Promise<{ date?: string; vista?: string }>;
}) {
  // El PROFESSIONAL ve el calendario de su propia agenda (getAgendaDay lo
  // scopea) pero sin las acciones de gestión (confirmar pago / cancelar), que
  // son de OWNER/RECEPTION. Sí puede cerrar sus turnos (completar / no-show).
  const user = await requireApp("agenda");
  const canManage = roleHasCapability(user.role, "agenda:manage");
  // El profesional cobra sus turnos aunque no pueda gestionarlos (decisión del dueño).
  const canCollect = roleHasCapability(user.role, "agenda:collect");

  const [{ date: dateParam, vista }, nuevo] = await Promise.all([searchParams, disenoNuevo()]);
  // DISEÑO NUEVO («Renglón»): el libro del día (AgendaRenglon.tsx). Mismos datos, mismas acciones,
  // mismas guardias. Apagado (CH hoy), la agenda de abajo tal cual.
  if (nuevo) {
    return (
      <AgendaRenglon
        quien={{ role: user.role, professionalId: user.professionalId }}
        fecha={dateParam}
        vista={vista === "profesionales" ? "profesionales" : "lista"}
      />
    );
  }
  const today = todayInBusinessTz();
  const date = dateParam ?? today;
  // "Mañana: confirmar" sólo en la vista de HOY y para quien gestiona la agenda: es la tarea
  // de la recepción al final del día, y mañana es mañana de verdad (no "el día siguiente al
  // que se está mirando"). Al profesional no se le muestra: confirmar no es su tarea.
  const verManana = canManage && date === today;
  const [cruda, manana, piloto, negocio, slug] = await Promise.all([
    getAgendaDay(date),
    verManana ? getMananaConfirmar() : Promise.resolve(null),
    enInicioPorApps(),
    getNegocioApps(user.role),
    getCurrentTenantSlug(),
  ]);
  const { professionals, blocksToday } = cruda;
  // La planilla de la PC (Tanda 2 · 2-C): el día proyectado campo por campo (agenda.server.ts), con
  // el veredicto de cobro de quien mira, y lo que puede hacer (las mismas capacidades del servidor).
  // Tanda 2: la marca «seña pedida» y el horario de trabajo (una lectura más por día, con tenantId).
  const diaDeLaPlanilla = esFechaDeCalendario(date) ? date : today;
  const extras = await extrasDeLaAgenda(cruda, diaDeLaPlanilla);
  const proyectada = proyectarAgenda(cruda, { role: user.role, professionalId: user.professionalId }, { seniasPedidas: extras.seniasPedidas });
  const planilla = {
    turnos: proyectada.turnos,
    profesionales: proyectada.profesionales,
    permisos: {
      gestionar: canManage,
      cobrar: canCollect,
      terminar: roleHasCapability(user.role, "agenda:complete"),
      perdonar: roleHasCapability(user.role, "agenda:forgive"),
    },
    ahora: new Date().toISOString(),
    dia: diaDeLaPlanilla,
    bloqueos: extras.bloqueos,
    hrefFicha: appPermitida(appPorId("clientes"), negocio) ? "/admin/clientes/" : null,
    letraDelNegocio: esteticaBackoffice(slug) !== null,
  };

  const label = fmtCalendarDateLabel(date);
  // Qué se ofrece si la agenda está vacía (pasos.ts): el botón sólo lleva a una pantalla que esta
  // persona puede abrir, con la misma regla que la guardia de cada página.
  const sinProfesionales = vacioSinProfesionales({
    esProfesional: user.role === "PROFESSIONAL",
    puedeCargarCatalogo: appPermitida(appPorId("catalogo"), negocio),
  });
  const diaVacio = vacioDiaSinTurnos({ fecha: date, hoy: today, puedeDarTurno: canManage });

  return (
    <main className="mx-auto max-w-5xl px-4 sm:px-6 py-6 sm:py-8">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold text-strong">Agenda</h1>
        <div className="flex flex-wrap items-center gap-2">
          {/* Las entradas fijas al alta nueva (cert CH T2, F-2/F-4): «Dar turno» y «Atender ahora»
              (CH-019), en la PC y en el celular. Sólo quien da turnos. */}
          {canManage && <AtajosDelAlta fecha={date} hoy={today} />}
          {/* En el celular no hay «/»: el buscador de clientas y turnos, a un toque (CH-028). */}
          <BotonBuscar />
        </div>
      </div>
      {/* Pestañas: en el celular llevan el alto táctil (44 px) sin cambiar cómo se ven en la PC. */}
      <div className="flex gap-4 text-sm mb-6 border-b border-line">
        <Link href="/admin/turnos" className="px-1 pb-2 border-b-2 border-accent text-strong font-medium max-sm:inline-flex max-sm:min-h-11 max-sm:items-end">
          Calendario
        </Link>
        {/* La semana por profesional, con la ocupación y los huecos (reingeniería CH, Tanda 3 · CH-036). */}
        <Link href="/admin/turnos/semana" className="px-1 pb-2 text-muted hover:text-strong max-sm:inline-flex max-sm:min-h-11 max-sm:items-end">
          Semana
        </Link>
        <Link href="/admin/turnos/lista" className="px-1 pb-2 text-muted hover:text-strong max-sm:inline-flex max-sm:min-h-11 max-sm:items-end">
          Lista
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-6">
        {/* Cambiar de día no pierde el «Ver por: Box» de la planilla (LinkAlDia lee `?por=`). */}
        <LinkAlDia dia={addDays(date, -1)} hoy={today} className={buttonClasses("outline", "sm")}>
          ← Anterior
        </LinkAlDia>
        <LinkAlDia dia={today} hoy={today} className={buttonClasses("outline", "sm")}>
          Hoy
        </LinkAlDia>
        <LinkAlDia dia={addDays(date, 1)} hoy={today} className={buttonClasses("outline", "sm")}>
          Siguiente →
        </LinkAlDia>
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
            className="rounded-md border border-line-strong bg-surface-raised px-2 py-1.5 text-sm text-strong focus:border-accent max-sm:h-11"
          />
          <button type="submit" className={`${buttonClasses("outline", "sm")} max-sm:h-11 max-sm:min-w-11`}>
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

      <CalendarGrid professionals={professionals} planilla={planilla} sinProfesionales={sinProfesionales} diaVacio={diaVacio} />
    </main>
  );
}
