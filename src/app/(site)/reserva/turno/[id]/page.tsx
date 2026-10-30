import { getMyAppointment } from "@/lib/client-actions";
import { destinoPropio, estadoPublicoDelTurno, rubroDelTurno } from "@/lib/turnos/rubro-del-turno";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import CancelButton from "./CancelButton";
import RescheduleButton from "./RescheduleButton";
import ReviewForm from "./ReviewForm";
import { fmtDateTime } from "@/lib/datetime";
import { isAppointmentModifiable } from "@/lib/booking-core";
import { cambioOnlineDelTurno } from "@/lib/turnos/practica.server";
import { chConDisenoNuevo } from "../../../_ch/diseno-ch.server";

const statusLabel: Record<string, string> = {
  PENDING: "Pendiente de pago",
  CONFIRMED: "Confirmado",
  CANCELLED: "Cancelado",
  COMPLETED: "Completado",
  NO_SHOW: "No se presentó",
};

const statusStyles: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-800",
  CONFIRMED: "bg-emerald-100 text-emerald-800",
  CANCELLED: "bg-neutral-200 text-neutral-600",
  COMPLETED: "bg-blue-100 text-blue-800",
  NO_SHOW: "bg-red-100 text-red-800",
};

export default async function MyAppointmentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ resena?: string | string[] }>;
}) {
  const { id } = await params;
  const resena = (await searchParams).resena === "1";
  // El taller tiene su propia página del turno (piel, puesto, patente; sin «Pendiente de pago»): QA AGR 29/10.
  // Ronda 2: por el rubro del alta (blueprint), no sólo por el slug; el profe va a su turnero.
  const propio = destinoPropio(await rubroDelTurno(), "turno", id, { resena });
  if (propio) redirect(propio);
  const appointment = await getMyAppointment(id);
  if (!appointment) notFound();
  // «Pendiente de pago» sólo si el servicio pide seña (ronda 2); sin seña, el turno está «A confirmar».
  const etiquetaDelEstado =
    appointment.status === "PENDING" ? estadoPublicoDelTurno(appointment.service.depositAmount).texto : (statusLabel[appointment.status] ?? appointment.status);

  // Un turno vivo y futuro se puede tanto cancelar como reprogramar (política pura
  // y testeable en booking-core; no llamamos Date.now en el render del RSC).
  const canModify = isAppointmentModifiable(appointment.status, appointment.startsAt);
  // Agenda práctica (E2): dentro del plazo del negocio, la clienta ve la regla en vez de botones que no andan.
  const [{ regla, puede }, nuevo] = await Promise.all([
    canModify ? cambioOnlineDelTurno(appointment.startsAt) : Promise.resolve({ regla: null, puede: false }),
    // Diseño nuevo de CH (sólo con su interruptor prendido): misma página, escala y tarjeta en tipografía.
    chConDisenoNuevo(),
  ]);

  return (
    <div className={nuevo ? "chr mx-auto max-w-lg px-6 py-16" : "mx-auto max-w-lg px-6 py-16"}>
      <h1 className={nuevo ? "chr-h1" : "font-serif text-3xl mb-1"} style={{ color: "var(--text-strong)" }}>
        Tu turno
      </h1>
      <p className="mb-8" style={{ color: "var(--text-muted)" }}>
        Acá está el detalle de tu turno.
      </p>

      {nuevo ? (
        <dl className="chr-tarjeta" style={{ marginBottom: 24 }}>
          <div>
            <dt>Turno</dt>
            <dd className="chr-codigo">{appointment.id.slice(-6).toUpperCase()}</dd>
          </div>
          <div>
            <dt>Servicio</dt>
            <dd>{appointment.service.name}</dd>
          </div>
          <div>
            <dt>Profesional</dt>
            <dd>{appointment.professional.name}</dd>
          </div>
          <div>
            <dt>Box</dt>
            <dd>{appointment.box.name}</dd>
          </div>
          <div>
            <dt>Fecha y hora</dt>
            <dd>{fmtDateTime(appointment.startsAt)}</dd>
          </div>
          <div>
            <dt>Estado</dt>
            <dd>
              <span className="chr-estado">{etiquetaDelEstado}</span>
            </dd>
          </div>
        </dl>
      ) : (
      <div
        className="rounded-lg p-5 space-y-2 mb-6"
        style={{ background: "var(--surface-sunken)", color: "var(--text-strong)" }}
      >
        <p><span style={{ color: "var(--text-muted)" }}>Servicio:</span> {appointment.service.name}</p>
        <p><span style={{ color: "var(--text-muted)" }}>Profesional:</span> {appointment.professional.name}</p>
        <p><span style={{ color: "var(--text-muted)" }}>Box:</span> {appointment.box.name}</p>
        <p>
          <span style={{ color: "var(--text-muted)" }}>Fecha y hora:</span>{" "}
          {fmtDateTime(appointment.startsAt)}
        </p>
        <p className="pt-1">
          <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${statusStyles[appointment.status]}`}>
            {etiquetaDelEstado}
          </span>
        </p>
      </div>
      )}

      {canModify && puede && (
        <div className="flex flex-wrap items-center">
          <RescheduleButton
            appointmentId={appointment.id}
            professionalId={appointment.professionalId}
            serviceId={appointment.serviceId}
          />
          <CancelButton appointmentId={appointment.id} />
        </div>
      )}
      {/* Agenda práctica (T12): hasta cuándo se cambia online; el servidor la aplica (E2). */}
      {regla && (
        <p className="mb-6 text-sm" style={{ color: "var(--text-muted)" }}>
          {regla}
        </p>
      )}

      {appointment.status === "COMPLETED" && !appointment.review && (
        <ReviewForm appointmentId={appointment.id} />
      )}

      {appointment.status === "COMPLETED" && appointment.review && (
        <div
          className="rounded-lg p-5 text-sm mb-6"
          style={{ background: "var(--surface-sunken)", color: "var(--text-strong)" }}
        >
          Ya dejaste tu reseña ({appointment.review.rating}/5). ¡Gracias!
        </div>
      )}

      {!canModify && appointment.status === "CANCELLED" && (
        <p className="text-sm mb-6" style={{ color: "var(--text-muted)" }}>
          Este turno fue cancelado.
        </p>
      )}

      <div className="flex gap-4 text-sm">
        <Link href="/reserva" className="underline" style={{ color: "var(--text-strong)" }}>
          Reservar otro turno
        </Link>
        <Link href="/" className="underline" style={{ color: "var(--text-muted)" }}>
          Volver al inicio
        </Link>
      </div>
    </div>
  );
}
