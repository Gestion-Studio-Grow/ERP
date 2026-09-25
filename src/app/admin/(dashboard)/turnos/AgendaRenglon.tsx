// ============================================================================
// LA AGENDA — diseño nuevo («Renglón»). Servidor.
// ============================================================================
//
// Se ve SÓLO con el interruptor «Diseño nuevo» del negocio (page.tsx pregunta `disenoNuevo()`);
// apagado, la agenda de siempre, intacta. CH está en producción: prenderle esto es decisión del
// dueño.
//
// El momento: la recepcionista, parada, con el teléfono en una mano y una clienta enfrente. Abre la
// agenda para saber quién sigue y qué le falta a cada turno. Por eso, de arriba abajo:
//   1. «Agenda» y UNA línea de estado («9 turnos · 3 sin confirmar · 1 por cobrar · Carla con 5»);
//      a la derecha, el día: ← Ayer · Jueves 24 de septiembre · Mañana → · Otro día.
//   2. Las vistas: Día (el libro) · Por profesional (la planilla de boxes) · Todos los turnos.
//   3. Si alguien falta hoy o se liberó un hueco para la lista de espera, una franja (no una tarjeta).
//   4. El libro del día: un renglón por turno, UNA tecla, la raya de «ahora».
//   5. Mañana al pie, plegado, con una sola tecla para avisar a todas de a una.
//
// Los datos son los de siempre (`getAgendaDay`, `getMananaConfirmar`, los huecos del piloto): la
// agenda nueva cambia CÓMO se ve y se opera, no QUÉ se consulta ni quién puede qué.

import Link from "next/link";
import { getAgendaDay, getMananaConfirmar } from "@/lib/actions";
import { roleHasCapability, type Role } from "@/lib/capabilities";
import { todayInBusinessTz } from "@/lib/datetime";
import { appPermitida } from "@/apps/visibles";
import { appPorId } from "@/apps/registro";
import { getNegocioApps } from "@/apps/contexto.server";
import { cargarHuecosLiberados } from "@/lib/crm/cargas.server";
import { anotadosConHueco } from "@/lib/crm/huecos";
import { EmptyState, Franja, PageContainer, PageHeader, Pestanas, atributosBoton, buttonClasses } from "@/components/ui";
import { enInicioPorApps } from "../inicio/piloto";
import { diaMas, fechaCorta, fechaLarga, lineaDeLaAgenda, nombreRelativo, type Permisos } from "./agenda-core";
import { proyectarAgenda } from "./agenda.server";
import { esFechaDeCalendario, hrefNuevoTurno, vacioDiaSinTurnos, vacioSinProfesionales } from "./pasos";
import LibroDelDia from "./_agenda/LibroDelDia";
import { RenglonDeManana } from "./_agenda/ParaManana";
import OtroDia from "./_agenda/OtroDia";

type Quien = { role: Role; professionalId?: string | null };

function hrefDia(dia: string, hoy: string, vista: "lista" | "profesionales"): string {
  const p = new URLSearchParams();
  if (dia !== hoy) p.set("date", dia);
  if (vista === "profesionales") p.set("vista", "profesionales");
  const q = p.toString();
  return q ? `/admin/turnos?${q}` : "/admin/turnos";
}

/** ← Ayer · Jueves 24 de septiembre · Mañana → · Otro día */
function ElDia({ dia, hoy, vista }: { dia: string; hoy: string; vista: "lista" | "profesionales" }) {
  const antes = diaMas(dia, -1);
  const despues = diaMas(dia, 1);
  const nombre = (d: string) => nombreRelativo(d, hoy) ?? fechaCorta(d);
  return (
    // Celular: dos renglones parejos (← Ayer · fecha / Mañana → · Otro día), sin que «Otro día»
    // quede colgado solo en un tercer renglón. PC: todo en una línea.
    <nav aria-label="Elegir el día" className="grid w-full grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2 lg:flex lg:w-auto lg:flex-wrap lg:gap-2">
      <Link href={hrefDia(antes, hoy, vista)} className={buttonClasses("outline", "sm")} {...atributosBoton("outline", "sm")} aria-label={`Día anterior: ${fechaLarga(antes)}`}>
        ← {nombre(antes)}
      </Link>
      <span className="truncate px-1 text-sm font-semibold text-strong" aria-current="date">
        {fechaLarga(dia)}
      </span>
      <Link href={hrefDia(despues, hoy, vista)} className={buttonClasses("outline", "sm")} {...atributosBoton("outline", "sm")} aria-label={`Día siguiente: ${fechaLarga(despues)}`}>
        {nombre(despues)} →
      </Link>
      <span className="flex flex-wrap items-center gap-1 lg:contents">
        {dia !== hoy && (
          <Link href={hrefDia(hoy, hoy, vista)} className={buttonClasses("ghost", "sm")} {...atributosBoton("ghost", "sm")}>
            Hoy
          </Link>
        )}
        <OtroDia dia={dia} base={vista === "profesionales" ? "vista=profesionales" : ""} />
      </span>
    </nav>
  );
}

