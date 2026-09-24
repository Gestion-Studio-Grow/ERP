"use client";

// La lista de Clientes del Inicio por apps: buscar, filtrar por situación y ordenar por la
// última visita. Recibe filas ya resumidas por el servidor (el segmento sale del motor
// comercial, src/lib/crm): al navegador no viajan los turnos, sólo lo que se muestra.
//
// Sin imports de valor de Prisma ni de servidor: es un componente cliente.

import { useMemo, useState } from "react";
import Link from "next/link";
import { Input, Select, cn } from "@/components/ui";
import { normalizarTelefono } from "@/lib/clientes/telefono";
import { fmtShortDate } from "@/lib/datetime";
import { SEGMENTOS, SEGMENTO_ETIQUETA, type Segmento } from "@/lib/crm/segmentos";
import { haceDias } from "@/lib/crm/fechas";

export type FilaCliente = {
  id: string;
  nombre: string;
  telefono: string;
  segmento: Segmento;
  diasSinVenir: number | null;
  /** ISO del próximo turno, si tiene. */
  proximoTurno: string | null;
  visitas: number;
};

type Orden = "reciente" | "vieja" | "nombre";

const TONO: Record<Segmento, string> = {
  nueva: "bg-info-soft text-info",
  frecuente: "bg-success-soft text-success",
  "en-riesgo": "bg-warning-soft text-warning",
  perdida: "bg-danger-soft text-danger",
  "sin-visitas": "bg-surface-sunken text-muted",
};

function sinTildes(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

export default function ClientesLista({ filas, visitaSingular }: { filas: FilaCliente[]; visitaSingular: string }) {
  const [q, setQ] = useState("");
  const [segmento, setSegmento] = useState<Segmento | "todos">("todos");
  const [orden, setOrden] = useState<Orden>("reciente");

  const claves = useMemo(() => new Map(filas.map((f) => [f.id, normalizarTelefono(f.telefono)])), [filas]);
  const porSegmento = useMemo(() => {
    const m = new Map<Segmento, number>();
    for (const f of filas) m.set(f.segmento, (m.get(f.segmento) ?? 0) + 1);
    return m;
  }, [filas]);

  const visibles = useMemo(() => {
    const texto = sinTildes(q.trim());
    const tel = normalizarTelefono(q);
    const filtradas = filas.filter((f) => {
      if (segmento !== "todos" && f.segmento !== segmento) return false;
      if (!texto) return true;
      return sinTildes(f.nombre).includes(texto) || f.telefono.includes(q.trim()) || (tel !== "" && (claves.get(f.id) ?? "").includes(tel));
    });
    // Sin visitas van siempre al final: no tienen "última visita" que ordenar.
    const dias = (f: FilaCliente) => f.diasSinVenir ?? Number.POSITIVE_INFINITY;
    return [...filtradas].sort((a, b) =>
      orden === "nombre"
        ? a.nombre.localeCompare(b.nombre, "es")
        : orden === "reciente"
          ? dias(a) - dias(b) || a.nombre.localeCompare(b.nombre, "es")
          : (b.diasSinVenir ?? -1) - (a.diasSinVenir ?? -1) || a.nombre.localeCompare(b.nombre, "es"),
    );
  }, [filas, claves, q, segmento, orden]);

  return (
    <>
      <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_auto]">
        <label className="block">
          <span className="sr-only">Buscar por nombre o teléfono</span>
          <Input type="search" placeholder="Buscar por nombre o teléfono…" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <label className="block">
          <span className="sr-only">Ordenar</span>
          <Select value={orden} onChange={(e) => setOrden(e.target.value as Orden)}>
            <option value="reciente">Vinieron hace poco primero</option>
            <option value="vieja">Hace más que no vienen primero</option>
            <option value="nombre">Por nombre</option>
          </Select>
        </label>
      </div>

      <div role="group" aria-label="Filtrar por situación" className="mb-4 flex flex-wrap gap-2">
        {(["todos", ...SEGMENTOS] as const).map((s) => {
          const n = s === "todos" ? filas.length : (porSegmento.get(s) ?? 0);
          if (s !== "todos" && n === 0) return null;
          const activo = segmento === s;
          return (
            <button
              key={s}
              type="button"
              aria-pressed={activo}
              onClick={() => setSegmento(s)}
              className={cn(
                "inline-flex h-11 items-center gap-1.5 rounded-full border px-4 text-sm transition-colors",
                activo ? "border-accent bg-accent-soft text-accent-ink font-medium" : "border-line bg-surface-raised text-body hover:border-line-strong",
              )}
            >
              {s === "todos" ? "Todos" : SEGMENTO_ETIQUETA[s]}
              <span className="tabular-nums text-muted">{n}</span>
            </button>
          );
        })}
      </div>

      <ul className="space-y-2">
        {visibles.map((f) => (
          <li key={f.id}>
            <Link
              href={`/admin/clientes/${f.id}`}
              className="flex min-h-11 flex-col gap-1 rounded-lg border border-line bg-surface-raised px-4 py-3 transition-colors hover:border-line-strong sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="font-medium text-strong">{f.nombre}</p>
                <p className="text-sm text-muted">{f.telefono}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-sm text-muted sm:justify-end">
                <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", TONO[f.segmento])}>
                  {SEGMENTO_ETIQUETA[f.segmento]}
                </span>
                {f.proximoTurno ? (
                  <span>turno el {fmtShortDate(f.proximoTurno)}</span>
                ) : f.diasSinVenir !== null ? (
                  <span>
                    última {visitaSingular} {haceDias(f.diasSinVenir)}
                  </span>
                ) : null}
              </div>
            </Link>
          </li>
        ))}
      </ul>
      {visibles.length === 0 && filas.length > 0 && (
        <p className="mt-2 text-sm text-muted">No hay clientes con ese criterio. Probá con otro nombre o sacá el filtro.</p>
      )}
    </>
  );
}
