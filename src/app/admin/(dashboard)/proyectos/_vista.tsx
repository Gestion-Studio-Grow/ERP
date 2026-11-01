// Piezas de servidor compartidas por las pantallas de proyectos. Sin estado propio.

import Link from "next/link";
import { cn } from "@/components/ui";

export const tarjeta = "rounded-2xl border border-line bg-surface-raised p-4";
export const campo = "min-h-11 w-full rounded-lg border border-line bg-surface px-3 text-sm text-strong";
export const etiqueta = "grid gap-1 text-sm font-medium text-strong";

const SECCIONES = [
  { href: "/admin/proyectos", label: "Proyectos", plata: false },
  { href: "/admin/proyectos/reportes", label: "Rentabilidad", plata: true },
  { href: "/admin/proyectos/config", label: "Configuración", plata: true },
];

export function BarraProyectos({ activa, conPlata }: { activa: string; conPlata: boolean }) {
  return (
    <nav aria-label="Secciones de proyectos" className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1">
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
