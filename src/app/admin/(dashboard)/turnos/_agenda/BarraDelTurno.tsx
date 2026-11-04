"use client";

// ============================================================================
// LA BARRA DE UN TOQUE SOBRE EL TURNO — No vino · Cobrar · WhatsApp (AGENDA-INTERACCION.md §2.4).
// ============================================================================
//
// Sólo con la agenda interactiva prendida (`permisos.interaccion`); qué tecla va y cómo actúa lo
// decide `barra-core.ts`. Ninguna action nueva de servidor:
//   · No vino sin plata cobrada → `markNoShow` (la MISMA que usa la hoja sin plata, CancelarONoVino)
//     y el aviso con [Deshacer] 8 s que monta la mesa. Con plata → la hoja de siempre.
//   · Cobrar → la hoja «terminar» (o «cobrar», si ya terminó) de la mesa: el medio es el 2.º toque.
//   · WhatsApp → `wa.me` con el saludo, directo (sin abrir el cajón).
// Cada tecla mide ≥ 44 px y lleva palabra, no sólo ícono.

import { useTransition } from "react";
import { markNoShow } from "@/lib/actions";
import { Button, ButtonLink } from "@/components/ui";
import { fmtTime } from "@/lib/datetime";
import { useToast } from "../../ToastProvider";
import type { TurnoDelDia } from "../agenda-core";
import { aFormData, camposDelTurno, leerResultado } from "./campos";
import { useMesa } from "./MesaDeTurnos";
import { hayBarra, teclasDeLaBarra } from "./barra-core";

const TECLA = "min-h-11";

export default function BarraDelTurno({ t }: { t: TurnoDelDia }) {
  const { permisos, reloj, hoja, cerrarSinPrestar, avisarCierre } = useMesa();
  const { showError } = useToast();
  const [pendiente, empezar] = useTransition();
  const barra = teclasDeLaBarra(t, permisos, reloj);
  if (!hayBarra(barra)) return null;
  const quien = `${t.clienta}, ${fmtTime(t.inicio)}`;

  const noVino = () => {
    if (barra.noVino === "hoja") {
      cerrarSinPrestar(t.id, "no-vino");
      return;
    }
    empezar(async () => {
      try {
        const r = leerResultado(await markNoShow(aFormData(camposDelTurno(t.id))));
        if (!r.ok) {
          showError(r.error);
          return;
        }
        const hecho = `Marcado: ${t.clienta} no vino.`;
        avisarCierre({ turnoId: t.id, clienta: t.clienta, que: "no-vino", mensaje: r.aviso ? `${hecho} ${r.aviso}` : hecho });
      } catch {
        showError("No se pudo. Probá de nuevo; si sigue, avisá.");
      }
    });
  };

  return (
    <span role="group" aria-label={`Acciones rápidas: ${quien}`} className="inline-flex flex-wrap items-center gap-2">
      {barra.noVino && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={TECLA}
          aria-label={`No vino: ${quien}`}
          aria-haspopup={barra.noVino === "hoja" ? "dialog" : undefined}
          disabled={pendiente}
          estado={pendiente ? "cargando" : undefined}
          onClick={noVino}
        >
          {pendiente ? "Guardando…" : "No vino"}
        </Button>
      )}
      {barra.cobrar && (
        <Button
          type="button"
          size="sm"
          className={TECLA}
          aria-label={`Cobrar: ${quien}`}
          aria-haspopup="dialog"
          onClick={() => barra.cobrar && hoja({ turnoId: t.id, que: barra.cobrar.que })}
        >
          Cobrar
        </Button>
      )}
      {barra.whatsapp && (
        <ButtonLink
          href={barra.whatsapp}
          target="_blank"
          rel="noopener noreferrer"
          variant="outline"
          size="sm"
          className={TECLA}
          aria-label={`WhatsApp a ${t.clienta} (se abre en otra pestaña)`}
        >
          WhatsApp
        </ButtonLink>
      )}
    </span>
  );
}
