import { cn } from "./cn";

// Agrupa un bloque de contenido de página bajo un título de sección (ADR-059
// D6) — reemplaza los títulos de sección sueltos repetidos inline en cada
// page.tsx. Token-driven vía densidad (D4): el aire entre título/contenido y
// entre secciones respira más en lite, más compacto en enterprise.
//
// NO es un Card: no agrega superficie/borde propios, es puramente
// estructural/semántico (`<section>` + heading). Para agrupar visualmente el
// contenido de adentro, envolvelo vos en <Card>.

export type SectionGroupProps = {
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Acciones de la sección (ej. "Ver todo"), a la derecha del título. */
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  /** Nivel del heading. Default h2 — PageHeader ya puso el h1 de la página. */
  headingLevel?: "h2" | "h3";
};

export function SectionGroup({
  title,
  description,
  actions,
  children,
  className,
  headingLevel = "h2",
}: SectionGroupProps) {
  const Heading = headingLevel;
  return (
    <section className={cn("mb-xl", className)}>
      <div className="mb-sm flex flex-wrap items-start justify-between gap-sm">
        <div className="min-w-0">
          <Heading
            className={cn(
              "font-semibold tracking-tight text-strong",
              headingLevel === "h2" ? "text-lg" : "text-base",
            )}
          >
            {title}
          </Heading>
          {description && (
            <p className="mt-3xs text-sm leading-relaxed text-muted">{description}</p>
          )}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-xs">{actions}</div>}
      </div>
      <div className="space-y-md">{children}</div>
    </section>
  );
}
