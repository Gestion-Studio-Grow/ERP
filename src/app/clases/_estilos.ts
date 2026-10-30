// Las clases de las pantallas públicas del profe (turnero, «Mis clases», link del alumno), en un
// solo lugar: todo pinta con `var(--padel-*)` (lo inyecta <Piel>) o con tokens del tema, nunca con
// un hex suelto en un `style` (matias-DISENO.md §1.2 · M-052). Escala de la placa de horarios
// (fronts/agendaprofe/DISENO.md §4): la acción principal 64 px en el celular y 56 en la compu, las
// horas en chips de 56 px, la segunda acción 52 px, bordes de 1,5 px y sin sombras. El chip apretado
// hunde 1 px (sin movimiento si el teléfono pide menos).

import { cn } from "@/components/ui/cn";

/** Foco visible (teclado) del color de la cancha. */
export const foco = "outline-offset-2 focus-visible:outline-2 focus-visible:outline-[var(--padel-cancha)]";

const base = cn(
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-[0.875rem] px-4 text-[1.0625rem] font-semibold no-underline",
  "cursor-pointer select-none transition-transform duration-[var(--dur-1,120ms)] active:translate-y-px motion-reduce:transition-none motion-reduce:active:translate-y-0",
  "disabled:cursor-not-allowed disabled:opacity-60",
  foco,
);

/** La acción principal (64 px en el celular, 56 en la compu; llena de cancha). */
export const botonPrincipal = cn(
  base,
  "min-h-16 w-full bg-[var(--padel-cancha)] text-[clamp(1.125rem,1.3vw,1.3125rem)] font-bold text-[var(--padel-sobre-cancha)] lg:min-h-14",
);
/** Enviando (aria-busy): el botón queda a pleno color, con la rueda, para que en el celular se note que
 *  el toque llegó (gris = «no se puede», que es otra cosa). No acepta otro toque mientras dura. */
export const ocupado = "aria-busy:pointer-events-none aria-busy:cursor-progress aria-busy:opacity-100";
/** Llena, de 52 px. */
export const botonLleno = cn(base, "min-h-[3.25rem] bg-[var(--padel-cancha)] font-bold text-[var(--padel-sobre-cancha)]");
/** Con borde (la segunda acción), 52 px. */
export const botonBorde = cn(base, "min-h-[3.25rem] border-2 border-[var(--padel-cancha)] bg-[var(--padel-superficie)] text-[var(--padel-cancha)]");
/** Para lo que se deshace o se pierde (cancelar). */
export const botonPeligro = cn(base, "min-h-[3.25rem] border-2 border-[var(--padel-peligro)] bg-[var(--padel-superficie)] text-[var(--padel-peligro)]");
/** Un link de texto con área táctil de 48 px. */
export const botonTexto = cn(base, "px-2 font-semibold text-[var(--padel-suave)] underline underline-offset-2");

/** Chip de hora, de «somos» o de sugerida: 56 px de alto, número tabular; apretado = lleno de cancha. */
export const chip = (activo: boolean) =>
  cn(
    "pz-num inline-flex min-h-14 min-w-[5.5rem] shrink-0 items-center justify-center gap-1.5 rounded-[0.875rem] border-[1.5px] px-3 text-[clamp(1.125rem,1.4vw,1.375rem)] font-semibold",
    "cursor-pointer transition-transform duration-[var(--dur-1,120ms)] active:translate-y-px motion-reduce:transition-none motion-reduce:active:translate-y-0",
    foco,
    activo
      ? "border-[var(--padel-cancha)] bg-[var(--padel-cancha)] text-[var(--padel-sobre-cancha)]"
      : "border-[var(--padel-linea)] bg-[var(--padel-superficie)] text-[var(--padel-texto)]",
  );

/** Tarjeta: borde de 1,5 px, radio 20, sin sombra (§1.2). */
export const caja = "rounded-[1.25rem] border-[1.5px] border-[var(--padel-linea)] bg-[var(--padel-superficie)] p-4 sm:p-5";
/** Título de una tarjeta, en la condensada. */
export const tituloCaja = "pz-display mb-3 text-[1.625rem] font-bold leading-[1.05]";
/** Título de sección («¿Qué día?», «Esta semana»). */
export const tituloSeccion = "pz-display text-[clamp(1.625rem,2.6vw,2.5rem)] font-bold leading-[1.02]";
/** La línea chica de arriba de una sección («TU PRÓXIMA»). */
export const antetitulo = "text-[clamp(0.8125rem,1vw,0.9375rem)] font-semibold uppercase tracking-[0.2em] text-[var(--padel-suave)]";

export const etiqueta = "mb-1.5 block text-[0.9375rem] font-semibold";
export const campo = cn(
  "block min-h-14 w-full rounded-[0.875rem] border-[1.5px] border-[var(--padel-linea)] bg-[var(--padel-superficie)] px-4 text-[1.0625rem] text-[var(--padel-texto)]",
  foco,
);
/** La ayuda debajo de un campo (en vez de un número de ejemplo como placeholder, §10). */
export const ayuda = "mt-1.5 text-[0.9375rem] text-[var(--padel-suave)]";

/** Mensaje de error (va con role="alert"). */
export const alerta = "rounded-[0.875rem] border-[1.5px] border-[var(--padel-peligro)] bg-[var(--padel-peligro-suave)] p-3 text-base font-semibold text-[var(--padel-peligro)]";
/** Mensaje de que salió bien (va con role="status"). */
export const listo = "rounded-[0.875rem] bg-[var(--padel-ok-suave)] p-3 text-base font-semibold text-[var(--padel-texto)]";
