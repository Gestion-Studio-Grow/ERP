"use client";

// AGENDA PRÁCTICA (T10 + E3): «Cancelar turno» y «No se presentó» con la consecuencia escrita y,
// si la clienta ya pagó algo, la pregunta de qué pasa con esa plata. Un clic suelto ya no cancela:
// primero se lee qué va a pasar. La decisión la aplica `cerrarTurnoSinPrestar` (actions.ts) en una
// sola transacción. Sólo se usa con el interruptor «agenda-practica» prendido.

import { useEffect, useRef, useState } from "react";
import { cerrarTurnoSinPrestar } from "@/lib/actions";
import SubmitButton from "@/components/SubmitButton";
import { buttonClasses, fmtMoneyARS } from "@/components/ui";
import { preguntaDeCierre, type CierreSinPrestar as Accion } from "@/lib/turnos/practica";
import { useToast } from "../ToastProvider";

export default function CerrarSinPrestar({
  appointmentId,
  accion,
  clienta,
  hora,
  cobrado,
  botonClassName,
}: {
  appointmentId: string;
  accion: Accion;
  clienta: string;
  hora: string;
  /** Plata que ya entró por este turno (seña o parciales). */
  cobrado: number;
  botonClassName: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const [error, setError] = useState("");
  // El foco acompaña: al abrir va a la pregunta (el lector la lee); al volver, al botón que la abrió.
  const pregunta = useRef<HTMLParagraphElement>(null);
  const disparador = useRef<HTMLButtonElement>(null);
  const volvio = useRef(false);
  useEffect(() => {
    if (abierto) pregunta.current?.focus();
    else if (volvio.current) disparador.current?.focus();
  }, [abierto]);
  const { showSuccess } = useToast();
  const etiqueta = accion === "cancelar" ? "Cancelar turno" : "No se presentó";

  if (!abierto) {
    return (
      <button ref={disparador} type="button" className={botonClassName} onClick={() => setAbierto(true)}>
        {etiqueta}
      </button>
    );
  }

  return (
    <form
      action={async (fd) => {
        setError("");
        const r = await cerrarTurnoSinPrestar(fd);
        if (!r.ok) return setError(r.error);
        const hecho = accion === "cancelar" ? `Turno de ${clienta} cancelado.` : `Marcado: ${clienta} no vino.`;
        showSuccess(r.aviso ? `${hecho} ${r.aviso}` : hecho);
      }}
      className="flex flex-col gap-2 rounded-md border border-line bg-surface-sunken p-3"
      aria-label={etiqueta}
    >
      <input type="hidden" name="appointmentId" value={appointmentId} />
      <input type="hidden" name="accion" value={accion} />
      <p ref={pregunta} tabIndex={-1} className="text-sm text-body focus:outline-none">
        {preguntaDeCierre({ accion, clienta, hora })}
      </p>
      {cobrado > 0 && (
        <fieldset className="flex flex-col gap-1">
          <legend className="mb-1 text-xs font-medium text-muted">
            Ya pagó {fmtMoneyARS(cobrado, 0)}. ¿Qué pasa con esa plata?
          </legend>
          <label className="flex min-h-11 items-center gap-2 text-sm text-body sm:min-h-0">
            <input type="radio" name="senia" value="retener" required className="accent-accent" />
            Se la queda el negocio
          </label>
          <label className="flex min-h-11 items-center gap-2 text-sm text-body sm:min-h-0">
            <input type="radio" name="senia" value="devolver" className="accent-accent" />
            Se la devolvemos (se anula el cobro en la caja)
          </label>
        </fieldset>
      )}
      <div className="flex flex-wrap gap-2">
        <SubmitButton pendingText="Guardando…" className={buttonClasses("solid", "sm", "whitespace-nowrap")}>
          {accion === "cancelar" ? "Sí, cancelar" : "Sí, no vino"}
        </SubmitButton>
        <button
          type="button"
          className={buttonClasses("ghost", "sm")}
          onClick={() => {
            volvio.current = true;
            setAbierto(false);
          }}
        >
          No, volver
        </button>
      </div>
      {error && (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
