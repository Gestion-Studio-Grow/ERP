// Piezas de servidor compartidas por las pantallas del taller: la barra de secciones, la
// chapa patente y el color de cada estado. Sin estado propio.

import Link from "next/link";
import { cn } from "@/components/ui";
import { ESTADO_LABEL, formatoPatente, mostrarPatente, type EstadoOrden } from "@/lib/taller/core";

export const tarjeta = "rounded-2xl border border-line bg-surface-raised p-4";

const SECCIONES = [
  { href: "/admin/taller", label: "Hoy", plata: false },
  { href: "/admin/taller/vehiculos", label: "Autos y clientes", plata: false },
  { href: "/admin/taller/avisos", label: "Avisos", plata: true },
  { href: "/admin/taller/reportes", label: "Reportes", plata: true },
  { href: "/admin/taller/config", label: "Configuración", plata: true },
];

export function BarraTaller({ activa, conPlata }: { activa: string; conPlata: boolean }) {
  return (
    <nav aria-label="Secciones del taller" className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1">
      {SECCIONES.filter((s) => conPlata || !s.plata).map((s) => (
        <Link
          key={s.href}
          href={s.href}
          aria-current={s.href === activa ? "page" : undefined}
          className={cn(
            "flex h-11 shrink-0 items-center rounded-full border px-4 text-sm font-medium",
            s.href === activa ? "border-transparent bg-accent text-on-accent" : "border-line bg-surface-raised text-strong",
          )}
        >
          {s.label}
        </Link>
      ))}
    </nav>
  );
}

/** La patente como chapa: negra la vieja, blanca con franja azul la Mercosur. */
export function Patente({ valor, grande }: { valor: string; grande?: boolean }) {
  const mercosur = formatoPatente(valor)?.includes("mercosur");
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border-2 font-mono font-bold tracking-widest",
        grande ? "px-3 py-1 text-xl" : "px-2 py-0.5 text-sm",
      )}
      style={
        mercosur
          ? { background: "#fff", color: "#111", borderColor: "#111", borderTopColor: "#1d4ed8", borderTopWidth: grande ? 7 : 5 }
          : { background: "#111", color: "#fff", borderColor: "#fff", outline: "1px solid #111" }
      }
    >
      {mostrarPatente(valor)}
    </span>
  );
}

const TONO: Record<EstadoOrden, string> = {
  RECIBIDO: "var(--info)",
  DIAGNOSTICO: "var(--info)",
  ESPERANDO_APROBACION: "var(--warning)",
  ESPERANDO_REPUESTOS: "var(--warning)",
  EN_REPARACION: "var(--accent)",
  LISTO: "var(--success)",
  ENTREGADO: "var(--text-faint)",
};

export const tonoEstado = (e: EstadoOrden): string => TONO[e];

export function ChipEstado({ estado }: { estado: EstadoOrden }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-xs font-semibold text-strong">
      <span aria-hidden className="size-2 rounded-full" style={{ background: TONO[estado] }} />
      {ESTADO_LABEL[estado]}
    </span>
  );
}
