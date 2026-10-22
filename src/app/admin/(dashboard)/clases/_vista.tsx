// Piezas de servidor compartidas por las pantallas del profe: el chip de estado y la tarjeta de
// una clase. Sin estado propio. (La tira de chips de arriba, BarraClases, se fue: la navegación es
// la barra de abajo, _barra-inferior.tsx, y la cabecera con campana y ajustes, _cabecera.tsx.)

import type { ReactNode } from "react";
import { cn } from "@/components/ui";
import { ESTADO_LABEL, PAGO_LABEL, type EstadoClase, type EstadoPago } from "@/lib/padel/core";

export const tarjeta = "rounded-2xl border border-line bg-surface-raised p-4";

const TONO: Record<EstadoClase, string> = {
  PEDIDA: "var(--warning)",
  CONFIRMADA: "var(--accent)",
  DADA: "var(--success)",
  AUSENTE: "var(--danger)",
  RECHAZADA: "var(--text-faint)",
  CANCELADA: "var(--text-faint)",
  SIN_RESPUESTA: "var(--text-faint)",
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
          className={cn(
            "inline-flex items-center rounded-full border border-line px-2.5 py-1",
            pago === "PAGADO" && "bg-success-soft",
            pago === "EN_REVISION" && "bg-warning-soft",
          )}
        >
          {PAGO_LABEL[pago]}
        </span>
      )}
    </span>
  );
}

/**
 * TarjetaClase — el esqueleto común de una clase en Hoy, Semana y la Bandeja (M-065: mismos
 * botones, mismo orden). El estado es el filete de color de la izquierda; la hora siempre en
 * cifras tabulares. Las acciones (Dada, No vino, Cobré, Mover, Cancelar) las pone quien la usa
 * en `children`: la Tanda 3A las arma con sus hojas.
 */
export function TarjetaClase({
  estado,
  pago,
  hora,
  nombre,
  detalle,
  destacada = false,
  children,
  qa,
}: {
  estado: EstadoClase;
  pago?: EstadoPago;
  hora: string;
  nombre: string;
  detalle?: ReactNode;
  /** La próxima clase de Hoy: hora grande y filete más grueso. */
  destacada?: boolean;
  children?: ReactNode;
  qa?: string;
}) {
  return (
    <article
      className={cn(tarjeta, "grid gap-3", destacada ? "border-l-[6px]" : "border-l-4")}
      style={{ borderLeftColor: TONO[estado] }}
      aria-label={`${hora} · ${nombre} · ${ESTADO_LABEL[estado]}`}
      data-qa={qa}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="flex min-w-0 items-baseline gap-2">
          <span className={cn("font-bold tabular-nums text-strong", destacada ? "text-[2.25rem] leading-none" : "text-lg")}>{hora}</span>
          <span className="truncate font-semibold text-strong">{nombre}</span>
        </p>
        <ChipEstado estado={estado} pago={pago} />
      </div>
      {detalle && <p className="text-sm text-muted">{detalle}</p>}
      {children}
    </article>
  );
}
