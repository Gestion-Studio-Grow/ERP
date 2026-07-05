"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui";

type Client = {
  id: string;
  name: string;
  phone: string;
  _count: { appointments: number };
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
      <Input
        type="text"
        placeholder="Buscar por nombre o teléfono..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="mb-4"
      />

      <div className="space-y-2">
        {filtered.map((c) => (
          <Link
            key={c.id}
            href={`/admin/clientes/${c.id}`}
            className="flex items-center justify-between rounded-lg border border-line bg-surface-raised px-4 py-3 hover:border-line-strong transition-colors"
          >
            <div>
              <p className="font-medium text-strong">{c.name}</p>
              <p className="text-sm text-muted">{c.phone}</p>
            </div>
            <span className="text-sm text-muted">
              {c._count.appointments} turno{c._count.appointments !== 1 ? "s" : ""}
            </span>
          </Link>
        ))}
        {filtered.length === 0 && clients.length > 0 && (
          <p className="text-sm text-muted">No encontramos clientes con ese criterio.</p>
        )}
        {clients.length === 0 && (
          <p className="text-sm text-muted">
            Todavía no hay clientes. Se cargan automáticamente cuando reservan un turno.
          </p>
        )}
      </div>
    </>
  );
}
