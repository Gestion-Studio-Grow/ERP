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
import Link from "next/link";
import { confirmarTurno, marcarAvisada, type TurnoAConfirmar } from "@/lib/actions";
import SubmitButton from "@/components/SubmitButton";
import { buttonClasses } from "@/components/ui";
import { fmtCalendarDateLabel, fmtTime } from "@/lib/datetime";
import { waLinkClienta } from "@/lib/whatsapp-cta";
import { claseBotonWhatsApp } from "../clientes/boton-whatsapp";
import PasoVacio from "./PasoVacio";
import { vacioManana } from "./pasos";

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
        {!wa && (
          <p className="text-xs text-warning">
            El teléfono cargado ({turno.telefono}) no es un celular válido.{" "}
            {/* Lleva directo a su ficha, donde se corrige con "Editar datos". */}
            <Link
              href={`/admin/clientes/${encodeURIComponent(turno.clientId)}`}
              className="font-medium underline max-sm:inline-flex max-sm:min-h-11 max-sm:items-center"
            >
              Corregilo en su ficha
            </Link>{" "}
            para poder avisarle.
          </p>
        )}
        {error && (
          <p className="text-xs text-danger" role="alert">
            {error}
          </p>
        )}
      </div>
      {/* En el celular los dos botones van a lo ancho, uno abajo del otro: son LA tarea de esta
          fila y se tocan con el pulgar. */}
      <div className="flex flex-wrap items-center gap-2 max-sm:flex-col max-sm:items-stretch">
        {wa && (
          // Un <a> de verdad y no `window.open`: el navegador abre WhatsApp en el mismo toque
          // (en el celular, la app) sin bloqueo de ventanas emergentes. El estampado corre en
          // paralelo; si falla, se avisa en la fila y el chat igual quedó abierto.
          <a
            href={wa}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${avisadaEl ? "WhatsApp de nuevo" : "WhatsApp"} a ${turno.clienta}`}
            className={claseBotonWhatsApp(avisadaEl ? "outline" : "solid")}
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
            <SubmitButton pendingText="Confirmando…" className={buttonClasses("outline", "md", "whitespace-nowrap max-sm:w-full")}>
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
        {turnos.length > 0 && (
          <p className="text-sm text-muted">
            {`${turnos.length} turno${turnos.length === 1 ? "" : "s"}, ${sinAvisar} sin avisar. El botón abre WhatsApp con el recordatorio listo.`}
          </p>
        )}
      </div>
      {/* Sin turnos no hay nada que confirmar: se ofrece darle uno a quien llame para mañana. */}
      {turnos.length === 0 && <PasoVacio paso={vacioManana({ dia })} className="m-4" />}
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
