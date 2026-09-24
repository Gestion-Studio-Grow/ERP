"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui";
import { normalizarTelefono } from "@/lib/clientes/telefono";
import PasoVacio from "../turnos/PasoVacio";
import type { PasoVacio as Paso } from "../turnos/pasos";

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

export default function ClientsList({ clients, vacio }: { clients: Client[]; vacio?: Paso }) {
  const [query, setQuery] = useState("");

  // La clave de cada teléfono se calcula una vez por lista, no en cada tecla.
  const claves = useMemo(() => new Map(clients.map((c) => [c.id, normalizarTelefono(c.phone)])), [clients]);

  const filtered = useMemo(() => {
    const q = normalize(query.trim());
    if (!q) return clients;
    // El teléfono se compara también NORMALIZADO: la ficha guarda lo que se tipeó
    // ("11 4000-7919") y buscar "1140007919" o "+54 9 11 4000-7919" no la encontraba.
    // Sin dígitos en la búsqueda (un nombre) la clave es "" y no filtra nada por teléfono.
    const qTel = normalizarTelefono(query);
    return clients.filter(
      (c) =>
        normalize(c.name).includes(q) ||
        c.phone.includes(q) ||
        (qTel !== "" && (claves.get(c.id) ?? "").includes(qTel))
    );
  }, [clients, claves, query]);

  return (
    <>
      <Input
        type="text"
        aria-label="Buscar cliente por nombre o teléfono"
        placeholder="Buscar por nombre o teléfono…"
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
        {clients.length === 0 &&
          (vacio ? (
            <PasoVacio paso={vacio} />
          ) : (
            <p className="text-sm text-muted">
              Todavía no hay clientes. Se cargan automáticamente cuando reservan un turno.
            </p>
          ))}
      </div>
    </>
  );
}
