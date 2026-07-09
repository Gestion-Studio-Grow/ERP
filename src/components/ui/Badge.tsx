import { cn } from "./cn";

// Badge/pill de estado. Cada tono usa su par superficie-tenue + texto de la
// capa semántica (contraste AA). Unifica los múltiples chips de estado inline
// del backoffice (confirmado / pendiente / cancelado, etc.).

// Exportado como BadgeTone: single source of verdad de los tonos disponibles
// para cualquier otro primitivo que arme un Badge (ej. data-table-columns.tsx).
export type BadgeTone = "neutral" | "accent" | "success" | "warning" | "danger" | "info";
type Tone = BadgeTone;

const tones: Record<Tone, string> = {
  neutral: "bg-ch-linen/70 text-muted",
  accent: "bg-accent-soft text-accent",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  info: "bg-info-soft text-info",
};

export type BadgeProps = React.HTMLAttributes<HTMLSpanElement> & {
  tone?: Tone;
  dot?: boolean;
};

export function Badge({ tone = "neutral", dot, className, children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5",
        "text-xs font-medium leading-5 tracking-wide",
        tones[tone],
        className,
      )}
      {...props}
    >
      {dot && <span className="size-1.5 rounded-full bg-current opacity-70" aria-hidden />}
      {children}
    </span>
  );
}
