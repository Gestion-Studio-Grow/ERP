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

import { useTransition, type ReactNode } from "react";
import { Aviso } from "@/components/ui";
import { camposDeDeshacer } from "@/lib/turnos/cobro-dividido";
import { deshacerCierre } from "@/lib/turnos/cobro-actions";
import { useToast } from "../../ToastProvider";
import { aFormData } from "./campos";

export type CierreParaDeshacer = { turnoId: string; clienta: string; que: "cancelacion" | "no-vino" };

const DURACION_DESHACER_MS = 10_000;

export default function AvisoDeshacerCierre({ turnoId, clienta, que, mensaje, duracion = DURACION_DESHACER_MS, onTermina, onDeshecho }: CierreParaDeshacer & {
  /** El texto del aviso (el de la hoja, con lo que pasó con la seña); sin él, el de siempre. */
  mensaje?: string;
  /** Cuánto queda vivo [Deshacer]; con la agenda interactiva, 8 s (AGENDA-INTERACCION.md §2.8). */
  duracion?: number;
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
        duracion={duracion}
        onDeshacer={pendiente ? undefined : deshacer}
        onTermina={onTermina}
      />
    </div>
  );
}

// ── Deshacer de la agenda interactiva: mover y duración (AGENDA-INTERACCION.md §2.8, T2) ──
//
// Mismo aviso y mismo lugar que el de cancelar / «no vino»; qué hace [Deshacer] lo trae quien lo
// monta (`deshacer`): mover vuelve con `rescheduleAppointment` al origen (el servidor re-valida el
// choque) y duración vuelve al `endsAt` anterior con `cambiarDuracionDelTurno`. Si el servidor dice
// que no, se lee el motivo («ese horario ya se ocupó») y el turno queda donde quedó.

export type CambioParaDeshacer = {
  /** Cambia con cada cambio nuevo: un solo aviso vivo por vez (el nuevo reemplaza al anterior). */
  clave: string;
  que: "mover" | "duracion" | "editar";
  /** «Movido a 17:00 con Caro», con el enlace a WhatsApp si corresponde. */
  mensaje: ReactNode;
  /** Lo que dice el aviso de éxito al deshacer. */
  listo: string;
  /** Deshace en el servidor: `null` si pudo, o el motivo si no. */
  deshacer: () => Promise<string | null>;
};

export function AvisoDeshacerCambio({ mensaje, listo, deshacer, duracion = 8_000, onTermina }: CambioParaDeshacer & { duracion?: number; onTermina: () => void }) {
  const { showError, showSuccess } = useToast();
  const [pendiente, empezar] = useTransition();
  const alDeshacer = () => {
    empezar(async () => {
      try {
        const error = await deshacer();
        if (error) showError(`No se pudo deshacer: ${error}`);
        else showSuccess(listo);
      } catch {
        showError("No se pudo deshacer. Fijate cómo quedó el turno en la agenda.");
      } finally {
        onTermina();
      }
    });
  };
  return (
    <div className="pointer-events-none fixed bottom-[calc(1rem_+_var(--alto-barra-inferior,0px))] left-4 right-4 z-50 flex justify-end sm:left-auto">
      {/* Más ancho en la PC: el texto entra en una línea junto a «Avisar por WhatsApp» y «Deshacer».
          Con `!`: `cn` no fusiona clases y otra hoja repite `.max-w-sm` más abajo (QA T2b). */}
      <Aviso mensaje={mensaje} duracion={duracion} onDeshacer={pendiente ? undefined : alDeshacer} onTermina={onTermina} className="sm:max-w-lg!" />
    </div>
  );
}
