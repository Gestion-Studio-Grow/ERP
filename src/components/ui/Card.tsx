import { cn } from "./cn";

// Tarjeta de superficie elevada. Reemplaza los innumerables divs con
// border/rounded/shadow inline. `flush` quita el padding para tablas o media
// a sangre; `interactive` agrega feedback de hover para tarjetas clicables.

export type CardProps = React.HTMLAttributes<HTMLDivElement> & {
  flush?: boolean;
  interactive?: boolean;
};

export function Card({ flush, interactive, className, ...props }: CardProps) {
  return (
    <div
      className={cn(
        "bg-surface-raised border border-line rounded-lg shadow-card",
        !flush && "p-5 sm:p-6",
        interactive && "transition-shadow hover:shadow-raised",
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mb-4 flex items-start justify-between gap-3", className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn("text-base font-semibold text-strong tracking-tight", className)}
      {...props}
    />
  );
}

export function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-sm text-muted mt-1 leading-relaxed", className)} {...props} />;
}
