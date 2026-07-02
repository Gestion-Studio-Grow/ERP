import { getMyAppointment } from "@/lib/client-actions";
import { notFound } from "next/navigation";
import Link from "next/link";
import CancelButton from "./CancelButton";
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

  const canCancel =
    (appointment.status === "PENDING" || appointment.status === "CONFIRMED") &&
    appointment.startsAt.getTime() > Date.now();

  return (
    <div className="mx-auto max-w-lg px-6 py-16">
      <h1 className="font-serif text-3xl mb-1" style={{ color: "var(--spa-mocha-dark)" }}>
        Tu turno
      </h1>
      <p className="mb-8" style={{ color: "var(--spa-mocha)" }}>
        Hola {appointment.client.name}, acá está el detalle.
      </p>

      <div
        className="rounded-lg p-5 space-y-2 mb-6"
        style={{ background: "var(--spa-sage-light)", color: "var(--spa-mocha-dark)" }}
      >
        <p><span style={{ color: "var(--spa-mocha)" }}>Servicio:</span> {appointment.service.name}</p>
        <p><span style={{ color: "var(--spa-mocha)" }}>Profesional:</span> {appointment.professional.name}</p>
        <p><span style={{ color: "var(--spa-mocha)" }}>Box:</span> {appointment.box.name}</p>
        <p>
          <span style={{ color: "var(--spa-mocha)" }}>Fecha y hora:</span>{" "}
          {fmtDateTime(appointment.startsAt)}
        </p>
        <p className="pt-1">
          <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${statusStyles[appointment.status]}`}>
            {statusLabel[appointment.status] ?? appointment.status}
          </span>
        </p>
      </div>

      {canCancel && <CancelButton appointmentId={appointment.id} />}

      {appointment.status === "COMPLETED" && !appointment.review && (
        <ReviewForm appointmentId={appointment.id} />
      )}

      {appointment.status === "COMPLETED" && appointment.review && (
        <div
          className="rounded-lg p-5 text-sm mb-6"
          style={{ background: "var(--spa-sage-light)", color: "var(--spa-mocha-dark)" }}
        >
          Ya dejaste tu reseña ({appointment.review.rating}/5). ¡Gracias!
        </div>
      )}

      {!canCancel && appointment.status === "CANCELLED" && (
        <p className="text-sm mb-6" style={{ color: "var(--spa-mocha)" }}>
          Este turno fue cancelado.
        </p>
      )}

      <div className="flex gap-4 text-sm">
        <Link href="/reserva" className="underline" style={{ color: "var(--spa-mocha-dark)" }}>
          Reservar otro turno
        </Link>
        <Link href="/" className="underline" style={{ color: "var(--spa-mocha)" }}>
          Volver al inicio
        </Link>
      </div>
    </div>
  );
}
