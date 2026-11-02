// Piezas de servidor compartidas por las pantallas de proyectos. Sin estado propio.

import Link from "next/link";
import { cn } from "@/components/ui";

export const tarjeta = "rounded-2xl border border-line bg-surface-raised p-4";
export const campo = "min-h-11 w-full min-w-0 rounded-lg border border-line bg-surface px-3 text-sm text-strong";
export const etiqueta = "grid gap-1 text-sm font-medium text-strong";

/** La navegación vive en la barra lateral del layout. Queda para no tocar cada pantalla vieja. */
export function BarraProyectos(_: { activa: string; conPlata: boolean }) {
  return null;
}
