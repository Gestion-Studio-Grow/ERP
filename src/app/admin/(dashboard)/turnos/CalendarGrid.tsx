"use client";

import { useState } from "react";
import AppointmentRow from "./AppointmentRow";
import { wallHourMinuteInBusinessTz, fmtTime } from "@/lib/datetime";

type Professional = { id: string; name: string; box: { name: string } | null };
type Appointment = {
  id: string;
  startsAt: Date;
  endsAt: Date;
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

const statusLabel: Record<string, string> = {
  PENDING: "Pendiente de pago",
  CONFIRMED: "Confirmado",
  CANCELLED: "Cancelado",
  COMPLETED: "Completado",
  NO_SHOW: "No se presentó",
};

// Estados de turno mapeados a la capa semántica (warning/success/info/danger),
// no a los colores crudos de Tailwind. Un cambio de paleta se hace en tokens.
const statusStyles: Record<string, string> = {
  PENDING: "bg-warning-soft text-warning border-warning/40",
  CONFIRMED: "bg-success-soft text-success border-success/40",
  COMPLETED: "bg-info-soft text-info border-info/40",
  NO_SHOW: "bg-danger-soft text-danger border-danger/40",
};

const DAY_START_HOUR = 9;
const DAY_END_HOUR = 19;
const SLOT_MIN = 30;
const SLOT_COUNT = ((DAY_END_HOUR - DAY_START_HOUR) * 60) / SLOT_MIN;

function slotIndex(date: Date) {
  // Hora de pared en la zona del negocio, no la del navegador de quien mira.
  const { hour, minute } = wallHourMinuteInBusinessTz(date);
  const minutesFromStart = (hour - DAY_START_HOUR) * 60 + minute;
  return Math.round(minutesFromStart / SLOT_MIN);
}

export default function CalendarGrid({
  professionals,
  appointments,
  canManage = true,
}: {
  professionals: Professional[];
  appointments: Appointment[];
  canManage?: boolean;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = appointments.find((a) => a.id === selectedId) ?? null;

  const timeLabels = Array.from({ length: SLOT_COUNT }, (_, i) => {
    const totalMin = DAY_START_HOUR * 60 + i * SLOT_MIN;
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  });

  if (professionals.length === 0) {
    return <p className="text-sm text-muted">No hay profesionales activos.</p>;
  }

  // En pantallas angostas la grilla horizontal no entra (columna por
  // profesional). Mostramos una agenda vertical del día en su lugar y la
  // grilla completa recién desde lg — mismo dato, presentación distinta.
  const sortedAppointments = [...appointments].sort(
    (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()
  );

  return (
    <div>
      <div className="lg:hidden space-y-3">
        {sortedAppointments.length === 0 && (
          <p className="text-sm text-muted">No hay turnos ese día.</p>
        )}
        {sortedAppointments.map((appt) => (
          <div key={appt.id}>
            <p className="text-xs font-medium text-faint mb-1">
              {fmtTime(appt.startsAt)} · {appt.professional.name}
            </p>
            <AppointmentRow appointment={appt} statusLabel={statusLabel} canManage={canManage} />
          </div>
        ))}
      </div>

      <div className="hidden lg:block overflow-x-auto rounded-lg border border-line">
        <div
          className="grid text-sm"
          style={{
            gridTemplateColumns: `56px repeat(${professionals.length}, minmax(140px, 1fr))`,
          }}
        >
          <div className="border-b border-r border-line bg-surface-sunken" />
          {professionals.map((p) => (
            <div
              key={p.id}
              className="border-b border-r last:border-r-0 border-line bg-surface-sunken px-2 py-2 text-center font-medium text-strong"
            >
              {p.name}
              <div className="text-xs font-normal text-muted">{p.box?.name}</div>
            </div>
          ))}

          {timeLabels.map((label, rowIdx) => (
            <div
              key={`row-${label}`}
              className="contents"
            >
              <div className="border-r border-b border-line px-2 py-1 text-xs text-faint text-right">
                {label}
              </div>
              {professionals.map((p) => {
                const appt = appointments.find(
                  (a) => a.professionalId === p.id && slotIndex(new Date(a.startsAt)) === rowIdx
                );
                if (appt) {
                  const durationMin =
                    (new Date(appt.endsAt).getTime() - new Date(appt.startsAt).getTime()) / 60000;
                  const span = Math.max(1, Math.round(durationMin / SLOT_MIN));
                  return (
                    <button
                      key={p.id}
                      onClick={() => setSelectedId(appt.id)}
                      style={{ gridRow: `span ${span}` }}
                      className={`border-r last:border-r-0 border-b m-0.5 rounded-md border px-2 py-1 text-left text-xs leading-tight ${
                        statusStyles[appt.status] ?? "bg-surface-sunken border-line-strong text-body"
                      } ${selectedId === appt.id ? "ring-2 ring-accent" : ""}`}
                    >
                      <div className="font-medium truncate">{appt.client.name}</div>
                      <div className="truncate opacity-80">{appt.service.name}</div>
                    </button>
                  );
                }

                const covered = appointments.some((a) => {
                  if (a.professionalId !== p.id) return false;
                  const start = slotIndex(new Date(a.startsAt));
                  const durationMin =
                    (new Date(a.endsAt).getTime() - new Date(a.startsAt).getTime()) / 60000;
                  const span = Math.max(1, Math.round(durationMin / SLOT_MIN));
                  return rowIdx > start && rowIdx < start + span;
                });
                if (covered) return null;

                return (
                  <div
                    key={p.id}
                    className="border-r last:border-r-0 border-b border-line h-8"
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <div className="hidden lg:flex mt-4 flex-wrap items-center gap-3 text-xs text-muted">
        <span className="inline-flex items-center gap-1">
          <span className="h-3 w-3 rounded bg-warning-soft border border-warning/40" /> Pendiente
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-3 w-3 rounded bg-success-soft border border-success/40" /> Confirmado
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-3 w-3 rounded bg-info-soft border border-info/40" /> Completado
        </span>
      </div>

      {selected && (
        <div className="hidden lg:block mt-6">
          <h2 className="text-sm font-medium text-strong mb-2">Turno seleccionado</h2>
          <AppointmentRow appointment={selected} statusLabel={statusLabel} canManage={canManage} />
        </div>
      )}
    </div>
  );
}
