"use client";

// ============================================================================
// LA AGENDA DE SIEMPRE (sin «Diseño nuevo») — el día en el celular y la planilla en la PC.
// ============================================================================
//
// CELULAR: el libro del día en renglones (`RenglonDelTurno`), el MISMO de la agenda nueva, adentro de
// la misma mesa que la planilla de la PC: tocar un turno abre el MISMO cajón (como hoja desde abajo),
// con «Llegó la seña», cobrar, dividir, mover y avisar, cancelar con [Deshacer]. Antes el celular
// veía la tarjeta vieja (AppointmentRow, con su «Reprogramar» propio) y la PC la mesa nueva: dos
// agendas para lo mismo (cert CH Tanda 2, O-6). La tarjeta vieja sigue viva en «Todos los turnos».
// PC (desde lg): la planilla nueva (Tanda 2 · 2-C), la MISMA que la agenda nueva
// (`_agenda/PorProfesional.tsx`) adentro de la mesa (`MesaDeTurnos`):
//   · tocar un turno abre el cajón a la derecha, sin mover la grilla (antes: «Turno seleccionado»
//     abajo, lejos de donde se tocó);
//   · tocar un hueco abre «Dar turno» con la profesional, el día y la hora puestos;
//   · arrastrar un turno lo mueve (re-valida el choque en el servidor) y ofrece avisar por WhatsApp;
//   · ver por profesional o por box, chips que filtran sin ir al servidor, raya de «ahora», y la
//     leyenda con forma + palabra.
//
// REGLA DE INDEPENDENCIA DEL INTERRUPTOR (§0.2 del diseño de CH): la planilla se viste con la piel
// «Renglón» por su cuenta —`data-diseno` propio en su contenedor y la hoja enlazada acá— sin prender
// el diseño nuevo del negocio. Si estuviera prendido, la hoja ya está y React no la repite. La lista
// del celular va adentro del mismo contenedor: se viste igual que el cajón.

import { Fragment, useEffect, useRef, useState, type CSSProperties } from "react";
import { dateStrInBusinessTz, fmtTime } from "@/lib/datetime";
import PasoVacio from "./PasoVacio";
import { HOJAS_DEL_DISENO, PIEL_RENGLON, PRECEDENCIA_DEL_DISENO } from "@/lib/diseno/diseno";
import type { PasoVacio as Paso } from "./pasos";
import type { Permisos, TurnoDelDia } from "./agenda-core";
import type { BloqueoDelDia } from "./grilla";
import MesaDeTurnos, { RenglonDelTurno } from "./_agenda/MesaDeTurnos";
import { lugarDeLaRaya } from "./agenda-core";
import PorProfesional from "./_agenda/PorProfesional";

type Professional = { id: string; name: string; box: { name: string } | null };
/** Lo que la planilla de la PC necesita: la agenda del día ya proyectada en el servidor. */
export type PlanillaDelDia = {
  turnos: TurnoDelDia[];
  profesionales: { id: string; nombre: string; box: string | null }[];
  permisos: Permisos;
  /** ISO del «ahora» de la carga. */
  ahora: string;
  /** "YYYY-MM-DD" del día que se mira. */
  dia: string;
  bloqueos: BloqueoDelDia[];
  /** Base de la ficha de la clienta («/admin/clientes/»), si quien mira puede abrir Clientes. */
  hrefFicha: string | null;
  /** La letra de cuerpo del negocio en vez de la de la piel (CH: Hanken). */
  letraDelNegocio: boolean;
};

