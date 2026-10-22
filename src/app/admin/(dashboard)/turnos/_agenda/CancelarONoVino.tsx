"use client";

// ============================================================================
// CANCELAR O «NO VINO» — con la consecuencia escrita antes de confirmar («Renglón»).
// ============================================================================
//
// Ni cancelar ni «no vino» salen de un toque suelto (CH-009, CH-012): la hoja pregunta lo que
// hace falta y escribe qué va a pasar ANTES del botón que lo hace.
//   · Si la clienta ya pagó algo: quién cancela (la clienta o el negocio) y qué pasa con esa plata.
//     La hoja PROPONE el destino con la regla del negocio (D2, *provisional a confirmar*: el negocio
//     cancela o la clienta avisa con 24 h → se devuelve; si no, o si no vino → se la queda el
//     negocio) y la recepción lo puede cambiar. Sin elegir, no se confirma (CH-013). Lo aplica
//     `cerrarTurnoSinPrestar` en una sola transacción (cambio de estado + anulación de los cobros).
//   · Si no pagó nada: no hay nada que decidir sobre la plata; va por `cancelAppointment` o
//     `markNoShow`, como siempre.
// El error del servidor se muestra tal cual, adentro de la hoja («Ese turno cambió recién. Recargá
// la agenda.»): antes `cancelAppointment` fallaba en silencio (B3).

import { useId, useState, useTransition } from "react";
import { cancelAppointment, cerrarTurnoSinPrestar, markNoShow } from "@/lib/actions";
import { Button, Hoja, Segmented } from "@/components/ui";
import { fmtTime } from "@/lib/datetime";
import { useToast } from "../../ToastProvider";
import {
  consecuenciaDelCierre,
  pesos,
  propuestaDeSenia,
  type CierreSinPrestar,
  type DestinoDeLaSenia,
  type QuienCancela,
  type TurnoDelDia,
} from "../agenda-core";
import { aFormData, camposDeCancelar, camposDeCerrarSinPrestar, camposDelTurno, leerResultado } from "./campos";

export type CierreAbierto = { turnoId: string; accion: CierreSinPrestar };

