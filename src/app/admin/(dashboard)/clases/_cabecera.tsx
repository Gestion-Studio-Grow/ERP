// La cabecera de las pantallas del profe (matias-DISENO.md §2.1): el título a la izquierda y,
// arriba a la derecha, lo único que va ahí — la campana (Bandeja, con el número de pendientes) y
// los ajustes. Lo demás está en la barra de abajo, a mano del pulgar. Sin estado: servidor.

import Link from "next/link";
import type { ReactNode } from "react";
import { cn, Icono } from "@/components/ui";
import { textoBadge } from "./_navegacion";

const boton =
  "relative grid size-12 place-items-center rounded-xl text-strong hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

export function Cabecera({
  titulo,
  detalle,
  pendientes,
  actual,
}: {
  titulo: ReactNode;
  detalle?: ReactNode;
  pendientes: number;
  /** Si la pantalla ES la Bandeja o los Ajustes, su botón se marca (aria-current). */
  actual?: "pendientes" | "config";
}) {
  const badge = textoBadge(pendientes);
  return (
    <header className="mb-4 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold text-strong">{titulo}</h1>
        {detalle && <p className="text-sm text-muted">{detalle}</p>}
      </div>
      <nav aria-label="Bandeja y ajustes" className="-mr-2 flex shrink-0 items-center">
        <Link
          href="/admin/clases/pendientes"
          aria-current={actual === "pendientes" ? "page" : undefined}
          aria-label={badge ? `Bandeja: ${badge} esperando tu respuesta` : "Bandeja: estás al día"}
          className={cn(boton, actual === "pendientes" && "bg-accent-soft")}
          data-qa="campana"
        >
          <Icono nombre="campana" className="size-6" />
          {badge && (
            <span
              aria-hidden
              data-qa="badge-campana"
              className="absolute right-1 top-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1 text-xs font-bold tabular-nums text-surface-raised"
            >
              {badge}
            </span>
          )}
        </Link>
        <Link
          href="/admin/clases/config"
          aria-current={actual === "config" ? "page" : undefined}
          aria-label="Ajustes"
          className={cn(boton, actual === "config" && "bg-accent-soft")}
          data-qa="ajustes"
        >
          <Icono nombre="ajustes" className="size-6" />
        </Link>
      </nav>
    </header>
  );
}
