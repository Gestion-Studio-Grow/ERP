// Las clases de las pantallas públicas del profe (turnero, «Mis clases», link del alumno), en un
// solo lugar: todo pinta con `var(--padel-*)` (lo inyecta <Piel>) o con tokens del tema, nunca con
// un hex suelto en un `style` (matias-DISENO.md §1.2 · M-052). Áreas táctiles de 48 px; la acción
// principal, 56 px. El chip apretado hunde 1 px (sin movimiento si el teléfono pide menos).

import { cn } from "@/components/ui/cn";

/** Foco visible (teclado) del color de la cancha. */
export const foco = "outline-offset-2 focus-visible:outline-2 focus-visible:outline-[var(--padel-cancha)]";

const base = cn(
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-[0.875rem] px-4 text-base font-bold no-underline",
  "cursor-pointer select-none transition-transform duration-[var(--dur-1,120ms)] active:translate-y-px motion-reduce:transition-none motion-reduce:active:translate-y-0",
  "disabled:cursor-not-allowed disabled:opacity-60",
  foco,
);

/** La acción principal (56 px, llena). */
export const botonPrincipal = cn(base, "min-h-14 w-full bg-[var(--padel-cancha)] text-lg text-[var(--padel-sobre-cancha)]");
/** Llena, de 48 px. */
export const botonLleno = cn(base, "bg-[var(--padel-cancha)] text-[var(--padel-sobre-cancha)]");
/** Con borde (la segunda acción). */
export const botonBorde = cn(base, "border-2 border-[var(--padel-cancha)] bg-[var(--padel-superficie)] text-[var(--padel-cancha)]");
/** Para lo que se deshace o se pierde (cancelar). */
export const botonPeligro = cn(base, "border-2 border-[var(--padel-peligro)] bg-[var(--padel-superficie)] text-[var(--padel-peligro)]");
/** Un link de texto con área táctil de 48 px. */
export const botonTexto = cn(base, "px-2 font-semibold text-[var(--padel-suave)] underline underline-offset-2");

/** Chip de día, hora o tipo de clase: 48 px; apretado = lleno de cancha. */
export const chip = (activo: boolean) =>
  cn(
    "inline-flex min-h-12 min-w-12 shrink-0 items-center justify-center rounded-[var(--radius,0.75rem)] border-2 px-3 text-base font-semibold tabular-nums",
    "cursor-pointer transition-transform duration-[var(--dur-1,120ms)] active:translate-y-px motion-reduce:transition-none motion-reduce:active:translate-y-0",
    foco,
    activo
      ? "border-[var(--padel-cancha)] bg-[var(--padel-cancha)] text-[var(--padel-sobre-cancha)]"
      : "border-[var(--padel-linea)] bg-[var(--padel-superficie)] text-[var(--padel-texto)]",
  );

/** Tarjeta: borde fino, sin sombra (§1.2). */
export const caja = "rounded-[var(--radius-lg,1rem)] border border-[var(--padel-linea)] bg-[var(--padel-superficie)] p-4";
/** Título de una tarjeta. */
export const tituloCaja = "mb-3 text-lg font-bold";
/** La línea chica de arriba de una sección («TU PRÓXIMA»). */
export const antetitulo = "text-xs font-semibold uppercase tracking-[0.14em] text-[var(--padel-suave)]";

export const etiqueta = "mb-1.5 block text-sm font-semibold";
export const campo = cn(
  "block min-h-12 w-full rounded-[0.75rem] border border-[var(--padel-linea)] bg-[var(--padel-superficie)] px-3.5 text-base text-[var(--padel-texto)]",
  foco,
);

/** Mensaje de error (va con role="alert"). */
export const alerta = "rounded-[0.75rem] bg-[var(--padel-peligro-suave)] p-3 text-base font-semibold text-[var(--padel-peligro)]";
/** Mensaje de que salió bien (va con role="status"). */
export const listo = "rounded-[0.75rem] bg-[var(--padel-ok-suave)] p-3 text-base font-semibold text-[var(--padel-texto)]";
