import { cn } from "./cn";

// Chip de filtro, con conteo: «Para hoy 12», «Sin confirmar 3». Es un botón con `aria-pressed`
// (prendido / apagado); para navegar entre vistas, `ChipLink` con `aria-current`. Prendido se ve en
// tinta (negro sobre aluminio, blanco sobre grafito), no con un pastel: se lee a un metro.
// Presentacional, sin "use client".

type Comun = {
  /** Cuántos hay detrás del filtro. */
  conteo?: number;
  icono?: React.ReactNode;
};

const clases =
  "inline-flex min-h-11 items-center gap-1.5 rounded-full border border-line-strong bg-surface-raised px-3.5 text-sm font-medium text-body " +
  "sm:min-h-9 hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus " +
  "aria-pressed:bg-surface-inverted aria-pressed:text-surface aria-[current=page]:bg-surface-inverted aria-[current=page]:text-surface";

export type ChipProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "aria-pressed"> &
  Comun & {
    /** ¿Está prendido el filtro? */
    prendido?: boolean;
  };

export function Chip({ conteo, icono, prendido = false, className, children, type = "button", ...props }: ChipProps) {
  return (
    <button type={type} data-ui="chip" aria-pressed={prendido} className={cn(clases, className)} {...props}>
      {icono}
      {children}
      {conteo !== undefined && <span data-parte="conteo">{conteo}</span>}
    </button>
  );
}

export type ChipLinkProps = React.AnchorHTMLAttributes<HTMLAnchorElement> &
  Comun & {
    /** ¿Es la vista en la que está parada? */
    actual?: boolean;
  };

/** El chip como enlace (una vista de la lista). Para un <Link> de Next, usar `chipLinkAtributos`. */
export function ChipLink({ conteo, icono, actual, className, children, ...props }: ChipLinkProps) {
  return (
    <a data-ui="chip" aria-current={actual ? "page" : undefined} className={cn(clases, className)} {...props}>
      {icono}
      {children}
      {conteo !== undefined && <span data-parte="conteo">{conteo}</span>}
    </a>
  );
}

export function chipLinkAtributos(actual: boolean, className?: string) {
  return { "data-ui": "chip", "aria-current": actual ? ("page" as const) : undefined, className: cn(clases, className) };
}
