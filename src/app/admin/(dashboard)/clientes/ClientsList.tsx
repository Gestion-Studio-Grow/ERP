"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

type Client = {
  id: string;
  name: string;
  phone: string;
  appointments: { id: string }[];
};

function normalize(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

export default function ClientsList({ clients }: { clients: Client[] }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = normalize(query.trim());
    if (!q) return clients;
    return clients.filter(
      (c) => normalize(c.name).includes(q) || c.phone.includes(q)
    );
  }, [clients, query]);

  return (
    <>
      <input
        type="text"
        placeholder="Buscar por nombre o teléfono..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="w-full rounded-md border px-3 py-2 text-sm mb-4"
      />

      <div className="space-y-2">
        {filtered.map((c) => (
          <Link
            key={c.id}
            href={`/admin/clientes/${c.id}`}
            className="flex items-center justify-between rounded-lg border px-4 py-3 hover:border-neutral-400 transition-colors"
          >
            <div>
              <p className="font-medium">{c.name}</p>
              <p className="text-sm text-neutral-500">{c.phone}</p>
            </div>
            <span className="text-sm text-neutral-500">
              {c.appointments.length} turno{c.appointments.length !== 1 ? "s" : ""}
            </span>
          </Link>
        ))}
        {filtered.length === 0 && clients.length > 0 && (
          <p className="text-sm text-neutral-500">No encontramos clientes con ese criterio.</p>
        )}
        {clients.length === 0 && (
          <p className="text-sm text-neutral-500">
            Todavía no hay clientes. Se cargan automáticamente cuando reservan un turno.
          </p>
        )}
      </div>
    </>
  );
}