// La piel «Renglón» se viste bajo `data-diseno` y lee el modo oscuro del MISMO elemento: se copia el
// `data-theme` de la raíz del panel (lo pone AdminThemeScript, lo cambia el selector de tema).
function useTemaDeLaRaiz(ref: React.RefObject<HTMLElement | null>): "light" | "dark" {
  const [tema, setTema] = useState<"light" | "dark">("light");
  useEffect(() => {
    const raiz = ref.current?.parentElement?.closest("[data-theme]");
    if (!raiz) return;
    const leer = () => setTema(raiz.getAttribute("data-theme") === "dark" ? "dark" : "light");
    leer();
    const obs = new MutationObserver(leer);
    obs.observe(raiz, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, [ref]);
  return tema;
}

/** El día en el celular: un renglón por turno, en orden, con la raya de «ahora» si es hoy. */
function ListaDelCelular({ planilla, vacio }: { planilla: PlanillaDelDia; vacio: React.ReactNode }) {
  const reloj = new Date(planilla.ahora);
  const turnos = [...planilla.turnos].sort((a, b) => new Date(a.inicio).getTime() - new Date(b.inicio).getTime());
  if (turnos.length === 0) return <>{vacio}</>;
  const raya = lugarDeLaRaya(turnos, dateStrInBusinessTz(reloj) === planilla.dia, reloj);
  return (
    <ol aria-label="Turnos del día" className="border-t border-line-strong">
      {turnos.map((t, i) => (
        <Fragment key={t.id}>
          {raya === i && (
            <li
              role="separator"
              aria-label={`Ahora, ${fmtTime(reloj)}`}
              className="flex items-center gap-2 py-1 text-xs font-semibold tabular-nums text-accent-ink before:h-0 before:w-3 before:border-t-2 before:border-accent after:h-0 after:flex-1 after:border-t-2 after:border-accent"
            >
              Ahora {fmtTime(reloj)}
            </li>
          )}
          <RenglonDelTurno t={t} />
        </Fragment>
      ))}
    </ol>
  );
}

export default function CalendarGrid({
  professionals,
  planilla,
  sinProfesionales,
  diaVacio,
}: {
  professionals: Professional[];
  /** La planilla de la PC (huecos, cajón, mover, por box) y la lista del celular. */
  planilla: PlanillaDelDia;
  /**
   * Qué decir (y a dónde llevar) si no hay profesionales o el día está vacío. Lo decide la página
   * con `pasos.ts`, porque depende de quién mira y de qué apps puede abrir. Sin esto queda la
   * línea de antes.
   */
  sinProfesionales?: Paso;
  diaVacio?: Paso;
}) {
  const piel = useRef<HTMLDivElement>(null);
  const tema = useTemaDeLaRaiz(piel);

  if (professionals.length === 0) {
    return sinProfesionales ? (
      <PasoVacio paso={sinProfesionales} />
    ) : (
      <p className="text-sm text-muted">No hay profesionales activos.</p>
    );
  }

  const estilo = planilla.letraDelNegocio
    ? ({ "--font-ui": "var(--font-body), ui-sans-serif, system-ui, sans-serif" } as CSSProperties)
    : undefined;

  return (
    <div>
      {HOJAS_DEL_DISENO.map((href) => (
        <link key={href} rel="stylesheet" href={href} precedence={PRECEDENCIA_DEL_DISENO} />
      ))}
      {/* La mesa (cajón del turno, hojas de cobro y de cancelar) queda VISIBLE en todos los anchos:
          sus <dialog> modales no pueden vivir adentro de un bloque escondido (dejarían la página
          inerte sin mostrarse). Lo que se esconde en el celular es sólo la planilla. Así un
          `?turno=<id>` (el buscador, «Mañana», «Atender ahora» con `&hoja=terminar`) abre el turno
          también en el celular, como hoja desde abajo. */}
      <div ref={piel} data-diseno={PIEL_RENGLON} data-theme={tema} data-pantalla="agenda-planilla" style={estilo} className="text-body lg:bg-surface">
        <MesaDeTurnos turnos={planilla.turnos} permisos={planilla.permisos} ahora={planilla.ahora} hrefFicha={planilla.hrefFicha}>
          <div className="lg:hidden">
            <ListaDelCelular
              planilla={planilla}
              vacio={diaVacio ? <PasoVacio paso={diaVacio} /> : <p className="text-sm text-muted">No hay turnos ese día.</p>}
            />
          </div>
          <div className="hidden lg:block">
            <PorProfesional
              turnos={planilla.turnos}
              profesionales={planilla.profesionales}
              ahora={planilla.ahora}
              dia={planilla.dia}
              bloqueos={planilla.bloqueos}
            />
            {planilla.turnos.length === 0 && diaVacio && (
              <div className="mt-4">
                <PasoVacio paso={diaVacio} />
              </div>
            )}
          </div>
        </MesaDeTurnos>
      </div>
    </div>
  );
}
