"use client";

import { useMemo, useState } from "react";
import AppointmentRow from "../AppointmentRow";
import { Input } from "@/components/ui";

type Appointment = {
  id: string;
  status: string;
  client: { name: string; phone: string };
  professional: { name: string };
  [key: string]: unknown;
};

function normalize(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

export default function AppointmentsHistoryList({
  appointments,
  statusLabel,
  practica = false,
  viewer,
  permisos,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  appointments: any[];
  statusLabel: Record<string, string>;
  /** Agenda práctica: un completado del historial ofrece «Reservar el próximo». */
  practica?: boolean;
  /**
   * B2: quién mira y qué puede. Antes el historial dibujaba las tarjetas sin esto y le ofrecía a
   * la recepción cobrar o anular turnos de la profesional que cobra aparte; el servidor lo
   * rechazaba después. Con `viewer`, la fila usa la MISMA regla que el servidor
   * (`puedeCobrarEsteTurno`) y no ofrece lo que se va a rechazar.
   */
  viewer: { role: string; professionalId?: string | null };
  permisos: { gestionar: boolean; cobrar: boolean };
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = normalize(query.trim());
    if (!q) return appointments;
    return appointments.filter(
      (a: Appointment) =>
        normalize(a.client.name).includes(q) ||
        normalize(a.professional.name).includes(q) ||
        a.client.phone.includes(q)
    );
  }, [appointments, query]);

  return (
    <div>
      <Input
        type="text"
        aria-label="Buscar en el historial por cliente, profesional o teléfono"
        placeholder="Buscar por cliente, profesional o teléfono…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="mb-3"
      />
      <div className="space-y-3">
        {filtered.length === 0 && appointments.length > 0 && (
          <p className="text-sm text-muted">No encontramos turnos con ese criterio. Probá con otro nombre o con el teléfono.</p>
        )}
        {appointments.length === 0 && (
          <p className="text-sm text-muted">Todavía no hay turnos en el historial.</p>
        )}
        {filtered.map((a) => (
          <AppointmentRow
            key={a.id}
            appointment={a}
            statusLabel={statusLabel}
            practica={practica}
            viewer={viewer}
            canManage={permisos.gestionar}
            canCollect={permisos.cobrar}
          />
        ))}
      </div>
    </div>
  );
}
