import { cn } from "./cn";

// Eyebrow: la etiqueta versalita que abre cada sección del sitio. Estaba repetida
// como objeto de estilo inline en varias páginas; ahora es un componente único.
// RFC-004 L3: usaba `text-ch-mocha` (marca de CH hardcodeada en un primitivo compartido)
// → pasa a `text-muted` (token SEMÁNTICO, tenant-agnóstico). El color de marca es del
// tenant (el acento), nunca un `--ch-*` colado en un componente del design system.
export function Eyebrow({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={cn(
        "font-body text-xs font-semibold uppercase tracking-[0.22em] text-muted",
        className,
      )}
      {...props}
    />
  );
}

export type SectionHeadingProps = {
  eyebrow?: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  align?: "left" | "center";
  className?: string;
};

// Bloque de encabezado de sección (eyebrow + título display + bajada). Fija la
// jerarquía tipográfica de una vez en lugar de recomponerla en cada sección.
export function SectionHeading({
  eyebrow,
  title,
  description,
  align = "left",
  className,
}: SectionHeadingProps) {
  return (
    <div className={cn("max-w-2xl", align === "center" && "mx-auto text-center", className)}>
      {eyebrow && <Eyebrow className="mb-3">{eyebrow}</Eyebrow>}
      <h2 className="font-display text-3xl sm:text-4xl font-medium leading-tight tracking-tight text-strong">
        {title}
      </h2>
      {description && (
        <p className="mt-4 text-base leading-relaxed text-body/90">{description}</p>
      )}
    </div>
  );
}
