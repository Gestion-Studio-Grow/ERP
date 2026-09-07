import { getAppointments, getProfessionalsWithServices } from "@/lib/actions";
import AppointmentRow from "../AppointmentRow";
import AppointmentsHistoryList from "./AppointmentsHistoryList";
import NewAppointmentForm from "../NewAppointmentForm";
import Link from "next/link";
import { requireCapability } from "@/lib/authz";
import { esCuentaACobrar, estadoCobroTurno } from "@/lib/turnos/cobros";

export const dynamic = "force-dynamic";

// "Reservado" y no "Pendiente de pago": la seña se cobra al reservar y el estado del turno
// no dice nada de la plata (eso lo dice cobrado/saldo en la fila).
export const statusLabel: Record<string, string> = {
  PENDING: "Reservado",
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
  // Cuentas a cobrar DERIVADAS: turnos prestados (COMPLETED) con saldo > 0. No es un estado
  // nuevo del enum (decisión de producto): es precio − Σ cobros, en la fila y acá.
  const aCobrar = appointments.filter((a) => {
    const plata = estadoCobroTurno({
      precio: a.priceAtBooking ?? a.service.price,
      cobros: a.collections,
      pagoLegado: a.payment,
    });
    return esCuentaACobrar({ status: a.status, saldo: plata.saldo });
  });
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
        La seña se cobra al reservar (o registrala cuando llegue el comprobante por WhatsApp);
        confirmá el turno cuando la clienta confirme, y al completarlo se cobra el resto.
      </p>

      <NewAppointmentForm professionals={professionals} />

      <section className="mb-10">
        <h2 className="text-lg font-medium text-strong mb-3">
          Reservados, pendientes de confirmar ({pending.length})
        </h2>
        {pending.length === 0 && (
          <p className="text-sm text-muted">No hay reservas pendientes de confirmar.</p>
        )}
        <div className="space-y-3">
          {pending.map((a) => (
            <AppointmentRow key={a.id} appointment={a} statusLabel={statusLabel} />
          ))}
        </div>
      </section>

      {aCobrar.length > 0 && (
        <section className="mb-10">
          <h2 className="text-lg font-medium text-strong mb-3">Saldos a cobrar ({aCobrar.length})</h2>
          <p className="text-sm text-muted mb-3">Turnos ya realizados con plata pendiente.</p>
          <div className="space-y-3">
            {aCobrar.map((a) => (
              <AppointmentRow key={a.id} appointment={a} statusLabel={statusLabel} />
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="text-lg font-medium text-strong mb-3">Historial</h2>
        <AppointmentsHistoryList appointments={rest} statusLabel={statusLabel} />
      </section>
    </main>
  );
}
