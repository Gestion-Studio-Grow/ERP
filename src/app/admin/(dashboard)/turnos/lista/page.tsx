import { getAppointments } from "@/lib/actions";
import AppointmentRow from "../AppointmentRow";
import Link from "next/link";

export const statusLabel: Record<string, string> = {
  PENDING: "Pendiente de pago",
  CONFIRMED: "Confirmado",
  CANCELLED: "Cancelado",
  COMPLETED: "Completado",
  NO_SHOW: "No se presentó",
};

export default async function TurnosListaPage() {
  const appointments = await getAppointments();
  const pending = appointments.filter((a) => a.status === "PENDING");
  const rest = appointments.filter((a) => a.status !== "PENDING");

  return (
    <main className="mx-auto max-w-4xl px-6 py-8">
      <div className="flex items-center gap-4 mb-1">
        <h1 className="text-2xl font-semibold">Agenda</h1>
      </div>
      <div className="flex gap-4 text-sm mb-6 border-b">
        <Link href="/admin/turnos" className="px-1 pb-2 text-neutral-500 hover:text-black">
          Calendario
        </Link>
        <Link href="/admin/turnos/lista" className="px-1 pb-2 border-b-2 border-black font-medium">
          Lista
        </Link>
      </div>
      <p className="text-neutral-500 mb-8">
        Confirmá el turno manualmente cuando recibas el comprobante por WhatsApp.
      </p>

      <section className="mb-10">
        <h2 className="text-lg font-medium mb-3">
          Pendientes de confirmar ({pending.length})
        </h2>
        {pending.length === 0 && (
          <p className="text-sm text-neutral-500">No hay solicitudes pendientes.</p>
        )}
        <div className="space-y-3">
          {pending.map((a) => (
            <AppointmentRow key={a.id} appointment={a} statusLabel={statusLabel} />
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-medium mb-3">Historial</h2>
        <div className="space-y-3">
          {rest.length === 0 && (
            <p className="text-sm text-neutral-500">Todavía no hay turnos en el historial.</p>
          )}
          {rest.map((a) => (
            <AppointmentRow key={a.id} appointment={a} statusLabel={statusLabel} />
          ))}
        </div>
      </section>
    </main>
  );
}
