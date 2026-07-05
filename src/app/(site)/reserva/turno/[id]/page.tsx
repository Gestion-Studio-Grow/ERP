import { getMyAppointment } from "@/lib/client-actions";
import { notFound } from "next/navigation";
import Link from "next/link";
import CancelButton from "./CancelButton";
import RescheduleButton from "./RescheduleButton";
import ReviewForm from "./ReviewForm";
import { fmtDateTime } from "@/lib/datetime";

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
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const appointment = await getMyAppointment(id);
  if (!appointment) notFound();

  // Un turno vivo y futuro se puede tanto cancelar como reprogramar.
  const canModify =
    (appointment.status === "PENDING" || appointment.status === "CONFIRMED") &&
    appointment.startsAt.getTime() > Date.now();

  return (
    <div className="mx-auto max-w-lg px-6 py-16">
      <h1 className="font-serif text-3xl mb-1" style={{ color: "var(--text-strong)" }}>
        Tu turno
      </h1>
      <p className="mb-8" style={{ color: "var(--text-muted)" }}>
        Hola {appointment.client.name}, acá está el detalle.
      </p>

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
            {statusLabel[appointment.status] ?? appointment.status}
          </span>
        </p>
      </div>

      {canModify && (
        <div className="flex flex-wrap items-center">
          <RescheduleButton
            appointmentId={appointment.id}
            professionalId={appointment.professionalId}
            serviceId={appointment.serviceId}
          />
          <CancelButton appointmentId={appointment.id} />
        </div>
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
