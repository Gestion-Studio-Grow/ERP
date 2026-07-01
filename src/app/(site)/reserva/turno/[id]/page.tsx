import { getMyAppointment } from "@/lib/client-actions";
import { notFound } from "next/navigation";
import Link from "next/link";
import CancelButton from "./CancelButton";

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
      <h1 className="text-2xl font-semibold mb-1">Tu turno</h1>
      <p className="text-neutral-500 mb-8">Hola {appointment.client.name}, acá está el detalle.</p>

      <div className="rounded-lg border p-5 space-y-2 mb-6">
        <p><span className="text-neutral-500">Servicio:</span> {appointment.service.name}</p>
        <p><span className="text-neutral-500">Profesional:</span> {appointment.professional.name}</p>
        <p><span className="text-neutral-500">Box:</span> {appointment.box.name}</p>
        <p>
          <span className="text-neutral-500">Fecha y hora:</span>{" "}
          {appointment.startsAt.toLocaleString("es-AR", { dateStyle: "full", timeStyle: "short" })}
        </p>
        <p className="pt-1">
          <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${statusStyles[appointment.status]}`}>
            {statusLabel[appointment.status] ?? appointment.status}
          </span>
        </p>
      </div>

      {canCancel && <CancelButton appointmentId={appointment.id} />}

      {!canCancel && appointment.status === "CANCELLED" && (
        <p className="text-sm text-neutral-500 mb-6">Este turno fue cancelado.</p>
      )}

      <div className="flex gap-4 text-sm">
        <Link href="/reserva" className="underline">
          Reservar otro turno
        </Link>
        <Link href="/" className="underline text-neutral-500">
          Volver al inicio
        </Link>
      </div>
    </div>
  );
}
