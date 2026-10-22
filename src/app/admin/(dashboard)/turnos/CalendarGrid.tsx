"use client";

// ============================================================================
// LA AGENDA DE SIEMPRE (sin «Diseño nuevo») — el día en el celular y la planilla en la PC.
// ============================================================================
//
// CELULAR: la lista vertical del día con la tarjeta de siempre (AppointmentRow), sin cambios.
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
// del celular queda fuera de ese contenedor: se ve como siempre.

import { useEffect, useRef, useState, type CSSProperties } from "react";
import AppointmentRow from "./AppointmentRow";
import { fmtTime } from "@/lib/datetime";
import PasoVacio from "./PasoVacio";
import { HOJAS_DEL_DISENO, PIEL_RENGLON, PRECEDENCIA_DEL_DISENO } from "@/lib/diseno/diseno";
import type { PasoVacio as Paso } from "./pasos";
import type { Permisos, TurnoDelDia } from "./agenda-core";
import type { BloqueoDelDia } from "./grilla";
import MesaDeTurnos from "./_agenda/MesaDeTurnos";
import PorProfesional from "./_agenda/PorProfesional";

type Professional = { id: string; name: string; box: { name: string } | null };
type Appointment = {
  id: string;
  startsAt: Date;
  endsAt: Date;
  status: string;
  professionalId: string;
  serviceId: string;
  priceAtBooking: number | null;
  notes: string | null;
  client: { name: string; phone: string };
  professional: { name: string; cobraEnMostrador?: boolean };
  service: { name: string; price: number; depositAmount?: number | null };
  box: { name: string };
  payment: { method: string; comprobanteNro: string | null; amount?: number; status?: string } | null;
  // Cobros parciales del turno (seña/saldo) — src/lib/turnos. Ausente en demo.
  collections?: { amount: number; method: string }[];
};

// "Reservado" y no "Pendiente de pago": desde los cobros parciales la seña se cobra al
// reservar y el estado del turno ya no dice nada de la plata (eso lo dice cobrado/saldo).
const statusLabel: Record<string, string> = {
  PENDING: "Reservado",
  CONFIRMED: "Confirmado",
  CANCELLED: "Cancelado",
  COMPLETED: "Completado",
  NO_SHOW: "No se presentó",
};

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

/**
 * ¿Se ve la planilla (PC)? El cajón y las hojas son <dialog> modales: abiertos adentro de un bloque
 * escondido en el celular dejarían la página inerte sin mostrarse. En el celular la mesa no recibe
 * turnos, así un `?turno=` en la URL no abre nada ahí.
 */
function useEsEscritorio(): boolean {
  const [si, setSi] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const leer = () => setSi(mq.matches);
    leer();
    mq.addEventListener("change", leer);
    return () => mq.removeEventListener("change", leer);
  }, []);
  return si;
}

export default function CalendarGrid({
  professionals,
  appointments,
  planilla,
  canManage = true,
  canCollect = true,
  viewer,
  sinProfesionales,
  diaVacio,
  practica = false,
}: {
  professionals: Professional[];
  appointments: Appointment[];
  /** La planilla de la PC (huecos, cajón, mover, por box). */
  planilla: PlanillaDelDia;
  canManage?: boolean;
  canCollect?: boolean;
  /** Quién mira: decide si se dibuja el cobro. La regla la resuelve `puedeCobrarEsteTurno`. */
  viewer?: { role: string; professionalId?: string | null };
  /**
   * Qué decir (y a dónde llevar) si no hay profesionales o el día está vacío. Lo decide la página
   * con `pasos.ts`, porque depende de quién mira y de qué apps puede abrir. Sin esto queda la
   * línea de antes.
   */
  sinProfesionales?: Paso;
  diaVacio?: Paso;
  /** Agenda práctica (interruptor «agenda-practica»): se pasa tal cual a cada fila. */
  practica?: boolean;
}) {
  const piel = useRef<HTMLDivElement>(null);
  const tema = useTemaDeLaRaiz(piel);
  const escritorio = useEsEscritorio();

  if (professionals.length === 0) {
    return sinProfesionales ? (
      <PasoVacio paso={sinProfesionales} />
    ) : (
      <p className="text-sm text-muted">No hay profesionales activos.</p>
    );
  }

  // En pantallas angostas la grilla horizontal no entra (columna por
  // profesional). Mostramos una agenda vertical del día en su lugar y la
  // grilla completa recién desde lg — mismo dato, presentación distinta.
  const sortedAppointments = [...appointments].sort(
    (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()
  );
  const estilo = planilla.letraDelNegocio
    ? ({ "--font-ui": "var(--font-body), ui-sans-serif, system-ui, sans-serif" } as CSSProperties)
    : undefined;

  return (
    <div>
      <div className="lg:hidden space-y-3">
        {sortedAppointments.length === 0 &&
          (diaVacio ? <PasoVacio paso={diaVacio} /> : <p className="text-sm text-muted">No hay turnos ese día.</p>)}
        {sortedAppointments.map((appt) => (
          <div key={appt.id}>
            <p className="text-xs font-medium text-faint mb-1">
              {fmtTime(appt.startsAt)} · {appt.professional.name}
            </p>
            <AppointmentRow appointment={appt} statusLabel={statusLabel} canManage={canManage} canCollect={canCollect} viewer={viewer} practica={practica} />
          </div>
        ))}
      </div>

      {HOJAS_DEL_DISENO.map((href) => (
        <link key={href} rel="stylesheet" href={href} precedence={PRECEDENCIA_DEL_DISENO} />
      ))}
      <div ref={piel} data-diseno={PIEL_RENGLON} data-theme={tema} data-pantalla="agenda-planilla" style={estilo} className="hidden bg-surface text-body lg:block">
        <MesaDeTurnos
          turnos={escritorio ? planilla.turnos : []}
          permisos={planilla.permisos}
          ahora={planilla.ahora}
          hrefFicha={planilla.hrefFicha}
        >
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
        </MesaDeTurnos>
      </div>
    </div>
  );
}
