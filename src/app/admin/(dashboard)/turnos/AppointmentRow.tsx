"use client";

import { confirmPayment, cancelAppointment, completeAppointment, markNoShow } from "@/lib/actions";
import SubmitButton from "@/components/SubmitButton";
import RescheduleForm from "./RescheduleForm";
import { fmtDateTime } from "@/lib/datetime";
import { buttonClasses, fmtMoneyARS } from "@/components/ui";

type Appointment = {
  id: string;
  startsAt: Date;
  status: string;
  professionalId: string;
  serviceId: string;
  priceAtBooking: number | null;
  notes: string | null;
  client: { name: string; phone: string };
  professional: { name: string };
  service: { name: string; price: number };
  box: { name: string };
  payment: { method: string; comprobanteNro: string | null } | null;
};

// Estados mapeados a la capa semántica, no a colores crudos de Tailwind.
const statusStyles: Record<string, string> = {
  PENDING: "bg-warning-soft text-warning",
  CONFIRMED: "bg-success-soft text-success",
  CANCELLED: "bg-surface-sunken text-muted",
  COMPLETED: "bg-info-soft text-info",
  NO_SHOW: "bg-danger-soft text-danger",
};

function StatusBadge({ status, label }: { status: string; label: string }) {
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${
        statusStyles[status] ?? "bg-surface-sunken text-muted"
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
    <div className="rounded-lg border border-line bg-surface-raised p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-medium text-strong">
            {appointment.client.name}{" "}
            <span className="text-muted font-normal">
              — {appointment.client.phone}
            </span>
          </p>
          <p className="text-sm text-muted">
            {appointment.service.name} · {appointment.professional.name} ·{" "}
            {appointment.box.name}
          </p>
          <p className="text-sm text-muted">{fmtDateTime(appointment.startsAt)}</p>
          <div className="flex items-center gap-2 mt-2">
            <StatusBadge
              status={appointment.status}
              label={statusLabel[appointment.status] ?? appointment.status}
            />
            <span className="text-sm font-medium text-strong">
              {fmtMoneyARS(appointment.priceAtBooking ?? appointment.service.price, 0)}
            </span>
          </div>
          {appointment.notes && (
            <p className="text-sm text-body mt-2 rounded-md bg-warning-soft px-2 py-1">
              {appointment.notes}
            </p>
          )}
        </div>

        {isPending && canManage && (
          <div className="flex flex-col gap-2 min-w-[220px]">
            <form action={confirmPayment} className="flex gap-2">
              <input type="hidden" name="appointmentId" value={appointment.id} />
              <select
                name="method"
                className="rounded-md border border-line-strong bg-surface-raised px-2 py-1.5 text-sm text-strong focus:border-accent"
                required
              >
                <option value="MERCADOPAGO">Mercado Pago</option>
                <option value="EFECTIVO">Efectivo</option>
                <option value="TRANSFERENCIA">Transferencia</option>
              </select>
              <SubmitButton
                pendingText="Confirmando…"
                className={buttonClasses("solid", "sm", "whitespace-nowrap")}
              >
                Confirmar pago
              </SubmitButton>
            </form>
            <form action={cancelAppointment}>
              <input type="hidden" name="appointmentId" value={appointment.id} />
              <SubmitButton pendingText="Cancelando…" className="text-sm text-muted hover:text-danger transition-colors">
                Cancelar turno
              </SubmitButton>
            </form>
            <RescheduleForm
              appointmentId={appointment.id}
              serviceId={appointment.serviceId}
              currentProfessionalId={appointment.professionalId}
            />
          </div>
        )}

        {isConfirmed && (
          <div className="flex flex-col gap-2 min-w-[220px]">
            <form action={completeAppointment}>
              <input type="hidden" name="appointmentId" value={appointment.id} />
              <SubmitButton
                pendingText="Guardando…"
                className={buttonClasses("solid", "sm", "whitespace-nowrap")}
              >
                Marcar como completado
              </SubmitButton>
            </form>
            {canManage && (
              <form action={cancelAppointment}>
                <input type="hidden" name="appointmentId" value={appointment.id} />
                <SubmitButton pendingText="Cancelando…" className="text-sm text-muted hover:text-danger transition-colors">
                  Cancelar turno
                </SubmitButton>
              </form>
            )}
            <form action={markNoShow}>
              <input type="hidden" name="appointmentId" value={appointment.id} />
              <SubmitButton pendingText="Guardando…" className="text-sm text-muted hover:text-danger transition-colors">
                No se presentó
              </SubmitButton>
            </form>
            {canManage && (
              <RescheduleForm
                appointmentId={appointment.id}
                serviceId={appointment.serviceId}
                currentProfessionalId={appointment.professionalId}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
