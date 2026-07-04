"use client";

import { confirmPayment, cancelAppointment, completeAppointment, markNoShow } from "@/lib/actions";
import SubmitButton from "@/components/SubmitButton";
import { fmtDateTime } from "@/lib/datetime";

type Appointment = {
  id: string;
  startsAt: Date;
  status: string;
  priceAtBooking: number | null;
  notes: string | null;
  client: { name: string; phone: string };
  professional: { name: string };
  service: { name: string; price: number };
  box: { name: string };
  payment: { method: string; comprobanteNro: string | null } | null;
};

const statusStyles: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-800",
  CONFIRMED: "bg-emerald-100 text-emerald-800",
  CANCELLED: "bg-neutral-200 text-neutral-600",
  COMPLETED: "bg-blue-100 text-blue-800",
  NO_SHOW: "bg-red-100 text-red-800",
};

function StatusBadge({ status, label }: { status: string; label: string }) {
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${
        statusStyles[status] ?? "bg-neutral-100 text-neutral-700"
      }`}
    >
      {label}
    </span>
  );
}

export default function AppointmentRow({
  appointment,
  statusLabel,
  canManage = true,
}: {
  appointment: Appointment;
  statusLabel: Record<string, string>;
  // Gestión de agenda (confirmar pago / cancelar) — solo OWNER/RECEPTION. El
  // PROFESSIONAL solo cierra sus turnos (completar / no-show). Es UX: el server
  // igual bloquea las acciones que su rol no puede (ADR-017 §2.e).
  canManage?: boolean;
}) {
  const isPending = appointment.status === "PENDING";
  const isConfirmed = appointment.status === "CONFIRMED";

  return (
    <div className="rounded-lg border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-medium">
            {appointment.client.name}{" "}
            <span className="text-neutral-500 font-normal">
              — {appointment.client.phone}
            </span>
          </p>
          <p className="text-sm text-neutral-500">
            {appointment.service.name} · {appointment.professional.name} ·{" "}
            {appointment.box.name}
          </p>
          <p className="text-sm text-neutral-500">{fmtDateTime(appointment.startsAt)}</p>
          <div className="flex items-center gap-2 mt-2">
            <StatusBadge
              status={appointment.status}
              label={statusLabel[appointment.status] ?? appointment.status}
            />
            <span className="text-sm font-medium">
              ${(appointment.priceAtBooking ?? appointment.service.price).toLocaleString("es-AR")}
            </span>
          </div>
          {appointment.notes && (
            <p className="text-sm text-neutral-600 mt-2 rounded-md bg-amber-50 px-2 py-1">
              📝 {appointment.notes}
            </p>
          )}
        </div>

        {isPending && canManage && (
          <div className="flex flex-col gap-2 min-w-[220px]">
            <form action={confirmPayment} className="flex gap-2">
              <input type="hidden" name="appointmentId" value={appointment.id} />
              <select name="method" className="rounded-md border px-2 py-1.5 text-sm" required>
                <option value="MERCADOPAGO">MercadoPago</option>
                <option value="EFECTIVO">Efectivo</option>
                <option value="TRANSFERENCIA">Transferencia</option>
              </select>
              <SubmitButton
                pendingText="Confirmando…"
                className="rounded-md bg-black text-white px-3 py-1.5 text-sm font-medium whitespace-nowrap"
              >
                Confirmar pago
              </SubmitButton>
            </form>
            <form action={cancelAppointment}>
              <input type="hidden" name="appointmentId" value={appointment.id} />
              <SubmitButton pendingText="Cancelando…" className="text-sm text-neutral-500 hover:text-red-600">
                Cancelar turno
              </SubmitButton>
            </form>
          </div>
        )}

        {isConfirmed && (
          <div className="flex flex-col gap-2 min-w-[220px]">
            <form action={completeAppointment}>
              <input type="hidden" name="appointmentId" value={appointment.id} />
              <SubmitButton
                pendingText="Guardando…"
                className="rounded-md bg-black text-white px-3 py-1.5 text-sm font-medium whitespace-nowrap"
              >
                Marcar como completado
              </SubmitButton>
            </form>
            {canManage && (
              <form action={cancelAppointment}>
                <input type="hidden" name="appointmentId" value={appointment.id} />
                <SubmitButton pendingText="Cancelando…" className="text-sm text-neutral-500 hover:text-red-600">
                  Cancelar turno
                </SubmitButton>
              </form>
            )}
            <form action={markNoShow}>
              <input type="hidden" name="appointmentId" value={appointment.id} />
              <SubmitButton pendingText="Guardando…" className="text-sm text-neutral-500 hover:text-red-600">
                No se presentó
              </SubmitButton>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
