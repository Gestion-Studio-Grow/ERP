"use client";

// "MAÑANA: CONFIRMAR" — confirmar los turnos del día siguiente con un toque de WhatsApp.
//
// El recordatorio automático hoy no llega a la mayoría de estos turnos (la ventana del cron,
// ver src/lib/cron/reminder-sweep.ts) y el WhatsApp del sistema está simulado. Lo que hacía la
// recepción era copiar nombre y teléfono de cada fila a mano. Acá cada turno de mañana trae su
// botón: abre el chat con la clienta (549 + teléfono normalizado) y el texto del recordatorio
// ya armado con la plantilla del panel y la hora de Buenos Aires. Al tocarlo, el turno queda
// "avisada HH:MM" (`reminderSentAt`, la misma columna que mira el cron, así no se le vuelve a
// mandar).
//
// Sin imports de valor de Prisma: es un componente cliente. Las fechas llegan como ISO.

import { useState } from "react";
import { confirmarTurno, marcarAvisada, type TurnoAConfirmar } from "@/lib/actions";
import SubmitButton from "@/components/SubmitButton";
import { buttonClasses } from "@/components/ui";
import { fmtCalendarDateLabel, fmtTime } from "@/lib/datetime";
import { waLinkClienta } from "@/lib/whatsapp-cta";

function FilaAConfirmar({ turno }: { turno: TurnoAConfirmar }) {
  const [avisadaEl, setAvisadaEl] = useState(turno.avisadaEl);
  const [error, setError] = useState("");
  const wa = waLinkClienta(turno.telefono, turno.texto);

  return (
    <li className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 text-sm">
        <p className="text-strong">
          <span className="tabular-nums font-medium">{fmtTime(turno.startsAt)}</span> {turno.clienta}
          <span className="ml-2 text-xs text-muted">{turno.status === "PENDING" ? "Reservado" : "Confirmado"}</span>
        </p>
        <p className="text-muted">
          {turno.servicio} · {turno.profesional}
        </p>
        {avisadaEl && <p className="text-xs text-success">avisada {fmtTime(avisadaEl)}</p>}
        {!wa && <p className="text-xs text-warning">El teléfono cargado ({turno.telefono}) no es un celular válido.</p>}
        {error && (
          <p className="text-xs text-danger" role="alert">
            {error}
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {wa && (
          // Un <a> de verdad y no `window.open`: el navegador abre WhatsApp en el mismo toque
          // (en el celular, la app) sin bloqueo de ventanas emergentes. El estampado corre en
          // paralelo; si falla, se avisa en la fila y el chat igual quedó abierto.
          <a
            href={wa}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonClasses(avisadaEl ? "outline" : "solid", "md", "whitespace-nowrap")}
            onClick={async () => {
              setError("");
              try {
                const r = await marcarAvisada(turno.id);
                if (r.ok) setAvisadaEl(r.avisadaEl);
                else setError(r.error);
              } catch {
                setError("Se abrió WhatsApp pero no se pudo marcar como avisada. Probá de nuevo.");
              }
            }}
          >
            {avisadaEl ? "WhatsApp de nuevo" : "WhatsApp"}
          </a>
        )}
        {turno.status === "PENDING" && (
          <form action={confirmarTurno}>
            <input type="hidden" name="appointmentId" value={turno.id} />
            <SubmitButton pendingText="Confirmando…" className={buttonClasses("outline", "md", "whitespace-nowrap")}>
              Confirmar turno
            </SubmitButton>
          </form>
        )}
      </div>
    </li>
  );
}

export default function MananaConfirmar({ dia, turnos }: { dia: string; turnos: TurnoAConfirmar[] }) {
  const sinAvisar = turnos.filter((t) => !t.avisadaEl).length;
  return (
    <section className="mb-6 rounded-lg border border-line bg-surface-raised" aria-labelledby="manana-confirmar">
      <div className="border-b border-line px-4 py-3">
        <h2 id="manana-confirmar" className="text-base font-medium text-strong">
          Mañana: confirmar <span className="text-muted font-normal">({fmtCalendarDateLabel(dia)})</span>
        </h2>
        <p className="text-sm text-muted">
          {turnos.length === 0
            ? "No hay turnos reservados ni confirmados para mañana."
            : `${turnos.length} turno${turnos.length === 1 ? "" : "s"}, ${sinAvisar} sin avisar. El botón abre WhatsApp con el recordatorio listo.`}
        </p>
      </div>
      {turnos.length > 0 && (
        <ul className="divide-y divide-line/60">
          {turnos.map((t) => (
            <FilaAConfirmar key={t.id} turno={t} />
          ))}
        </ul>
      )}
    </section>
  );
}
