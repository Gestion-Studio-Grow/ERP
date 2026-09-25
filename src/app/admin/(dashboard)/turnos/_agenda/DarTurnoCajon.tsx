"use client";

// ============================================================================
// «DAR UN TURNO» COMO CAJÓN, encima del libro del día (diseño nuevo, «Renglón»).
// ============================================================================
//
// F1, la tecla grande de la barra de abajo, «Darle un turno» de la ficha y los estados vacíos llevan
// a `/admin/turnos/lista?nuevo=1[&fecha][&cliente]` (pasos.ts, `hrefNuevoTurno`). Con el interruptor
// «Diseño nuevo» prendido, esa dirección ya no abre el formulario viejo dentro de la lista: dibuja la
// agenda de ESE día y, encima, este cajón (a la derecha en la PC, como hoja desde abajo en el
// celular). Atrás se ve cómo viene el día mientras se da el turno.
//
// Al cerrarlo (o al dar el turno) se vuelve a la agenda de ese día, donde el turno nuevo ya aparece.
// Apagado el interruptor (CH hoy), nada de esto se monta.

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Cajon } from "@/components/ui";
import type { FichaParaAlta } from "@/lib/clientes/ficha-por-telefono";
import AltaDeTurno from "./AltaDeTurno";
import type { ProfesionalDelAlta } from "./alta-core";

function hrefAgenda(dia: string, hoy: string): string {
  return dia === hoy ? "/admin/turnos" : `/admin/turnos?date=${dia}`;
}

export default function DarTurnoCajon({
  profesionales,
  fichas,
  faltazos,
  hoy,
  fechaInicial,
  clienteInicial,
  viewer,
}: {
  profesionales: ProfesionalDelAlta[];
  fichas: FichaParaAlta[];
  faltazos?: Record<string, number>;
  hoy: string;
  fechaInicial: string;
  clienteInicial?: string;
  viewer: { role: string; professionalId?: string | null };
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(true);
  const dia = fechaInicial || hoy;
  const nombre = clienteInicial ? fichas.find((f) => f.id === clienteInicial)?.nombre : undefined;

  // Al dar el turno se cierra el cajón y el <dialog> avisa «me cerré» (onCerrar): sin esta traba,
  // ese aviso mandaba de vuelta al día con que se abrió y no al del turno recién dado.
  const yendo = useRef(false);
  function irA(href: string) {
    if (yendo.current) return;
    yendo.current = true;
    setAbierto(false);
    router.replace(href, { scroll: false });
  }

  return (
    <Cajon
      abierto={abierto}
      onCerrar={() => irA(hrefAgenda(dia, hoy))}
      titulo="Dar un turno"
      descripcion={nombre ? `Para ${nombre}` : "Servicio, día y hora; después, la clienta"}
    >
      <AltaDeTurno
        profesionales={profesionales}
        fichas={fichas}
        faltazos={faltazos}
        hoy={hoy}
        fechaInicial={dia}
        clienteInicial={clienteInicial}
        viewer={viewer}
        onListo={(diaDelTurno) => {
          irA(hrefAgenda(diaDelTurno, hoy));
          router.refresh();
        }}
      />
    </Cajon>
  );
}