function Pregunta({
  turno,
  accion,
  ahora,
  puedeDevolver,
  motivoSinDevolver,
  conDeshacer = false,
  onListo,
  onVolver,
}: {
  turno: TurnoDelDia;
  accion: CierreSinPrestar;
  ahora: Date;
  puedeDevolver: boolean;
  motivoSinDevolver?: string;
  conDeshacer?: boolean;
  onListo: (mensaje: string) => void;
  onVolver: () => void;
}) {
  const id = useId();
  const { showSuccess } = useToast();
  const [quien, setQuien] = useState<QuienCancela | null>(null);
  // `undefined` = la recepción todavía no tocó nada: manda la propuesta. Elegido, manda lo elegido.
  const [elegido, setElegido] = useState<DestinoDeLaSenia | undefined>(undefined);
  const [error, setError] = useState("");
  const [pendiente, empezar] = useTransition();

  const hora = fmtTime(turno.inicio);
  const cobrado = turno.cobrado;
  const conPlata = cobrado > 0;
  const propuesta = propuestaDeSenia({ accion, quien, inicio: turno.inicio, ahora, cobrado });
  const sugerido = propuesta === "devolver" && !puedeDevolver ? null : propuesta;
  const destino = elegido ?? sugerido;
  const falta = conPlata && (destino === null || (accion === "cancelar" && quien === null));
  const consecuencia = consecuenciaDelCierre({ accion, hora, cobrado, destino });

  const confirmar = () => {
    if (falta || pendiente) return;
    setError("");
    empezar(async () => {
      try {
        const r = leerResultado(
          conPlata
            ? await cerrarTurnoSinPrestar(aFormData(camposDeCerrarSinPrestar({ turnoId: turno.id, accion, senia: destino })))
            : accion === "cancelar"
              ? await cancelAppointment(aFormData(camposDeCancelar(turno.id, quien)))
              : await markNoShow(aFormData(camposDelTurno(turno.id))),
        );
        if (!r.ok) {
          setError(r.error);
          return;
        }
        const hecho = accion === "cancelar" ? `Cancelado: ${turno.clienta}, ${hora}.` : `Marcado: ${turno.clienta} no vino.`;
        const mensaje = r.aviso ? `${hecho} ${r.aviso}` : hecho;
        // Con [Deshacer], el aviso lo da quien monta la hoja (un solo cartel, no dos encimados).
        if (!conDeshacer) showSuccess(mensaje);
        onListo(mensaje);
      } catch {
        setError("No se pudo. Probá de nuevo; si sigue, avisá.");
      }
    });
  };

  return (
    <div className="space-y-5">
      {conPlata && accion === "cancelar" && (
        <Segmented
          name={`${id}-quien`}
          leyenda="¿Quién cancela?"
          leyendaVisible
          lleno
          value={quien ?? ""}
          onChange={(e) => {
            const v = (e.nativeEvent.target as HTMLInputElement | null)?.value;
            setQuien(v === "clienta" || v === "negocio" ? v : null);
            setElegido(undefined); // cambia quién cancela → vuelve a mandar la propuesta
          }}
          opciones={[
            { valor: "clienta", etiqueta: "La clienta" },
            { valor: "negocio", etiqueta: "El negocio" },
          ]}
        />
      )}

      {conPlata && (
        <div className="space-y-2">
          <Segmented
            name={`${id}-senia`}
            leyenda={`Ya pagó ${pesos(cobrado)}. ¿Qué pasa con esa plata?`}
            leyendaVisible
            lleno
            value={destino ?? ""}
            onChange={(e) => {
              const v = (e.nativeEvent.target as HTMLInputElement | null)?.value;
              if (v === "retener" || v === "devolver") setElegido(v);
            }}
            opciones={[
              { valor: "retener", etiqueta: "Se la queda el negocio" },
              { valor: "devolver", etiqueta: "Se la devolvemos", disabled: !puedeDevolver },
            ]}
          />
          {sugerido && elegido === undefined && (
            <p className="text-xs text-muted">
              Marcado según la regla del negocio ({accion === "no-vino" ? "no vino" : quien === "negocio" ? "cancela el negocio" : propuesta === "devolver" ? "avisó con 24 h o más" : "avisó con menos de 24 h"}). Podés cambiarlo.
            </p>
          )}
          {!puedeDevolver && <p className="text-xs text-muted">{motivoSinDevolver ?? "Devolver una seña lo hace quien cobra los turnos."}</p>}
        </div>
      )}

      <p id={`${id}-consecuencia`} aria-live="polite" className="border-l-2 border-line-strong pl-3 text-sm text-strong">
        {consecuencia}
      </p>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      <div className="flex flex-col gap-2 sm:flex-row-reverse">
        <Button
          type="button"
          variant="danger"
          size="lg"
          className="w-full sm:w-auto"
          disabled={falta || pendiente}
          estado={pendiente ? "cargando" : undefined}
          aria-describedby={`${id}-consecuencia`}
          onClick={confirmar}
        >
          {pendiente ? "Guardando…" : accion === "cancelar" ? "Sí, cancelar el turno" : "Sí, no vino"}
        </Button>
        <Button type="button" variant="ghost" size="lg" className="w-full sm:w-auto" disabled={pendiente} onClick={onVolver}>
          No, volver
        </Button>
      </div>
    </div>
  );
}

/**
 * La hoja de cancelar / «no vino». Controlada: la abre la mesa (desde el cajón o desde el «⋯» del
 * renglón) con el turno y la acción.
 */
export default function CancelarONoVino({
  turno,
  accion,
  ahora,
  puedeDevolver,
  conDeshacer = false,
  onCerrar,
  onListo,
}: {
  turno: TurnoDelDia | null;
  accion: CierreSinPrestar;
  ahora: Date;
  /** ¿Quien mira puede devolver la seña? (cobra turnos y el veredicto de ESTE turno lo deja). */
  puedeDevolver: boolean;
  /** Quien la monta muestra el aviso con [Deshacer] (la mesa): la hoja no muestra el suyo. */
  conDeshacer?: boolean;
  onCerrar: () => void;
  /** Salió bien (con el texto del aviso): cerrar la hoja y lo que haya abajo (el cajón). */
  onListo: (mensaje: string) => void;
}) {
  const t = turno;
  return (
    <Hoja
      abierta={!!t}
      onCerrar={onCerrar}
      titulo={t ? `${accion === "cancelar" ? "Cancelar el turno" : "No vino"} · ${t.clienta}` : ""}
      descripcion={t ? `${fmtTime(t.inicio)} · ${t.servicio} · ${t.profesional}` : undefined}
    >
      {t && (
        <Pregunta
          key={`${t.id}-${accion}`}
          turno={t}
          accion={accion}
          ahora={ahora}
          puedeDevolver={puedeDevolver}
          motivoSinDevolver={t.veredicto.ok ? undefined : t.veredicto.motivo}
          conDeshacer={conDeshacer}
          onListo={onListo}
          onVolver={onCerrar}
        />
      )}
    </Hoja>
  );
}
