import { getAppointments, getProfessionalsWithServices } from "@/lib/actions";
import AppointmentRow from "../AppointmentRow";
import AppointmentsHistoryList from "./AppointmentsHistoryList";
import NewAppointmentForm from "../NewAppointmentForm";
import Link from "next/link";
import { requireCapability } from "@/lib/authz";

export const dynamic = "force-dynamic";

export const statusLabel: Record<string, string> = {
  PENDING: "Pendiente de pago",
  CONFIRMED: "Confirmado",
  CANCELLED: "Cancelado",
  COMPLETED: "Completado",
  NO_SHOW: "No se presentó",
};

export default async function TurnosListaPage() {
  // La lista (historial completo + alta manual) es gestión de agenda: solo
  // OWNER/RECEPTION. El PROFESSIONAL cae acá a su calendario propio.
  await requireCapability("agenda:manage");
  const [appointments, professionals] = await Promise.all([
    getAppointments(),
    getProfessionalsWithServices(),
  ]);
  const pending = appointments.filter((a) => a.status === "PENDING");
  const rest = appointments.filter((a) => a.status !== "PENDING");

  return (
    <main className="mx-auto max-w-4xl px-6 py-8">
      <div className="flex items-center gap-4 mb-1">
        <h1 className="text-2xl font-semibold text-strong">Agenda</h1>
      </div>
      <div className="flex gap-4 text-sm mb-6 border-b border-line">
        <Link href="/admin/turnos" className="px-1 pb-2 text-muted hover:text-strong">
          Calendario
        </Link>
        <Link href="/admin/turnos/lista" className="px-1 pb-2 border-b-2 border-accent text-strong font-medium">
          Lista
        </Link>
      </div>
      <p className="text-muted mb-6">
        Confirmá el turno manualmente cuando recibas el comprobante por WhatsApp.
      </p>

      <NewAppointmentForm professionals={professionals} />

      <section className="mb-10">
        <h2 className="text-lg font-medium text-strong mb-3">
          Pendientes de confirmar ({pending.length})
        </h2>
        {pending.length === 0 && (
          <p className="text-sm text-muted">No hay solicitudes pendientes.</p>
        )}
        <div className="space-y-3">
          {pending.map((a) => (
            <AppointmentRow key={a.id} appointment={a} statusLabel={statusLabel} />
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-medium text-strong mb-3">Historial</h2>
        <AppointmentsHistoryList appointments={rest} statusLabel={statusLabel} />
      </section>
    </main>
  );
}
