// Piezas de servidor compartidas por las pantallas del profe: la barra de secciones con el
// número de pendientes y el chip de estado. Sin estado propio.

import Link from "next/link";
import { cn } from "@/components/ui";
import { ESTADO_LABEL, PAGO_LABEL, type EstadoClase, type EstadoPago } from "@/lib/padel/core";

export const tarjeta = "rounded-2xl border border-line bg-surface-raised p-4";

const SECCIONES = [
  { href: "/admin/clases", label: "Hoy" },
  { href: "/admin/clases/pendientes", label: "Pendientes" },
  { href: "/admin/clases/semana", label: "Semana" },
  { href: "/admin/clases/alumnos", label: "Alumnos" },
  { href: "/admin/clases/config", label: "Horarios y precios" },
];

export function BarraClases({ activa, pendientes }: { activa: string; pendientes: number }) {
  return (
    <nav aria-label="Secciones de clases" className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1">
      {SECCIONES.map((s) => (
        <Link
          key={s.href}
          href={s.href}
          aria-current={s.href === activa ? "page" : undefined}
          className={cn(
            "flex h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-medium",
            s.href === activa ? "border-transparent bg-accent text-on-accent" : "border-line bg-surface-raised text-strong",
          )}
        >
          {s.label}
          {s.href.endsWith("/pendientes") && pendientes > 0 && (
            <span
              data-qa="badge-pendientes"
              aria-label={`${pendientes} sin resolver`}
              className="inline-flex min-w-6 items-center justify-center rounded-full px-1.5 text-xs font-bold"
              style={{ background: "var(--danger)", color: "var(--surface-raised)" }}
            >
              {pendientes}
            </span>
          )}
        </Link>
      ))}
    </nav>
  );
}

const TONO: Record<EstadoClase, string> = {
  PEDIDA: "var(--warning)",
  CONFIRMADA: "var(--accent)",
  DADA: "var(--success)",
  AUSENTE: "var(--danger)",
  RECHAZADA: "var(--text-faint)",
  CANCELADA: "var(--text-faint)",
};

export const tonoEstado = (e: EstadoClase): string => TONO[e];

export function ChipEstado({ estado, pago }: { estado: EstadoClase; pago?: EstadoPago }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5 text-xs font-semibold text-strong">
      <span className="inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1">
        <span aria-hidden className="size-2 rounded-full" style={{ background: TONO[estado] }} />
        {ESTADO_LABEL[estado]}
      </span>
      {pago && ["CONFIRMADA", "DADA", "PEDIDA"].includes(estado) && (
        <span
          className="inline-flex items-center rounded-full border border-line px-2.5 py-1"
          style={pago === "PAGADO" ? { background: "var(--success-soft)" } : pago === "EN_REVISION" ? { background: "var(--warning-soft)" } : undefined}
        >
          {PAGO_LABEL[pago]}
        </span>
      )}
    </span>
  );
}
