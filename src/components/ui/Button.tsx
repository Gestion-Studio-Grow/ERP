import type { ReactNode } from "react";
import { cn } from "./cn";
import { Icono } from "./Icono";
import { Kbd } from "./Kbd";

// Botón base del design system. Token-driven: los colores salen de la capa
// semántica (@theme), no de hex sueltos. Sirve para /admin y sitio público por
// igual. No lleva "use client" — es presentacional; anda como submit dentro de
// un <form> con server actions (ver SubmitButton para el estado pending).
//
// DISEÑO NUEVO («Renglón», ADR-099): el botón se marca con `data-ui="button"` + `data-variant`
// + `data-size`, y la hoja de la piel lo viste (la tecla) sólo bajo `data-diseno="renglon"`.
// Sin la piel, las MISMAS clases de siempre: el atributo no pinta nada. Lo nuevo es opcional y, si
// no se usa, el contenido sale tal cual (`children` directo, sin envolturas):
//   · `icono` + palabra (toda acción principal), `atajo` visible como <kbd> en la PC;
//   · `estado`: "cargando" (línea de progreso por el borde de abajo, la palabra se queda),
//     "listo" («✓ Listo» en el mismo ancho), "error" (sacudida + `motivo` debajo) y "confirmar"
//     (el peligro tonal pasa a sólido: «Tocá de nuevo para eliminar»).

type Variant = "solid" | "outline" | "ghost" | "danger" | "subtle";
type Size = "sm" | "md" | "lg";

/** Estado de la tecla bajo el diseño nuevo. */
export type EstadoBoton = "cargando" | "listo" | "error" | "confirmar";

const base =
  "inline-flex items-center justify-center gap-2 font-medium whitespace-nowrap " +
  "rounded-md transition-colors duration-150 select-none " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus " +
  // Fix 20 del gate: cursor honesto en disabled (sin pointer-events-none, que
  // lo escondía). El atributo `disabled` ya bloquea el click.
  "disabled:opacity-50 disabled:cursor-not-allowed";

const variants: Record<Variant, string> = {
  // Acción principal — acento sólido, texto claro. Disabled por TOKENS (fix 20),
  // no por opacity-50 (el acento lavado del tenant quedaba ilegible).
  solid:
    "bg-accent text-on-accent hover:bg-accent-hover active:translate-y-px shadow-xs " +
    "disabled:opacity-100 disabled:bg-surface-sunken disabled:text-faint disabled:shadow-none",
  // Acción secundaria — borde de línea, se rellena tenue en hover.
  outline: "border border-line-strong text-strong bg-surface-raised hover:bg-accent-soft active:translate-y-px",
  // Terciaria — sin caja hasta el hover.
  ghost: "text-body hover:bg-surface-sunken active:translate-y-px",
  // Destructiva.
  danger: "bg-danger text-on-accent hover:opacity-90 active:translate-y-px shadow-xs",
  // Chip suave sobre superficies claras (filtros, toggles).
  subtle: "bg-surface-sunken text-strong hover:bg-line-strong/50 active:translate-y-px",
};

const sizes: Record<Size, string> = {
  // `sm` es chico en la PC; en el celular mide 44 px igual que el resto (piso táctil de la casa,
  // lo mide el gate visual a 412 px). Un botón de 36 px en una fila de tabla es un toque errado.
  sm: "h-11 sm:h-9 px-3 text-sm",
  md: "h-11 px-5 text-sm tracking-wide",
  lg: "h-12 px-7 text-base",
};

/** Los atributos que marcan un botón para la piel. Para un <Link> con `buttonClasses(...)`. */
export function atributosBoton(variant: Variant = "solid", size: Size = "md") {
  return { "data-ui": "button", "data-variant": variant, "data-size": size } as const;
}

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  /** Ícono ANTES de la palabra (un <svg>, p. ej. `<Icono nombre="…" />` o `<IconoApp />`). */
  icono?: ReactNode;
  /** Atajo de teclado visible en la PC («F2», «Enter», «Ctrl K»). En el celular no se muestra. */
  atajo?: string;
  estado?: EstadoBoton;
  /** Con `estado="error"`: el motivo, debajo del botón, con ícono y palabra. */
  motivo?: string;
  /** Con `estado="listo"`: la palabra de «listo» (por defecto, «Listo»). */
  textoListo?: string;
};

/** Lo de adentro del botón. Sin nada nuevo, `children` tal cual (el HTML de siempre). */
function contenido(
  children: ReactNode,
  { icono, atajo, estado, textoListo }: Pick<ButtonProps, "icono" | "atajo" | "estado" | "textoListo">,
) {
  if (icono === undefined && atajo === undefined && estado !== "listo") return children;
  const cuerpo = (
    <>
      {icono}
      {children}
      {atajo && (
        <Kbd enBoton>
          {atajo}
        </Kbd>
      )}
    </>
  );
  if (estado !== "listo") return cuerpo;
  // «Listo» se apila en la MISMA celda que lo de siempre (que queda invisible): el botón no cambia
  // de ancho ni empuja lo de al lado. El lector de pantalla lee sólo «Listo».
  return (
    <span data-parte="pila" className="inline-grid">
      <span data-parte="contenido" className="invisible col-start-1 row-start-1 inline-flex items-center justify-center gap-2" aria-hidden>
        {cuerpo}
      </span>
      <span data-parte="listo" className="col-start-1 row-start-1 inline-flex items-center justify-center gap-2">
        <Icono nombre="listo" />
        {textoListo ?? "Listo"}
      </span>
    </span>
  );
}

export function Button({
  variant = "solid",
  size = "md",
  className,
  type = "button",
  icono,
  atajo,
  estado,
  motivo,
  textoListo,
  children,
  ...props
}: ButtonProps) {
  const boton = (
    <button
      type={type}
      className={cn(base, variants[variant], sizes[size], className)}
      {...atributosBoton(variant, size)}
      data-estado={estado}
      aria-busy={estado === "cargando" || undefined}
      {...props}
    >
      {contenido(children, { icono, atajo, estado, textoListo })}
    </button>
  );
  if (estado !== "error" || !motivo) return boton;
  // Error con motivo: el botón y, debajo, qué pasó (ícono + palabra), anunciado al aparecer.
  return (
    <span data-ui="boton-con-motivo" className="inline-flex flex-col items-start gap-1.5">
      {boton}
      <span data-ui="motivo-error" role="alert" className="inline-flex items-center gap-1.5 text-xs text-danger">
        <Icono nombre="error" />
        {motivo}
      </span>
    </span>
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
  return <a className={buttonClasses(variant, size, className)} {...atributosBoton(variant, size)} {...props} />;
}
