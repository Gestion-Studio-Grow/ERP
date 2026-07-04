import { cn } from "./cn";

// Botón base del design system. Token-driven: los colores salen de la capa
// semántica (@theme), no de hex sueltos. Sirve para /admin y sitio público por
// igual. No lleva "use client" — es presentacional; anda como submit dentro de
// un <form> con server actions (ver SubmitButton para el estado pending).

type Variant = "solid" | "outline" | "ghost" | "danger" | "subtle";
type Size = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 font-medium whitespace-nowrap " +
  "rounded-md transition-colors duration-150 select-none " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus " +
  "disabled:opacity-50 disabled:pointer-events-none";

const variants: Record<Variant, string> = {
  // Acción principal — acento sólido, texto claro.
  solid: "bg-accent text-on-accent hover:bg-accent-hover active:translate-y-px shadow-xs",
  // Acción secundaria — borde de línea, se rellena tenue en hover.
  outline: "border border-line-strong text-strong bg-surface-raised hover:bg-accent-soft",
  // Terciaria — sin caja hasta el hover.
  ghost: "text-body hover:bg-ch-linen/60",
  // Destructiva.
  danger: "bg-danger text-on-accent hover:opacity-90 active:translate-y-px shadow-xs",
  // Chip suave sobre superficies claras (filtros, toggles).
  subtle: "bg-ch-linen/70 text-strong hover:bg-ch-linen",
};

const sizes: Record<Size, string> = {
  sm: "h-9 px-3 text-sm",
  md: "h-11 px-5 text-sm tracking-wide",
  lg: "h-12 px-7 text-base",
};

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
};

export function Button({
  variant = "solid",
  size = "md",
  className,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(base, variants[variant], sizes[size], className)}
      {...props}
    />
  );
}

// Variante <a>/Link con el mismo tratamiento visual (para navegaciones).
export type ButtonLinkProps = React.AnchorHTMLAttributes<HTMLAnchorElement> & {
  variant?: Variant;
  size?: Size;
};

export function buttonClasses(variant: Variant = "solid", size: Size = "md", className?: string) {
  return cn(base, variants[variant], sizes[size], className);
}

export function ButtonLink({ variant = "solid", size = "md", className, ...props }: ButtonLinkProps) {
  return <a className={buttonClasses(variant, size, className)} {...props} />;
}
