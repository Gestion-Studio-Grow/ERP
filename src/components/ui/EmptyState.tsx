import { cn } from "./cn";

// Estado vacío estructurado (ícono + título + bajada + acción) — ADR-059 D6.
// Hoy el backoffice resuelve "no hay nada" con un <p className="text-muted">
// suelto por pantalla (ajustes/compras/catálogo/reportes…); este primitivo
// no los reemplaza en este PR (adopción es aparte, PR-3/M2), pero les da un
// techo consistente para cuando una pantalla necesite algo más que una
// línea: por qué está vacío y qué hacer al respecto.
//
// Token-driven (D4): padding/gaps respiran con la densidad. Canal neutro
// (D5 por extensión): ícono y texto en tokens neutros (faint/muted/strong),
// nunca --accent — la fuerza de color queda para la acción (`action`, ej.
// un <Button>), no para el estado vacío en sí. Argentino/Fiori: título en
// criollo claro, nunca "No data available".

export type EmptyStateProps = {
  /** Ícono decorativo (ej. un <svg>…</svg>), oculto a lectores de pantalla. */
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Acción de salida (ej. un <Button>/<ButtonLink> "Cargar el primero"). */
  action?: React.ReactNode;
  className?: string;
};

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-xs rounded-lg border border-line",
        "bg-surface-sunken px-md py-xl text-center",
        className,
      )}
    >
      {icon && (
        <span
          aria-hidden="true"
          className="grid size-10 place-items-center rounded-full bg-surface-raised text-faint"
        >
          {icon}
        </span>
      )}
      <div className="max-w-sm">
        <p className="text-sm font-medium text-strong">{title}</p>
        {description && <p className="mt-3xs text-sm text-muted">{description}</p>}
      </div>
      {action && <div className="mt-xs">{action}</div>}
    </div>
  );
}