async function FranjaDeHuecos() {
  const huecos = await cargarHuecosLiberados();
  if (huecos.length === 0) return null;
  const personas = anotadosConHueco(huecos);
  return (
    <Franja className="mb-4">
      {huecos.length === 1 ? "Se liberó un turno" : `Se liberaron ${huecos.length} turnos`} que le{" "}
      {personas === 1 ? "sirve a 1 persona" : `sirven a ${personas} personas`} de la lista de espera.{" "}
      <Link href="/admin/espera">Ofrecer el hueco</Link>
    </Franja>
  );
}

export default async function AgendaRenglon({
  quien,
  fecha,
  vista,
  alta,
}: {
  quien: Quien;
  fecha: string | undefined;
  vista: "lista" | "profesionales";
  /** «Dar un turno» abierto encima del libro (lista/page.tsx con ?nuevo=1): el cajón ya armado. */
  alta?: React.ReactNode;
}) {
  const hoy = todayInBusinessTz();
  const dia = fecha && esFechaDeCalendario(fecha) ? fecha : hoy;
  const permisos: Permisos = {
    gestionar: roleHasCapability(quien.role, "agenda:manage"),
    cobrar: roleHasCapability(quien.role, "agenda:collect"),
    terminar: roleHasCapability(quien.role, "agenda:complete"),
  };
  // Mañana, sólo mirando HOY y para quien gestiona la agenda (como siempre).
  const verManana = permisos.gestionar && dia === hoy;
  const [cruda, manana, piloto, negocio] = await Promise.all([
    getAgendaDay(dia),
    verManana ? getMananaConfirmar() : Promise.resolve(null),
    enInicioPorApps(),
    getNegocioApps(quien.role),
  ]);
  const agenda = proyectarAgenda(cruda, quien);
  const ahora = new Date();
  const linea = lineaDeLaAgenda(agenda.turnos, ahora);
  const abreClientes = appPermitida(appPorId("clientes"), negocio);

  const sinProfesionales = vacioSinProfesionales({
    esProfesional: quien.role === "PROFESSIONAL",
    puedeCargarCatalogo: appPermitida(appPorId("catalogo"), negocio),
  });
  const diaVacio = vacioDiaSinTurnos({ fecha: dia, hoy, puedeDarTurno: permisos.gestionar });
  const paso = agenda.profesionales.length === 0 ? sinProfesionales : diaVacio;
  const vacio = (
    <EmptyState
      title={paso.titulo}
      description={paso.descripcion}
      action={
        paso.accion ? (
          <Link href={paso.accion.href} className={buttonClasses("solid", "md")} {...atributosBoton("solid", "md")}>
            {paso.accion.etiqueta}
          </Link>
        ) : undefined
      }
    />
  );

  const pestanas = [
    { href: hrefDia(dia, hoy, "lista"), etiqueta: "Día", actual: vista === "lista" },
    ...(agenda.profesionales.length > 1 || quien.role !== "PROFESSIONAL"
      ? [{ href: hrefDia(dia, hoy, "profesionales"), etiqueta: "Por profesional", actual: vista === "profesionales" }]
      : []),
    ...(permisos.gestionar ? [{ href: "/admin/turnos/lista", etiqueta: "Todos los turnos" }] : []),
  ];

  return (
    <PageContainer>
      <PageHeader
        title="Agenda"
        estado={[
          <strong key="t">{linea.turnos === 1 ? "1 turno" : `${linea.turnos} turnos`}</strong>,
          linea.sinConfirmar > 0 ? `${linea.sinConfirmar} sin confirmar` : null,
          linea.porCobrar > 0 ? `${linea.porCobrar} por cobrar` : null,
          linea.sinCerrar > 0 && dia === hoy ? `${linea.sinCerrar} sin cerrar` : null,
          linea.masCargada ? `${linea.masCargada.nombre.split(" ")[0]} con ${linea.masCargada.turnos}` : null,
        ]}
        actions={<ElDia dia={dia} hoy={hoy} vista={vista} />}
      />

      {pestanas.length > 1 && <Pestanas pestanas={pestanas} etiqueta="Vistas de la agenda" conRaya className="mb-4" />}

      {agenda.ausencias.length > 0 && (
        <Franja tono="atencion" className="mb-4">
          {dia === hoy ? "Hoy no atienden: " : "Ese día no atienden: "}
          {agenda.ausencias.map((a) => `${a.profesional} (${a.motivo})`).join(" · ")}
        </Franja>
      )}

      {piloto && permisos.gestionar && dia === hoy && <FranjaDeHuecos />}

      <LibroDelDia
        turnos={agenda.turnos}
        permisos={permisos}
        ahora={ahora.toISOString()}
        esHoy={dia === hoy}
        hrefFicha={abreClientes ? "/admin/clientes/" : null}
        vacio={vacio}
        vista={vista}
        profesionales={agenda.profesionales}
      />

      {manana && <RenglonDeManana dia={manana.dia} turnos={manana.turnos} />}

      {permisos.gestionar && dia >= hoy && agenda.turnos.length > 0 && (
        <p className="mt-6 text-sm text-muted">
          ¿Llamó alguien para {dia === hoy ? "hoy" : "ese día"}?{" "}
          <Link href={hrefNuevoTurno(dia)} className="inline-flex min-h-11 items-center font-medium text-accent underline-offset-2 hover:underline">
            Darle un turno
          </Link>
        </p>
      )}
      {alta}
    </PageContainer>
  );
}
