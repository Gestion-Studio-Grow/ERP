"use client";

import { useMemo, useState } from "react";
import AppointmentRow from "../AppointmentRow";

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
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  appointments: any[];
  statusLabel: Record<string, string>;
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
      <input
        type="text"
        placeholder="Buscar por cliente, profesional o teléfono…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="w-full rounded-md border px-3 py-2 text-sm mb-3"
      />
      <div className="space-y-3">
        {filtered.length === 0 && appointments.length > 0 && (
          <p className="text-sm text-neutral-500">No encontramos turnos con ese criterio.</p>
        )}
        {appointments.length === 0 && (
          <p className="text-sm text-neutral-500">Todavía no hay turnos en el historial.</p>
        )}
        {filtered.map((a) => (
          <AppointmentRow key={a.id} appointment={a} statusLabel={statusLabel} />
        ))}
      </div>
    </div>
  );
}
