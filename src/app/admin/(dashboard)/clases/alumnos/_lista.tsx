"use client";

// La lista de Alumnos: cada fila abre la ficha (M-071). De a 40, con «Ver más» (B5: el tope de
// 60 se fue; el buscador consulta al servidor). Lo que debe va en rojo y primero, porque es lo
// que el profe mira.

import Link from "next/link";
import { useState, useTransition } from "react";
import { buttonClasses, cn, Plata } from "@/components/ui";
import { diaHumano } from "@/lib/padel/core";
import { masAlumnos } from "./_mas";
import type { FilaAlumno } from "./_fila";
import { ErrorEnLinea } from "./_usar-accion";

export function ListaAlumnos({ iniciales, siguiente, q }: { iniciales: FilaAlumno[]; siguiente: string | null; q: string }) {
  const [items, setItems] = useState(iniciales);
  const [cursor, setCursor] = useState(siguiente);
  const [pendiente, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const cargar = () =>
    start(async () => {
      if (!cursor) return;
      setError(null);
      try {
        const r = await masAlumnos(q, cursor);
        setItems((prev) => [...prev, ...r.items.filter((x) => !prev.some((p) => p.id === x.id))]);
        setCursor(r.siguiente);
      } catch {
        setError("No pudimos traer más. Probá de nuevo.");
      }
    });

  return (
    <div className="grid gap-3">
      <ul className="grid gap-2">
        {items.map((a) => (
          <li key={a.id}>
            <FilaDeAlumno a={a} />
          </li>
        ))}
      </ul>
      {cursor && (
        <button type="button" onClick={cargar} disabled={pendiente} className={cn(buttonClasses("outline", "lg"), "h-12 w-full justify-center")} data-qa="ver-mas-alumnos">
          {pendiente ? "Trayendo…" : "Ver más alumnos"}
        </button>
      )}
      <ErrorEnLinea texto={error} />
    </div>
  );
}

export function FilaDeAlumno({ a }: { a: Pick<FilaAlumno, "id" | "nombre" | "dadas" | "ultima" | "debe" | "clasesQueDebe" | "enRevision" | "aFavor" | "nivel"> }) {
  return (
    <Link
      href={`/admin/clases/alumnos/${a.id}`}
      className="grid min-h-14 gap-0.5 rounded-2xl border border-line bg-surface-raised px-4 py-3 hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      data-qa="alumno"
    >
      <span className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="font-semibold text-strong">{a.nombre}</span>
        {a.debe > 0 ? (
          <span className="text-sm font-semibold text-danger">
            debe <Plata valor={a.debe} sinCentavos tono="peligro" /> · {a.clasesQueDebe} clase{a.clasesQueDebe === 1 ? "" : "s"}
          </span>
        ) : (
          <span className="text-sm text-muted">al día</span>
        )}
      </span>
      <span className="text-sm text-muted">
        {[
          a.dadas >= 0 ? `${a.dadas} clase${a.dadas === 1 ? "" : "s"}` : null,
          a.nivel || null,
          a.ultima ? `última: ${diaHumano(new Date(a.ultima))}` : null,
          a.enRevision > 0 ? "comprobante por revisar" : null,
        ]
          .filter(Boolean)
          .join(" · ")}
        {a.aFavor > 0 && (
          <span className="text-success">
            {" "}· a favor <Plata valor={a.aFavor} sinCentavos tono="cobrado" />
          </span>
        )}
      </span>
    </Link>
  );
}
