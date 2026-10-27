"use client";

// ============================================================================
// DESHACER UNA CANCELACIÓN O UN «NO VINO» — el aviso de 10 s (§3.3, CH-026, CH Tanda 2).
// ============================================================================
//
// La hoja de cancelar / «no vino» se cierra al confirmar; el aviso con [Deshacer] tiene que quedar
// vivo después. Por eso es una pieza aparte que monta quien abrió la hoja (la mesa de turnos):
//
//   const [cierre, setCierre] = useState<CierreParaDeshacer | null>(null);
//   …onListo de CancelarONoVino → setCierre({ turnoId, clienta, que: accion === "cancelar" ? "cancelacion" : "no-vino" })
//   {cierre && <AvisoDeshacerCierre {...cierre} onTermina={() => setCierre(null)} />}
//
// [Deshacer] llama a `deshacerCierre`: el turno vuelve a Reservado si pasaron menos de 10 minutos y el
// hueco sigue libre; si no, se lee por qué («ese horario ya se ocupó»). La plata no se toca.

import { useTransition } from "react";
import { Aviso } from "@/components/ui";
import { camposDeDeshacer } from "@/lib/turnos/cobro-dividido";
import { deshacerCierre } from "@/lib/turnos/cobro-actions";
import { useToast } from "../../ToastProvider";
import { aFormData } from "./campos";

export type CierreParaDeshacer = { turnoId: string; clienta: string; que: "cancelacion" | "no-vino" };

const DURACION_DESHACER_MS = 10_000;

export default function AvisoDeshacerCierre({ turnoId, clienta, que, mensaje, onTermina, onDeshecho }: CierreParaDeshacer & {
  /** El texto del aviso (el de la hoja, con lo que pasó con la seña); sin él, el de siempre. */
  mensaje?: string;
  onTermina: () => void;
  /** Volvió a Reservado: quien lo monta recarga lo que muestra (la agenda ya se revalida sola). */
  onDeshecho?: () => void;
}) {
  const { showError, showSuccess } = useToast();
  const [pendiente, empezar] = useTransition();

  const deshacer = () => {
    empezar(async () => {
      try {
        const r = await deshacerCierre(aFormData(camposDeDeshacer({ turnoId, que })));
        if (!r.ok) showError(r.error);
        else {
          showSuccess(`Listo: el turno de ${clienta} volvió a Reservado.`);
          onDeshecho?.();
        }
      } catch {
        showError("No se pudo deshacer. Fijate cómo quedó el turno en la agenda.");
      } finally {
        onTermina();
      }
    });
  };

  return (
    <div className="pointer-events-none fixed bottom-[calc(1rem_+_var(--alto-barra-inferior,0px))] left-4 right-4 z-50 flex justify-end sm:left-auto">
      <Aviso
        mensaje={mensaje ?? (que === "cancelacion" ? `Cancelado: ${clienta}.` : `Marcado: ${clienta} no vino.`)}
        duracion={DURACION_DESHACER_MS}
        onDeshacer={pendiente ? undefined : deshacer}
        onTermina={onTermina}
      />
    </div>
  );
}
