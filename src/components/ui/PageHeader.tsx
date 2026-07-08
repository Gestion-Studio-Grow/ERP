import { cn } from "./cn";

// Encabezado de página del backoffice (ADR-059 D6) — reemplaza el patrón
// repetido `<h1 className="text-2xl font-semibold mb-1">` + `<p
// className="text-muted">` duplicado hoy en cada page.tsx de /admin (el
// "header pobre" que este ADR fija). Token-driven vía la escala de densidad
// (D4): mismo componente, más compacto en enterprise (`--density:1`, default)
// o más espacioso en lite (`--density:1.32`) según el `data-density` que
// aplique el layout — cero hex suelto, todo semántico (text-strong/text-muted).
//
// Primitivo de presentación puro: no gatea por perfil ni sabe de flags: el
// slot `badge` es para que el LLAMADOR le pase un <ProfileBadge/> si aplica.

export type PageHeaderProps = {
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Insignia de edición (ProfileBadge) u otro indicador corto junto al título. */
  badge?: React.ReactNode;
  /** Botones/acciones de la página (a la derecha en desktop, debajo en mobile). */
  actions?: React.ReactNode;
  className?: string;
};

export function PageHeader({ title, description, badge, actions, className }: PageHeaderProps) {
  return (
    <header
      className={cn(
        "mb-lg flex flex-col gap-sm sm:flex-row sm:items-start sm:justify-between",
        className,
      )}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-sm">
          <h1 className="text-2xl font-semibold tracking-tight text-strong">{title}</h1>
          {badge}
        </div>
        {description && (
          <p className="mt-2xs max-w-2xl text-sm leading-relaxed text-muted">{description}</p>
        )}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-sm">{actions}</div>}
    </header>
  );
}
