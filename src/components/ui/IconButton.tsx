import { cn } from "./cn";

// Tecla de ícono: 44 × 44 siempre (el piso táctil), SIN palabra visible, así que `etiqueta` es
// obligatoria: es lo que lee el lector de pantalla y lo que aparece al dejar el puntero encima.
// Para cerrar una hoja, girar la pantalla («Mostrale»), sacar una línea del ticket.
// Presentacional, sin "use client" (anda como submit de un <form> con server actions).

export type IconButtonProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "aria-label" | "children"> & {
  /** Qué hace, en palabras («Cerrar», «Sacar Vacío del ticket»). */
  etiqueta: string;
  /** El <svg> (p. ej. `<Icono nombre="cerrar" />`). */
  icono: React.ReactNode;
  variant?: "ghost" | "tonal" | "solid";
};

export function IconButton({ etiqueta, icono, variant = "ghost", className, type = "button", ...props }: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={etiqueta}
      title={etiqueta}
      data-ui="icon-button"
      data-variant={variant}
      className={cn(
        "inline-grid size-11 shrink-0 place-items-center rounded-md text-strong transition-colors",
        "hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    >
      {icono}
    </button>
  );
}
