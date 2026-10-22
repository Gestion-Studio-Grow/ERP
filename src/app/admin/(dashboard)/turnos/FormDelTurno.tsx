"use client";

// Un <form> de UN botón sobre un turno (Confirmar, Cancelar) que MUESTRA el rechazo del servidor.
//
// Reingeniería CH (Tanda 1, B3): `cancelAppointment` y `confirmarTurno` devolvían nada y, si el
// turno había cambiado (otra recepcionista lo completó un segundo antes), la pantalla quedaba en
// silencio y la recepción creía haber cancelado. Ahora devuelven `ResultadoAccion`; esto lo lee y
// dice «Ese turno cambió recién. Recargá la agenda.» al lado del botón.

import { useState } from "react";
import type { ResultadoAccion } from "@/lib/actions";
import SubmitButton from "@/components/SubmitButton";

export default function FormDelTurno({
  accion,
  appointmentId,
  pendingText,
  className,
  children,
}: {
  accion: (fd: FormData) => Promise<ResultadoAccion>;
  appointmentId: string;
  pendingText: string;
  className?: string;
  children: React.ReactNode;
}) {
  const [error, setError] = useState("");
  return (
    <form
      action={async (fd) => {
        setError("");
        try {
          const r = await accion(fd);
          if (!r.ok) setError(r.error);
        } catch {
          setError("No se pudo. Probá de nuevo; si sigue, avisá.");
        }
      }}
      className="flex flex-col gap-1"
    >
      <input type="hidden" name="appointmentId" value={appointmentId} />
      <SubmitButton pendingText={pendingText} className={className}>
        {children}
      </SubmitButton>
      {error && (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
