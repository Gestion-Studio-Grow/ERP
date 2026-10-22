"use client";

// ============================================================================
// «DAR TURNO» COMO CAJÓN, encima del libro del día («Renglón»).
// ============================================================================
//
// F1, la tecla grande de la barra de abajo, «Darle un turno» de la ficha, los estados vacíos, un
// hueco tocado de la agenda y «Atender ahora» llevan a `/admin/turnos/lista?nuevo=1[&fecha]
// [&cliente][&profesional&hora | &ahora=1]` (pasos.ts: `hrefNuevoTurno`, `hrefTurnoEnHueco`,
// `hrefAtenderAhora`). Esa dirección dibuja la agenda de ESE día y, encima, este cajón (a la derecha
// en la PC, como hoja desde abajo en el celular). Atrás se ve cómo viene el día mientras se da el
// turno.
//
// La profesional, la hora y «ahora» se leen de la URL acá mismo (`leerHuecoDelAlta`), así la página
// que monta el cajón no tiene que saber de ellos.
//
// PIEL PROPIA (regla de independencia del interruptor, ch-DISENO.md §0.2): si el panel no tiene el
// diseño nuevo prendido (CH hoy), el cajón se viste solo — enlaza la hoja de la piel (React la sube
// al <head> una vez) y pone `data-diseno` en su propio contenedor, copiando el tema claro/oscuro de
// la raíz. Prendido, no agrega nada: ya lo hizo el layout.
//
// Al cerrarlo, o con «Ver en la agenda», se vuelve a la agenda del día del turno, donde ya aparece.
// «Atender ahora»: al dar el turno se va a la agenda de hoy con ESE turno abierto y su cobro
// (`?turno=<id>&hoja=terminar`).

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type RefObject } from "react";
import { Cajon } from "@/components/ui";
import type { FichaParaAlta } from "@/lib/clientes/ficha-por-telefono";
import { HOJAS_DEL_DISENO, PIEL_RENGLON, PRECEDENCIA_DEL_DISENO } from "@/lib/diseno/diseno";
import { useDiseno } from "@/lib/diseno/DisenoProvider";
import { hrefAgendaDelDia, hrefAlTerminarElAlta, leerHuecoDelAlta } from "../pasos";
import AltaDeTurno from "./AltaDeTurno";
import { MediosDePago } from "./medios";
import type { MetodoDePago } from "@/lib/turnos/cobros";
import type { ProfesionalDelAlta } from "./alta-core";


/** El tema (claro/oscuro) de la raíz del panel, seguido en vivo: la piel lo lee del mismo elemento. */
function useTemaDeLaRaiz(ref: RefObject<HTMLElement | null>): "light" | "dark" {
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

export default function DarTurnoCajon({
  profesionales,
  fichas,
  faltazos,
  hoy,
  fechaInicial,
  clienteInicial,
  viewer,
  combos = false,
  medios,
}: {
  profesionales: ProfesionalDelAlta[];
  fichas: FichaParaAlta[];
  faltazos?: Record<string, number>;
  hoy: string;
  fechaInicial: string;
  clienteInicial?: string;
  viewer: { role: string; professionalId?: string | null };
  /** ¿La base guarda varias zonas en un turno? (`combosHabilitados()`, Tanda 3 · 3-B). */
  combos?: boolean;
  /** Los medios de esta base (Débito/Crédito sólo con M1); sin esto, los tres de siempre. */
  medios?: readonly MetodoDePago[];
}) {
  const router = useRouter();
  const params = useSearchParams();
  const pielDelPanel = useDiseno();
  const raiz = useRef<HTMLDivElement>(null);
  const tema = useTemaDeLaRaiz(raiz);
  const [abierto, setAbierto] = useState(true);
  const hueco = leerHuecoDelAlta({ nuevo: params.get("nuevo"), profesional: params.get("profesional"), hora: params.get("hora"), ahora: params.get("ahora") });
  const dia = hueco.ahora ? hoy : fechaInicial || hoy;
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

  const cajon = (
    <Cajon
      abierto={abierto}
      onCerrar={() => irA(hrefAgendaDelDia(dia, hoy))}
      titulo={hueco.ahora ? "Atender ahora" : "Dar turno"}
      descripcion={nombre ? `Para ${nombre}` : hueco.ahora ? "Hoy, ya: servicio y quién la atiende" : "Qué, cuándo, quién y la seña"}
    >
      <MediosDePago medios={medios}>
      <AltaDeTurno
        combos={combos}
        profesionales={profesionales}
        fichas={fichas}
        faltazos={faltazos}
        hoy={hoy}
        fechaInicial={dia}
        clienteInicial={clienteInicial}
        profesionalInicial={hueco.profesional || undefined}
        horaInicial={hueco.hora || undefined}
        ahoraInicial={hueco.ahora}
        viewer={viewer}
        onListo={(fin) => {
          irA(hrefAlTerminarElAlta(fin, hoy));
          router.refresh();
        }}
      />
      </MediosDePago>
    </Cajon>
  );

  if (pielDelPanel) return cajon;
  return (
    <div ref={raiz} data-diseno={PIEL_RENGLON} data-theme={tema} data-pantalla="dar-turno" className="contents">
      {HOJAS_DEL_DISENO.map((href) => (
        <link key={href} rel="stylesheet" href={href} precedence={PRECEDENCIA_DEL_DISENO} />
      ))}
      {cajon}
    </div>
  );
}
